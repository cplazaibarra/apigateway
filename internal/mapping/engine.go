package mapping

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/tidwall/gjson"
	"order-integration-hub/internal/domain"
)

// MappingEngine is responsible for interpreting raw payloads and transforming them into CanonicalOrders
type MappingEngine interface {
	Transform(ctx context.Context, rawPayload []byte, mappings []domain.FieldMapping) (*domain.CanonicalOrder, []domain.MappingWarning, error)
	ValidateMappings(mappings []domain.FieldMapping) []domain.MappingWarning
}

type DefaultMappingEngine struct{}

func NewDefaultMappingEngine() *DefaultMappingEngine {
	return &DefaultMappingEngine{}
}

// Transform takes a raw JSON payload and applies active field mappings to produce a CanonicalOrder
func (e *DefaultMappingEngine) Transform(ctx context.Context, rawPayload []byte, mappings []domain.FieldMapping) (*domain.CanonicalOrder, []domain.MappingWarning, error) {
	if len(rawPayload) == 0 {
		return nil, []domain.MappingWarning{{
			WarningType: "EMPTY_PAYLOAD",
			Message:     "El payload raw está vacío",
			Severity:    "ERROR",
		}}, fmt.Errorf("payload raw vacío")
	}

	if !gjson.ValidBytes(rawPayload) {
		return nil, []domain.MappingWarning{{
			WarningType: "INVALID_JSON",
			Message:     "El payload raw no es un JSON válido",
			Severity:    "ERROR",
		}}, fmt.Errorf("JSON inválido")
	}

	var warnings []domain.MappingWarning
	canonical := &domain.CanonicalOrder{
		RawPayload: json.RawMessage(rawPayload),
		Status:     "PENDING",
		Currency:   "USD",
		CreatedAt:  time.Now(),
	}

	// Filter enabled mappings and separate root mappings from array (items[]) mappings
	rootMappings := make(map[string]domain.FieldMapping)
	itemMappings := make(map[string]domain.FieldMapping)

	for _, m := range mappings {
		if !m.Enabled {
			continue
		}
		if strings.HasPrefix(m.CanonicalField, "items[].") {
			itemMappings[m.CanonicalField] = m
		} else {
			rootMappings[m.CanonicalField] = m
		}
	}

	// 1. Process Root Canonical Fields
	for cf, m := range rootMappings {
		val, w := e.resolveFieldValue(rawPayload, m)
		if w != nil {
			warnings = append(warnings, *w)
		}

		if val == "" && m.Required {
			warnings = append(warnings, domain.MappingWarning{
				CanonicalField: cf,
				SourcePath:     m.SourcePath,
				WarningType:    "REQUIRED_FIELD_MISSING",
				Message:        fmt.Sprintf("Campo requerido '%s' no pudo ser extraído de '%s'", cf, m.SourcePath),
				Severity:       "ERROR",
			})
		}

		e.assignRootField(canonical, cf, val, &warnings)
	}

	// 2. Process Line Items (Array handling)
	if len(itemMappings) > 0 {
		items, itemWarnings := e.resolveLineItems(rawPayload, itemMappings)
		canonical.Items = items
		warnings = append(warnings, itemWarnings...)
	}

	// Compute Subtotal & Total if not explicitly provided
	if canonical.Total == 0 && len(canonical.Items) > 0 {
		var calcTotal float64
		for _, it := range canonical.Items {
			calcTotal += it.Total
		}
		canonical.Total = math.Round(calcTotal*100) / 100
	}
	if canonical.Subtotal == 0 {
		canonical.Subtotal = canonical.Total - canonical.Tax
	}

	// Fallback Order ID / Number if empty
	if canonical.ExternalID == "" {
		canonical.ExternalID = canonical.OrderNumber
	}
	if canonical.OrderNumber == "" {
		canonical.OrderNumber = canonical.ExternalID
	}
	if canonical.OrderNumber == "" {
		canonical.OrderNumber = "ORD-" + strconv.FormatInt(time.Now().Unix(), 10)
	}

	return canonical, warnings, nil
}

