package mapping

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"order-integration-hub/internal/domain"
)

func sampleStandardWooCommerceJSON() []byte {
	return []byte(`{
		"id": 1055,
		"number": "1055",
		"status": "processing",
		"currency": "CLP",
		"date_created": "2026-08-29T14:30:00Z",
		"total": "119980.00",
		"billing": {
			"first_name": "Carlos",
			"last_name": "Plaza",
			"email": "carlos.plaza@ejemplo.cl",
			"phone": "+56 9 9123 4567"
		},
		"shipping": {
			"address_1": "Av. Providencia 1240, Depto 502",
			"city": "Providencia",
			"state": "Región Metropolitana",
			"country": "CL"
		},
		"line_items": [
			{
				"id": 412,
				"name": "Chaqueta Cortaviento Térmica",
				"product_id": 101,
				"sku": "MODA-CHQ-01",
				"quantity": 1,
				"price": 49990,
				"total": "49990.00"
			},
			{
				"id": 588,
				"name": "Zapatillas Running Pro Sport",
				"product_id": 102,
				"sku": "MODA-ZAP-02",
				"quantity": 1,
				"price": 69990,
				"total": "69990.00"
			}
		]
	}`)
}

func samplePluginWooCommerceJSON() []byte {
	return []byte(`{
		"id": 2044,
		"number": "2044",
		"status": "on-hold",
		"currency": "CLP",
		"date_created": "2026-08-29T16:00:00Z",
		"total": "244980.00",
		"billing": {
			"first_name": "Valentina",
			"last_name": "Silva",
			"email": "v.silva@empresa.com",
			"phone": "+56 9 8234 5678"
		},
		"meta_data": {
			"custom_delivery_address": "Calle Los Aromos 450, Casa B",
			"custom_commune": "Viña del Mar"
		},
		"line_items": [
			{
				"id": 801,
				"name": "Monitor Gamer IPS 27'' 165Hz",
				"product_id": 201,
				"sku": "TECH-MON-27",
				"quantity": 1,
				"price": 189990,
				"total": "189990.00"
			},
			{
				"id": 802,
				"name": "Teclado Mecánico RGB Switch Red",
				"product_id": 202,
				"sku": "TECH-TEC-RGB",
				"quantity": 1,
				"price": 54990,
				"total": "54990.00"
			}
		]
	}`)
}

func getStandardWooCommerceMappings() []domain.FieldMapping {
	concatParams, _ := json.Marshal(map[string]interface{}{
		"paths":     []string{"billing.first_name", "billing.last_name"},
		"separator": " ",
	})
	statusParams, _ := json.Marshal(map[string]string{
		"processing": "PROCESSING",
		"on-hold":    "ON_HOLD",
		"completed":  "COMPLETED",
		"cancelled":  "CANCELLED",
		"default":    "PENDING",
	})

	return []domain.FieldMapping{
		{CanonicalField: "order.id", SourcePath: "id", Transformation: domain.TransformCopy, Enabled: true, Required: true},
		{CanonicalField: "order.order_number", SourcePath: "number", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "order.status", SourcePath: "status", Transformation: domain.TransformStatusMap, TransformationParams: statusParams, Enabled: true},
		{CanonicalField: "order.currency", SourcePath: "currency", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "order.created_at", SourcePath: "date_created", Transformation: domain.TransformDateFormat, Enabled: true},
		{CanonicalField: "order.total", SourcePath: "total", Transformation: domain.TransformNumber, Enabled: true},
		{CanonicalField: "customer.name", SourcePath: "billing.first_name", Transformation: domain.TransformConcat, TransformationParams: concatParams, Enabled: true},
		{CanonicalField: "customer.email", SourcePath: "billing.email", Transformation: domain.TransformLowercase, Enabled: true},
		{CanonicalField: "customer.phone", SourcePath: "billing.phone", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "delivery.address", SourcePath: "shipping.address_1", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "delivery.city", SourcePath: "shipping.city", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "delivery.country", SourcePath: "shipping.country", DefaultValue: "CL", Transformation: domain.TransformDefault, Enabled: true},
		{CanonicalField: "items[].sku", SourcePath: "line_items[].sku", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "items[].description", SourcePath: "line_items[].name", Transformation: domain.TransformCopy, Enabled: true},
		{CanonicalField: "items[].quantity", SourcePath: "line_items[].quantity", Transformation: domain.TransformNumber, Enabled: true},
		{CanonicalField: "items[].unit_price", SourcePath: "line_items[].price", Transformation: domain.TransformNumber, Enabled: true},
		{CanonicalField: "items[].total", SourcePath: "line_items[].total", Transformation: domain.TransformNumber, Enabled: true},
	}
}

