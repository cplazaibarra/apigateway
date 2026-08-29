package mapping

import (
	"encoding/json"
	"strings"

	"github.com/tidwall/gjson"
	"order-integration-hub/internal/domain"
)

// AutoMapper generates mapping suggestions from a sample JSON payload and canonical catalog
type AutoMapper struct{}

func NewAutoMapper() *AutoMapper {
	return &AutoMapper{}
}

// SuggestMappings analyzes raw payload keys and matches them with canonical fields
func (am *AutoMapper) SuggestMappings(rawJSON []byte, canonicalFields []domain.CanonicalField, provider string) []domain.AutoMappingSuggestion {
	if len(rawJSON) == 0 || !gjson.ValidBytes(rawJSON) {
		return nil
	}

	// Flatten all available paths from the JSON
	var parsed map[string]interface{}
	if err := json.Unmarshal(rawJSON, &parsed); err != nil {
		return nil
	}

	availablePaths := make(map[string]bool)
	flattenPaths("", parsed, availablePaths)

	var suggestions []domain.AutoMappingSuggestion

	for _, cf := range canonicalFields {
		bestPath, confidence, transform, reason := findBestMatch(cf, availablePaths, provider)
		if bestPath != "" && confidence >= 0.5 {
			suggestions = append(suggestions, domain.AutoMappingSuggestion{
				CanonicalField: cf.ID,
				SourcePath:     bestPath,
				Confidence:     confidence,
				Transformation: transform,
				Reason:         reason,
			})
		}
	}

	return suggestions
}

func flattenPaths(prefix string, obj interface{}, paths map[string]bool) {
	switch v := obj.(type) {
	case map[string]interface{}:
		for k, val := range v {
			fullKey := k
			if prefix != "" {
				fullKey = prefix + "." + k
			}
			paths[fullKey] = true
			flattenPaths(fullKey, val, paths)
		}
	case []interface{}:
		if len(v) > 0 {
			arrayKey := prefix + "[]"
			paths[arrayKey] = true
			if elemMap, ok := v[0].(map[string]interface{}); ok {
				for k, val := range elemMap {
					fullKey := prefix + "[]." + k
					paths[fullKey] = true
					flattenPaths(fullKey, val, paths)
				}
			}
		}
	}
}

func findBestMatch(cf domain.CanonicalField, paths map[string]bool, provider string) (string, float64, string, string) {
	cfLower := strings.ToLower(cf.ID)
	cfParts := strings.Split(cfLower, ".")
	lastPart := cfParts[len(cfParts)-1]

	// 1. Exact match in path list
	for p := range paths {
		pLower := strings.ToLower(p)
		if pLower == cfLower {
			return p, 1.0, domain.TransformCopy, "Coincidencia exacta de ruta"
		}
	}

	// 2. Check canonical aliases
	for _, alias := range cf.Aliases {
		aliasLower := strings.ToLower(alias)
		for p := range paths {
			pLower := strings.ToLower(p)
			if pLower == aliasLower {
				return p, 0.95, domain.TransformCopy, "Coincidencia con alias conocido ('" + alias + "')"
			}
			if strings.HasSuffix(pLower, "."+aliasLower) || strings.HasSuffix(pLower, "[]."+aliasLower) {
				return p, 0.90, domain.TransformCopy, "Coincidencia de campo con alias ('" + alias + "')"
			}
		}
	}

	// 3. Heuristic matching by field name
	for p := range paths {
		pLower := strings.ToLower(p)
		pParts := strings.Split(pLower, ".")
		pLast := pParts[len(pParts)-1]

		if pLast == lastPart {
			if strings.HasPrefix(cfLower, "items[].") && strings.Contains(pLower, "[]") {
				return p, 0.85, domain.TransformCopy, "Coincidencia en arreglo de productos"
			}
			if !strings.HasPrefix(cfLower, "items[].") && !strings.Contains(pLower, "[]") {
				return p, 0.80, domain.TransformCopy, "Coincidencia de nombre de campo"
			}
		}
	}

	// 4. Special cases for CONCAT or STATUS_MAP
	if cf.ID == "customer.name" {
		hasFirst := paths["billing.first_name"] || paths["customer.first_name"]
		hasLast := paths["billing.last_name"] || paths["customer.last_name"]
		if hasFirst && hasLast {
			if paths["billing.first_name"] {
				return "billing.first_name", 0.90, domain.TransformConcat, "Combinación sugerida: first_name + last_name"
			}
			return "customer.first_name", 0.90, domain.TransformConcat, "Combinación sugerida: first_name + last_name"
		}
	}

	if cf.ID == "order.status" {
		if paths["status"] {
			return "status", 0.95, domain.TransformStatusMap, "Mapeo de estados con diccionario"
		}
	}

	return "", 0, domain.TransformCopy, ""
}