// resolveFieldValue extracts and applies transformation for a single field
func (e *DefaultMappingEngine) resolveFieldValue(rawJSON []byte, m domain.FieldMapping) (string, *domain.MappingWarning) {
	var rawStr string
	var found bool

	// Handle CONCAT transformation with multiple paths in params
	if m.Transformation == domain.TransformConcat && len(m.TransformationParams) > 0 {
		var params struct {
			Paths     []string `json:"paths"`
			Separator string   `json:"separator"`
		}
		if err := json.Unmarshal(m.TransformationParams, &params); err == nil && len(params.Paths) > 0 {
			var parts []string
			for _, p := range params.Paths {
				res := gjson.GetBytes(rawJSON, p)
				if res.Exists() && strings.TrimSpace(res.String()) != "" {
					parts = append(parts, strings.TrimSpace(res.String()))
				}
			}
			if len(parts) > 0 {
				sep := " "
				if params.Separator != "" {
					sep = params.Separator
				}
				rawStr = strings.Join(parts, sep)
				found = true
			}
		}
	}

	if !found {
		// Standard JSON path lookup with gjson
		normPath := normalizePath(m.SourcePath)
		res := gjson.GetBytes(rawJSON, normPath)
		if res.Exists() {
			found = true
			rawStr = res.String()
		}
	}

	// If not found, check if default value exists
	if !found || strings.TrimSpace(rawStr) == "" {
		if m.DefaultValue != "" {
			return m.DefaultValue, nil
		}
		if m.Required {
			return "", &domain.MappingWarning{
				CanonicalField: m.CanonicalField,
				SourcePath:     m.SourcePath,
				WarningType:    "SOURCE_FIELD_NOT_FOUND",
				Message:        fmt.Sprintf("Campo origen '%s' no encontrado en el JSON", m.SourcePath),
				Severity:       "WARNING",
			}
		}
		return "", nil
	}

	// Apply Transformations
	transformedVal, warn := e.applyTransformation(rawStr, m)
	return transformedVal, warn
}

// applyTransformation executes safe Go transformation logic
func (e *DefaultMappingEngine) applyTransformation(val string, m domain.FieldMapping) (string, *domain.MappingWarning) {
	val = strings.TrimSpace(val)

	switch m.Transformation {
	case domain.TransformCopy, "":
		return val, nil

	case domain.TransformDefault:
		if val == "" {
			return m.DefaultValue, nil
		}
		return val, nil

	case domain.TransformUppercase:
		return strings.ToUpper(val), nil

	case domain.TransformLowercase:
		return strings.ToLower(val), nil

	case domain.TransformTrim:
		return strings.TrimSpace(val), nil

	case domain.TransformNumber:
		f, err := parseCleanNumber(val)
		if err != nil {
			return val, &domain.MappingWarning{
				CanonicalField: m.CanonicalField,
				SourcePath:     m.SourcePath,
				WarningType:    "TYPE_CONVERSION_ERROR",
				Message:        fmt.Sprintf("No se pudo convertir '%s' a número", val),
				Severity:       "WARNING",
			}
		}
		return fmt.Sprintf("%.2f", f), nil

	case domain.TransformBoolean:
		lower := strings.ToLower(val)
		if lower == "true" || lower == "1" || lower == "yes" || lower == "si" || lower == "on" {
			return "true", nil
		}
		return "false", nil

	case domain.TransformStatusMap:
		if len(m.TransformationParams) > 0 {
			var statusMap map[string]string
			if err := json.Unmarshal(m.TransformationParams, &statusMap); err == nil {
				lower := strings.ToLower(val)
				if target, ok := statusMap[lower]; ok {
					return target, nil
				}
				if target, ok := statusMap[val]; ok {
					return target, nil
				}
				if def, ok := statusMap["default"]; ok {
					return def, nil
				}
			}
		}
		return strings.ToUpper(val), nil

	case domain.TransformLookup:
		if len(m.TransformationParams) > 0 {
			var lookup map[string]string
			if err := json.Unmarshal(m.TransformationParams, &lookup); err == nil {
				if target, ok := lookup[val]; ok {
					return target, nil
				}
				if def, ok := lookup["_default"]; ok {
					return def, nil
				}
			}
		}
		return val, nil

	case domain.TransformDateFormat:
		parsedTime, err := parseFlexibleDate(val)
		if err != nil {
			return val, &domain.MappingWarning{
				CanonicalField: m.CanonicalField,
				SourcePath:     m.SourcePath,
				WarningType:    "INVALID_DATE",
				Message:        fmt.Sprintf("Formato de fecha inválido '%s'", val),
				Severity:       "WARNING",
			}
		}
		return parsedTime.Format(time.RFC3339), nil

	case domain.TransformRegexReplace:
		if len(m.TransformationParams) > 0 {
			var regParams struct {
				Pattern     string `json:"pattern"`
				Replacement string `json:"replacement"`
			}
			if err := json.Unmarshal(m.TransformationParams, &regParams); err == nil && regParams.Pattern != "" {
				if re, err := regexp.Compile(regParams.Pattern); err == nil {
					return re.ReplaceAllString(val, regParams.Replacement), nil
				}
			}
		}
		return val, nil

	default:
		return val, nil
	}
}

