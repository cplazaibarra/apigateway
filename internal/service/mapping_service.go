package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"order-integration-hub/internal/adapter"
	"order-integration-hub/internal/domain"
	"order-integration-hub/internal/mapping"
)

type MappingService struct {
	db              *sql.DB
	adapterRegistry *adapter.Registry
	engine          mapping.MappingEngine
	cache           *mapping.MappingCache
	autoMapper      *mapping.AutoMapper
	auditSvc        *AuditService
}

func NewMappingService(
	db *sql.DB,
	adapterRegistry *adapter.Registry,
	engine mapping.MappingEngine,
	cache *mapping.MappingCache,
	auditSvc *AuditService,
) *MappingService {
	return &MappingService{
		db:              db,
		adapterRegistry: adapterRegistry,
		engine:          engine,
		cache:           cache,
		autoMapper:      mapping.NewAutoMapper(),
		auditSvc:        auditSvc,
	}
}

// GetCanonicalFields returns the global catalog of canonical order fields
func (s *MappingService) GetCanonicalFields(ctx context.Context) ([]domain.CanonicalField, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, group_name, data_type, description, required, aliases, example, created_at
		FROM canonical_fields
		ORDER BY group_name, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fields []domain.CanonicalField
	for rows.Next() {
		var cf domain.CanonicalField
		var aliasesJSON []byte
		if err := rows.Scan(&cf.ID, &cf.Name, &cf.GroupName, &cf.DataType, &cf.Description, &cf.Required, &aliasesJSON, &cf.Example, &cf.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(aliasesJSON, &cf.Aliases)
		fields = append(fields, cf)
	}
	return fields, nil
}

// GetProviderDefaultMapping returns standard default mapping for a provider
func (s *MappingService) GetProviderDefaultMapping(ctx context.Context, provider string) ([]domain.FieldMapping, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, provider_id, profile_id, canonical_field, source_path, mapping_type,
		       data_type, required, default_value, transformation, transformation_params,
		       priority, enabled, created_at, updated_at
		FROM field_mappings
		WHERE UPPER(provider_id) = UPPER($1) AND mapping_type = 'DEFAULT'
		ORDER BY priority DESC, canonical_field ASC
	`, provider)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mappings []domain.FieldMapping
	for rows.Next() {
		var m domain.FieldMapping
		if err := rows.Scan(
			&m.ID, &m.ProviderID, &m.ProfileID, &m.CanonicalField, &m.SourcePath, &m.MappingType,
			&m.DataType, &m.Required, &m.DefaultValue, &m.Transformation, &m.TransformationParams,
			&m.Priority, &m.Enabled, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, err
		}
		mappings = append(mappings, m)
	}
	return mappings, nil
}

// GetResolvedMappings returns the effective list of mappings (default + overrides) for runtime engine
func (s *MappingService) GetResolvedMappings(ctx context.Context, integrationID string) ([]domain.FieldMapping, error) {
	// 1. Check in-memory cache
	if cached, hit := s.cache.Get(integrationID); hit {
		return cached, nil
	}

	// 2. Fetch Integration & Provider
	var provider string
	err := s.db.QueryRowContext(ctx, "SELECT provider FROM integrations WHERE id = $1", integrationID).Scan(&provider)
	if err != nil {
		return nil, fmt.Errorf("integración %s no encontrada: %w", integrationID, err)
	}

	// 3. Fetch Provider Defaults
	defaults, err := s.GetProviderDefaultMapping(ctx, provider)
	if err != nil {
		return nil, err
	}

	// 4. Fetch Integration Overrides
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, integration_id, canonical_field, source_path, mapping_type,
		       data_type, required, default_value, transformation, transformation_params,
		       priority, enabled, created_at, updated_at
		FROM field_mappings
		WHERE integration_id = $1
		ORDER BY priority DESC, canonical_field ASC
	`, integrationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	overrideMap := make(map[string]domain.FieldMapping)
	for rows.Next() {
		var m domain.FieldMapping
		if err := rows.Scan(
			&m.ID, &m.IntegrationID, &m.CanonicalField, &m.SourcePath, &m.MappingType,
			&m.DataType, &m.Required, &m.DefaultValue, &m.Transformation, &m.TransformationParams,
			&m.Priority, &m.Enabled, &m.CreatedAt, &m.UpdatedAt,
		); err == nil {
			overrideMap[m.CanonicalField] = m
		}
	}

	// 5. Merge: Overrides replace defaults for the same canonical_field
	effectiveMap := make(map[string]domain.FieldMapping)
	for _, d := range defaults {
		effectiveMap[d.CanonicalField] = d
	}
	for cf, ovr := range overrideMap {
		effectiveMap[cf] = ovr
	}

	var resolved []domain.FieldMapping
	for _, m := range effectiveMap {
		resolved = append(resolved, m)
	}

	// 6. Save in memory cache
	s.cache.Set(integrationID, resolved)
	return resolved, nil
}

// GetEffectiveMapping returns the detailed mapping structure for Web UI visualization
func (s *MappingService) GetEffectiveMapping(ctx context.Context, integrationID string) (*domain.EffectiveMappingResult, error) {
	var it domain.Integration
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, provider FROM integrations WHERE id = $1
	`, integrationID).Scan(&it.ID, &it.Name, &it.Provider)
	if err != nil {
		return nil, fmt.Errorf("integración no encontrada: %w", err)
	}

	canonicalFields, err := s.GetCanonicalFields(ctx)
	if err != nil {
		return nil, err
	}

	mappings, err := s.GetResolvedMappings(ctx, integrationID)
	if err != nil {
		return nil, err
	}

	// Calculate Coverage
	mappedSet := make(map[string]bool)
	for _, m := range mappings {
		if m.Enabled && (m.SourcePath != "" || m.DefaultValue != "") {
			mappedSet[m.CanonicalField] = true
		}
	}

	reqCount, reqMapped := 0, 0
	optCount, optMapped := 0, 0

	for _, cf := range canonicalFields {
		if cf.Required {
			reqCount++
			if mappedSet[cf.ID] {
				reqMapped++
			}
		} else {
			optCount++
			if mappedSet[cf.ID] {
				optMapped++
			}
		}
	}

	coverage := 0.0
	if len(canonicalFields) > 0 {
		coverage = float64(len(mappedSet)) / float64(len(canonicalFields)) * 100.0
	}

	// Get latest version number
	var curVersion int
	_ = s.db.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 1) FROM mapping_versions WHERE integration_id = $1", integrationID).Scan(&curVersion)

	// Get latest sample if stored
	var sampleJSON []byte
	_ = s.db.QueryRowContext(ctx, "SELECT raw_payload FROM integration_samples WHERE integration_id = $1", integrationID).Scan(&sampleJSON)

	return &domain.EffectiveMappingResult{
		IntegrationID:   it.ID,
		IntegrationName: it.Name,
		Provider:        it.Provider,
		Mappings:        mappings,
		CanonicalFields: canonicalFields,
		CoveragePercent: coverage,
		RequiredCount:   reqCount,
		RequiredMapped:  reqMapped,
		OptionalCount:   optCount,
		OptionalMapped:  optMapped,
		CurrentVersion:  curVersion,
		LatestSample:    json.RawMessage(sampleJSON),
	}, nil
}

// SaveMappings updates overrides, stores a version snapshot, clears cache, and audits the change
func (s *MappingService) SaveMappings(ctx context.Context, integrationID string, newMappings []domain.FieldMapping, userEmail, userIP string) (*domain.EffectiveMappingResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// 1. Delete existing overrides for integration
	_, err = tx.ExecContext(ctx, "DELETE FROM field_mappings WHERE integration_id = $1", integrationID)
	if err != nil {
		return nil, err
	}

	// 2. Insert new overrides
	for _, m := range newMappings {
		if m.MappingType == domain.MappingTypeDefault && m.IntegrationID == nil {
			// Skip inserting pure defaults as overrides unless modified
			continue
		}

		id := m.ID
		if id == "" || len(id) < 8 {
			id = "fm-ovr-" + uuid.New().String()[:8]
		}
		params := m.TransformationParams
		if len(params) == 0 {
			params = json.RawMessage("{}")
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO field_mappings (
				id, integration_id, canonical_field, source_path, mapping_type,
				data_type, required, default_value, transformation, transformation_params,
				priority, enabled, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, 'OVERRIDE', $5, $6, $7, $8, $9, 100, $10, NOW(), NOW())
		`, id, integrationID, m.CanonicalField, m.SourcePath, m.DataType, m.Required, m.DefaultValue, m.Transformation, params, m.Enabled)
		if err != nil {
			return nil, fmt.Errorf("error guardando regla de mapeo %s: %w", m.CanonicalField, err)
		}
	}

	// 3. Determine next version number
	var nextVer int
	_ = tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 0) + 1 FROM mapping_versions WHERE integration_id = $1", integrationID).Scan(&nextVer)

	// 4. Create snapshot in mapping_versions
	snapJSON, _ := json.Marshal(newMappings)
	vID := "mver-" + uuid.New().String()[:8]
	_, err = tx.ExecContext(ctx, `
		INSERT INTO mapping_versions (id, integration_id, version, mapping_snapshot, description, created_by, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`, vID, integrationID, nextVer, snapJSON, fmt.Sprintf("Actualización de mappings (v%d)", nextVer), userEmail)
	if err != nil {
		return nil, fmt.Errorf("error creando versión de snapshot: %w", err)
	}

	// 4.1 Retain only the latest 5 versions per integration (cleanup older versions)
	_, _ = tx.ExecContext(ctx, `
		DELETE FROM mapping_versions
		WHERE integration_id = $1
		  AND id NOT IN (
			SELECT id FROM mapping_versions
			WHERE integration_id = $1
			ORDER BY version DESC
			LIMIT 5
		  )
	`, integrationID)

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	// 5. Invalidate In-Memory Cache
	s.cache.Invalidate(integrationID)

	// 6. Audit Log
	s.auditSvc.Log(ctx, "", userEmail, "MAPPING_UPDATED", "MAPPING", integrationID, userIP, nil, map[string]interface{}{
		"version": nextVer,
		"count":   len(newMappings),
	})

	return s.GetEffectiveMapping(ctx, integrationID)
}