func TestMappingEngine_SimpleAndStandardWooCommerce(t *testing.T) {
	engine := NewDefaultMappingEngine()
	mappings := getStandardWooCommerceMappings()
	rawJSON := sampleStandardWooCommerceJSON()

	order, warnings, err := engine.Transform(context.Background(), rawJSON, mappings)
	if err != nil {
		t.Fatalf("Transform falló: %v", err)
	}

	if order.OrderNumber != "1055" {
		t.Errorf("Esperaba order_number 1055, obtuve %s", order.OrderNumber)
	}
	if order.Status != "PROCESSING" {
		t.Errorf("Esperaba status PROCESSING, obtuve %s", order.Status)
	}
	if order.Customer.Name != "Carlos Plaza" {
		t.Errorf("Esperaba customer.name 'Carlos Plaza', obtuve '%s'", order.Customer.Name)
	}
	if order.Customer.Email != "carlos.plaza@ejemplo.cl" {
		t.Errorf("Esperaba customer.email 'carlos.plaza@ejemplo.cl', obtuve '%s'", order.Customer.Email)
	}
	if order.Delivery.Address != "Av. Providencia 1240, Depto 502" {
		t.Errorf("Esperaba delivery.address 'Av. Providencia 1240, Depto 502', obtuve '%s'", order.Delivery.Address)
	}
	if order.Delivery.Country != "CL" {
		t.Errorf("Esperaba delivery.country 'CL', obtuve '%s'", order.Delivery.Country)
	}
	if len(order.Items) != 2 {
		t.Fatalf("Esperaba 2 items, obtuve %d", len(order.Items))
	}
	if order.Items[0].SKU != "MODA-CHQ-01" {
		t.Errorf("Esperaba SKU 'MODA-CHQ-01', obtuve '%s'", order.Items[0].SKU)
	}
	if order.Total != 119980 {
		t.Errorf("Esperaba total 119980, obtuve %f", order.Total)
	}
	if len(warnings) > 0 {
		for _, w := range warnings {
			if w.Severity == "ERROR" {
				t.Errorf("Warning de error inesperado: %+v", w)
			}
		}
	}
}

func TestMappingEngine_IntegrationOverride(t *testing.T) {
	engine := NewDefaultMappingEngine()
	// Start with standard mappings
	baseMappings := getStandardWooCommerceMappings()

	// Apply Override for Cliente B (Plugin with meta_data.custom_delivery_address)
	var overrideMappings []domain.FieldMapping
	for _, m := range baseMappings {
		if m.CanonicalField == "delivery.address" {
			// Override rule
			m.SourcePath = "meta_data.custom_delivery_address"
			m.MappingType = domain.MappingTypeOverride
		} else if m.CanonicalField == "delivery.city" {
			m.SourcePath = "meta_data.custom_commune"
			m.MappingType = domain.MappingTypeOverride
		}
		overrideMappings = append(overrideMappings, m)
	}

	rawJSON := samplePluginWooCommerceJSON()

	order, _, err := engine.Transform(context.Background(), rawJSON, overrideMappings)
	if err != nil {
		t.Fatalf("Transform falló: %v", err)
	}

	if order.OrderNumber != "2044" {
		t.Errorf("Esperaba order_number 2044, obtuve %s", order.OrderNumber)
	}
	if order.Status != "ON_HOLD" {
		t.Errorf("Esperaba status ON_HOLD, obtuve %s", order.Status)
	}
	if order.Customer.Name != "Valentina Silva" {
		t.Errorf("Esperaba customer.name 'Valentina Silva', obtuve '%s'", order.Customer.Name)
	}
	// CRITICAL TEST: Validates delivery address extracted from meta_data without code conditionals
	if order.Delivery.Address != "Calle Los Aromos 450, Casa B" {
		t.Errorf("Esperaba delivery.address 'Calle Los Aromos 450, Casa B', obtuve '%s'", order.Delivery.Address)
	}
	if order.Delivery.City != "Viña del Mar" {
		t.Errorf("Esperaba delivery.city 'Viña del Mar', obtuve '%s'", order.Delivery.City)
	}
	if len(order.Items) != 2 {
		t.Fatalf("Esperaba 2 items, obtuve %d", len(order.Items))
	}
	if order.Items[0].SKU != "TECH-MON-27" {
		t.Errorf("Esperaba SKU 'TECH-MON-27', obtuve '%s'", order.Items[0].SKU)
	}
}

func TestMappingEngine_MissingOptionalFieldAndDefaultValue(t *testing.T) {
	engine := NewDefaultMappingEngine()
	rawJSON := []byte(`{"id": "ORD-1", "customer_email": "test@test.cl"}`)

	mappings := []domain.FieldMapping{
		{CanonicalField: "order.id", SourcePath: "id", Enabled: true},
		{CanonicalField: "customer.email", SourcePath: "customer_email", Enabled: true},
		{CanonicalField: "delivery.country", SourcePath: "shipping.country", DefaultValue: "CL", Transformation: domain.TransformDefault, Enabled: true},
		{CanonicalField: "delivery.address", SourcePath: "non_existent_field", Enabled: true, Required: false},
	}

	order, _, err := engine.Transform(context.Background(), rawJSON, mappings)
	if err != nil {
		t.Fatalf("Error inesperado: %v", err)
	}

	if order.Delivery.Country != "CL" {
		t.Errorf("Esperaba valor por defecto 'CL', obtuve '%s'", order.Delivery.Country)
	}
	if order.Delivery.Address != "" {
		t.Errorf("Esperaba dirección vacía, obtuve '%s'", order.Delivery.Address)
	}
}