// resolveLineItems processes array of items dynamically
func (e *DefaultMappingEngine) resolveLineItems(rawJSON []byte, itemMappings map[string]domain.FieldMapping) ([]domain.CanonicalOrderItem, []domain.MappingWarning) {
	var warnings []domain.MappingWarning

	// Detect array root path from source paths (e.g. line_items, items, products, order_lines)
	arraySourceRoot := "line_items"
	for _, m := range itemMappings {
		src := normalizePath(m.SourcePath)
		if parts := strings.Split(src, "."); len(parts) > 1 {
			arraySourceRoot = strings.TrimSuffix(parts[0], "[]")
			arraySourceRoot = strings.TrimSuffix(arraySourceRoot, "#")
			break
		}
	}

	res := gjson.GetBytes(rawJSON, arraySourceRoot)
	if !res.Exists() || !res.IsArray() {
		// Try fallback array keys
		for _, alt := range []string{"items", "line_items", "products", "details", "lines"} {
			altRes := gjson.GetBytes(rawJSON, alt)
			if altRes.Exists() && altRes.IsArray() {
				res = altRes
				break
			}
		}
	}

	if !res.Exists() || !res.IsArray() {
		warnings = append(warnings, domain.MappingWarning{
			CanonicalField: "items[]",
			SourcePath:     arraySourceRoot,
			WarningType:    "ARRAY_MAPPING_ERROR",
			Message:        fmt.Sprintf("Arreglo de productos '%s' no encontrado en el JSON", arraySourceRoot),
			Severity:       "WARNING",
		})
		return nil, warnings
	}

	var items []domain.CanonicalOrderItem
	res.ForEach(func(_, rawItem gjson.Result) bool {
		itemBytes := []byte(rawItem.Raw)
		var item domain.CanonicalOrderItem

		for cf, m := range itemMappings {
			fieldKey := strings.TrimPrefix(cf, "items[].")
			srcRelPath := getRelativePath(m.SourcePath)

			val, w := e.resolveFieldValue(itemBytes, domain.FieldMapping{
				CanonicalField:       cf,
				SourcePath:           srcRelPath,
				Transformation:       m.Transformation,
				TransformationParams: m.TransformationParams,
				DefaultValue:         m.DefaultValue,
				Required:             m.Required,
			})
			if w != nil {
				warnings = append(warnings, *w)
			}

			switch fieldKey {
			case "sku":
				item.SKU = val
			case "external_product_id":
				item.ExternalProductID = val
			case "description", "name":
				item.Description = val
			case "quantity":
				q, _ := strconv.ParseFloat(val, 64)
				if q <= 0 {
					q = 1
				}
				item.Quantity = q
			case "unit_price", "price":
				p, _ := strconv.ParseFloat(val, 64)
				item.UnitPrice = p
			case "discount":
				d, _ := strconv.ParseFloat(val, 64)
				item.Discount = d
			case "tax":
				t, _ := strconv.ParseFloat(val, 64)
				item.Tax = t
			case "total":
				tot, _ := strconv.ParseFloat(val, 64)
				item.Total = tot
			}
		}

		if item.Quantity == 0 {
			item.Quantity = 1
		}
		if item.Total == 0 && item.UnitPrice > 0 {
			item.Total = math.Round((item.UnitPrice*item.Quantity-item.Discount+item.Tax)*100) / 100
		}
		if item.SKU == "" && item.ExternalProductID != "" {
			item.SKU = "PROD-" + item.ExternalProductID
		}
		if item.Description == "" {
			item.Description = "Producto " + item.SKU
		}

		items = append(items, item)
		return true
	})

	return items, warnings
}