// DeleteMappingRule removes a single override rule
func (s *MappingService) DeleteMappingRule(ctx context.Context, integrationID, mappingID, userEmail, userIP string) error {
	res, err := s.db.ExecContext(ctx, "DELETE FROM field_mappings WHERE id = $1 AND integration_id = $2", mappingID, integrationID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("regla no encontrada")
	}

	s.cache.Invalidate(integrationID)
	s.auditSvc.Log(ctx, "", userEmail, "MAPPING_DELETED", "MAPPING", mappingID, userIP, nil, nil)
	return nil
}

// FetchSamplePayload retrieves a live sample order from the integration adapter and stores it
func (s *MappingService) FetchSamplePayload(ctx context.Context, integrationID string) (map[string]interface{}, error) {
	var it domain.Integration
	err := s.db.QueryRowContext(ctx, `
		SELECT id, provider, base_url, auth_type, credentials FROM integrations WHERE id = $1
	`, integrationID).Scan(&it.ID, &it.Provider, &it.BaseURL, &it.AuthType, &it.Credentials)
	if err != nil {
		return nil, fmt.Errorf("integración no encontrada: %w", err)
	}

	adp, err := s.adapterRegistry.Get(it.Provider)
	if err != nil {
		return nil, err
	}

	sampleBytes, err := adp.FetchSampleOrder(ctx, &it)
	if err != nil {
		return nil, fmt.Errorf("error al obtener sample de orden: %w", err)
	}

	// Store in database for quick preview
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO integration_samples (integration_id, raw_payload, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (integration_id) DO UPDATE SET raw_payload = EXCLUDED.raw_payload, updated_at = NOW()
	`, integrationID, string(sampleBytes))

	var parsed map[string]interface{}
	if err := json.Unmarshal(sampleBytes, &parsed); err != nil {
		return nil, fmt.Errorf("error al parsear JSON del sample: %w", err)
	}

	return parsed, nil
}

// PreviewMapping transforms a payload against given mappings
func (s *MappingService) PreviewMapping(ctx context.Context, req domain.MappingPreviewRequest) (*domain.MappingPreviewResponse, error) {
	rawBytes, err := json.Marshal(req.RawPayload)
	if err != nil {
		return nil, fmt.Errorf("error serializando raw payload: %w", err)
	}

	canonicalOrder, warnings, err := s.engine.Transform(ctx, rawBytes, req.Mappings)
	var errs []string
	if err != nil {
		errs = append(errs, err.Error())
	}

	for _, w := range warnings {
		if w.Severity == "ERROR" {
			errs = append(errs, w.Message)
		}
	}

	return &domain.MappingPreviewResponse{
		CanonicalOrder: canonicalOrder,
		Warnings:       warnings,
		Errors:         errs,
		Success:        err == nil && len(errs) == 0,
	}, nil
}

// TestIntegrationMapping retrieves a sample and runs preview
func (s *MappingService) TestIntegrationMapping(ctx context.Context, integrationID string, customMappings []domain.FieldMapping, userEmail, userIP string) (*domain.MappingPreviewResponse, error) {
	mappingsToTest := customMappings
	if len(mappingsToTest) == 0 {
		effective, err := s.GetResolvedMappings(ctx, integrationID)
		if err != nil {
			return nil, err
		}
		mappingsToTest = effective
	}

	sampleMap, err := s.FetchSamplePayload(ctx, integrationID)
	if err != nil {
		return nil, err
	}

	preview, err := s.PreviewMapping(ctx, domain.MappingPreviewRequest{
		RawPayload: sampleMap,
		Mappings:   mappingsToTest,
	})
	if err != nil {
		return nil, err
	}

	s.auditSvc.Log(ctx, "", userEmail, "MAPPING_TESTED", "MAPPING", integrationID, userIP, nil, map[string]interface{}{
		"success":        preview.Success,
		"warnings_count": len(preview.Warnings),
	})

	return preview, nil
}

// GetVersions returns version history
func (s *MappingService) GetVersions(ctx context.Context, integrationID string) ([]domain.MappingVersion, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, integration_id, version, mapping_snapshot, description, created_by, created_at
		FROM mapping_versions
		WHERE integration_id = $1
		ORDER BY version DESC
	`, integrationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := make([]domain.MappingVersion, 0)
	for rows.Next() {
		var v domain.MappingVersion
		if err := rows.Scan(&v.ID, &v.IntegrationID, &v.Version, &v.MappingSnapshot, &v.Description, &v.CreatedBy, &v.CreatedAt); err == nil {
			versions = append(versions, v)
		}
	}
	return versions, nil
}

// RestoreVersion rolls back mappings to a previous version snapshot
func (s *MappingService) RestoreVersion(ctx context.Context, integrationID string, version int, userEmail, userIP string) (*domain.EffectiveMappingResult, error) {
	var snapJSON []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT mapping_snapshot FROM mapping_versions
		WHERE integration_id = $1 AND version = $2
	`, integrationID, version).Scan(&snapJSON)
	if err != nil {
		return nil, fmt.Errorf("versión %d no encontrada: %w", version, err)
	}

	var snapMappings []domain.FieldMapping
	if err := json.Unmarshal(snapJSON, &snapMappings); err != nil {
		return nil, fmt.Errorf("error deserializando snapshot de versión: %w", err)
	}

	result, err := s.SaveMappings(ctx, integrationID, snapMappings, userEmail, userIP)
	if err != nil {
		return nil, err
	}

	s.auditSvc.Log(ctx, "", userEmail, "MAPPING_RESTORED", "MAPPING", integrationID, userIP, map[string]int{"restored_from_version": version}, nil)
	return result, nil
}

// SuggestAutoMappings suggests mapping rules based on a sample payload
func (s *MappingService) SuggestAutoMappings(ctx context.Context, integrationID string) ([]domain.AutoMappingSuggestion, error) {
	var provider string
	err := s.db.QueryRowContext(ctx, "SELECT provider FROM integrations WHERE id = $1", integrationID).Scan(&provider)
	if err != nil {
		return nil, err
	}

	canonicalFields, err := s.GetCanonicalFields(ctx)
	if err != nil {
		return nil, err
	}

	sampleMap, err := s.FetchSamplePayload(ctx, integrationID)
	if err != nil {
		return nil, err
	}

	rawBytes, _ := json.Marshal(sampleMap)
	suggestions := s.autoMapper.SuggestMappings(rawBytes, canonicalFields, provider)
	return suggestions, nil
}