func TestMappingEngine_MissingRequiredField(t *testing.T) {
	engine := NewDefaultMappingEngine()
	rawJSON := []byte(`{"customer_email": "test@test.cl"}`)

	mappings := []domain.FieldMapping{
		{CanonicalField: "order.id", SourcePath: "order_id", Required: true, Enabled: true},
	}

	_, warnings, _ := engine.Transform(context.Background(), rawJSON, mappings)
	foundRequiredWarning := false
	for _, w := range warnings {
		if w.WarningType == "REQUIRED_FIELD_MISSING" || w.WarningType == "SOURCE_FIELD_NOT_FOUND" {
			foundRequiredWarning = true
			break
		}
	}
	if !foundRequiredWarning {
		t.Errorf("Esperaba advertencia de campo requerido faltante")
	}
}

func TestMappingEngine_ConcatAndTransformations(t *testing.T) {
	engine := NewDefaultMappingEngine()
	rawJSON := []byte(`{
		"client": {
			"first": " Juan ",
			"last": "Pérez ",
			"email": "JUAN.PEREZ@EMPRESA.CL",
			"active": "1",
			"created": "2026-08-29 10:15:30",
			"price_str": " $1.450,50 "
		}
	}`)

	concatParams, _ := json.Marshal(map[string]interface{}{
		"paths":     []string{"client.first", "client.last"},
		"separator": " ",
	})

	mappings := []domain.FieldMapping{
		{CanonicalField: "customer.name", SourcePath: "client.first", Transformation: domain.TransformConcat, TransformationParams: concatParams, Enabled: true},
		{CanonicalField: "customer.email", SourcePath: "client.email", Transformation: domain.TransformLowercase, Enabled: true},
		{CanonicalField: "order.created_at", SourcePath: "client.created", Transformation: domain.TransformDateFormat, Enabled: true},
		{CanonicalField: "order.total", SourcePath: "client.price_str", Transformation: domain.TransformNumber, Enabled: true},
	}

	order, _, err := engine.Transform(context.Background(), rawJSON, mappings)
	if err != nil {
		t.Fatalf("Transform falló: %v", err)
	}

	if order.Customer.Name != "Juan Pérez" {
		t.Errorf("Esperaba CONCAT 'Juan Pérez', obtuve '%s'", order.Customer.Name)
	}
	if order.Customer.Email != "juan.perez@empresa.cl" {
		t.Errorf("Esperaba LOWERCASE 'juan.perez@empresa.cl', obtuve '%s'", order.Customer.Email)
	}
	if order.CreatedAt.Year() != 2026 || order.CreatedAt.Month() != 8 || order.CreatedAt.Day() != 29 {
		t.Errorf("Esperaba fecha 2026-08-29, obtuve %v", order.CreatedAt)
	}
	if order.Total != 1450.50 {
		t.Errorf("Esperaba total 1450.50, obtuve %f", order.Total)
	}
}

func TestMappingCache_GetSetInvalidate(t *testing.T) {
	cache := NewMappingCache(5 * time.Minute)
	mappings := getStandardWooCommerceMappings()

	cache.Set("int-test-1", mappings)

	cached, found := cache.Get("int-test-1")
	if !found || len(cached) != len(mappings) {
		t.Fatalf("Fallo al recuperar del cache")
	}

	cache.Invalidate("int-test-1")
	_, foundAfter := cache.Get("int-test-1")
	if foundAfter {
		t.Fatalf("Esperaba cache invalidado")
	}
}

func TestAutoMapper_Suggestions(t *testing.T) {
	automap := NewAutoMapper()
	rawJSON := sampleStandardWooCommerceJSON()
	canonicalFields := []domain.CanonicalField{
		{ID: "order.order_number", Name: "Número", Aliases: []string{"number", "order_id"}},
		{ID: "customer.email", Name: "Email", Aliases: []string{"email", "billing.email"}},
		{ID: "delivery.address", Name: "Dirección", Aliases: []string{"address_1", "shipping.address_1"}},
		{ID: "items[].sku", Name: "SKU", Aliases: []string{"sku", "line_items[].sku"}},
	}

	suggestions := automap.SuggestMappings(rawJSON, canonicalFields, domain.ProviderWooCommerce)
	if len(suggestions) == 0 {
		t.Fatalf("Esperaba sugerencias automáticas")
	}

	foundAddress := false
	for _, s := range suggestions {
		if s.CanonicalField == "delivery.address" && s.SourcePath == "shipping.address_1" {
			foundAddress = true
		}
	}
	if !foundAddress {
		t.Errorf("No se encontró sugerencia para delivery.address -> shipping.address_1")
	}
}