// assignRootField sets the resolved value to the CanonicalOrder target
func (e *DefaultMappingEngine) assignRootField(c *domain.CanonicalOrder, field string, val string, warnings *[]domain.MappingWarning) {
	if val == "" {
		return
	}

	switch field {
	case "order.id", "order.external_id":
		c.ExternalID = val
	case "order.order_number":
		c.OrderNumber = val
	case "order.status":
		c.Status = strings.ToUpper(val)
	case "order.created_at":
		if t, err := time.Parse(time.RFC3339, val); err == nil {
			c.CreatedAt = t
		}
	case "order.currency":
		c.Currency = strings.ToUpper(val)
	case "order.subtotal":
		if f, err := parseCleanNumber(val); err == nil {
			c.Subtotal = f
		}
	case "order.tax":
		if f, err := parseCleanNumber(val); err == nil {
			c.Tax = f
		}
	case "order.total":
		if f, err := parseCleanNumber(val); err == nil {
			c.Total = f
		}

	// Customer Fields
	case "customer.id":
		c.Customer.ID = val
	case "customer.name":
		c.Customer.Name = val
	case "customer.document":
		c.Customer.Document = val
	case "customer.email":
		c.Customer.Email = strings.ToLower(val)
	case "customer.phone":
		c.Customer.Phone = val

	// Delivery Fields
	case "delivery.address":
		c.Delivery.Address = val
	case "delivery.city":
		c.Delivery.City = val
	case "delivery.region":
		c.Delivery.Region = val
	case "delivery.country":
		c.Delivery.Country = val
	case "delivery.postal_code":
		c.Delivery.PostalCode = val
	case "delivery.contact":
		c.Delivery.Contact = val
	case "delivery.phone":
		c.Delivery.Phone = val
	}
}

// ValidateMappings validates configuration consistency
func (e *DefaultMappingEngine) ValidateMappings(mappings []domain.FieldMapping) []domain.MappingWarning {
	var warnings []domain.MappingWarning
	seenCanonical := make(map[string]bool)

	for _, m := range mappings {
		if !m.Enabled {
			continue
		}
		if seenCanonical[m.CanonicalField] {
			warnings = append(warnings, domain.MappingWarning{
				CanonicalField: m.CanonicalField,
				SourcePath:     m.SourcePath,
				WarningType:    "DUPLICATE_MAPPING",
				Message:        fmt.Sprintf("Mapeo duplicado para el campo '%s'", m.CanonicalField),
				Severity:       "WARNING",
			})
		}
		seenCanonical[m.CanonicalField] = true

		if m.SourcePath == "" && m.DefaultValue == "" && m.Transformation != domain.TransformConcat {
			warnings = append(warnings, domain.MappingWarning{
				CanonicalField: m.CanonicalField,
				SourcePath:     m.SourcePath,
				WarningType:    "EMPTY_SOURCE_PATH",
				Message:        fmt.Sprintf("Campo '%s' no define ruta origen ni valor por defecto", m.CanonicalField),
				Severity:       "ERROR",
			})
		}
	}
	return warnings
}

// Helpers

func normalizePath(path string) string {
	path = strings.TrimSpace(path)
	path = strings.ReplaceAll(path, "[]", "")
	return path
}

func getRelativePath(path string) string {
	path = normalizePath(path)
	parts := strings.Split(path, ".")
	if len(parts) > 1 {
		return strings.Join(parts[1:], ".")
	}
	return path
}

func parseFlexibleDate(val string) (time.Time, error) {
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
		"02/01/2006 15:04:05",
		"02-01-2006 15:04:05",
		"02/01/2006",
		time.RFC1123,
	}

	for _, f := range formats {
		if t, err := time.Parse(f, val); err == nil {
			return t, nil
		}
	}

	// Try unix timestamp
	if ts, err := strconv.ParseInt(val, 10, 64); err == nil {
		if ts > 1000000000000 { // Milliseconds
			return time.UnixMilli(ts), nil
		}
		return time.Unix(ts, 0), nil
	}

	return time.Time{}, fmt.Errorf("fecha no reconocida: %s", val)
}

func parseCleanNumber(val string) (float64, error) {
	clean := strings.TrimSpace(val)
	clean = strings.ReplaceAll(clean, "$", "")
	clean = strings.ReplaceAll(clean, " ", "")

	// Check if comma and dot are used
	hasDot := strings.Contains(clean, ".")
	hasComma := strings.Contains(clean, ",")

	if hasDot && hasComma {
		lastDot := strings.LastIndex(clean, ".")
		lastComma := strings.LastIndex(clean, ",")
		if lastComma > lastDot {
			// European / Chilean format: 1.450,50
			clean = strings.ReplaceAll(clean, ".", "")
			clean = strings.ReplaceAll(clean, ",", ".")
		} else {
			// US format: 1,450.50
			clean = strings.ReplaceAll(clean, ",", "")
		}
	} else if hasComma {
		clean = strings.ReplaceAll(clean, ",", ".")
	}

	return strconv.ParseFloat(clean, 64)
}
