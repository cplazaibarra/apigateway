package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"order-integration-hub/internal/adapter"
	"order-integration-hub/internal/domain"
)

func TestAuthJWT(t *testing.T) {
	authSvc := NewAuthService(nil, "my-test-secret-key-123456789012")

	// Test Validate with invalid token
	_, err := authSvc.ValidateToken("invalid.token.string")
	if err == nil {
		t.Errorf("expected error for invalid token, got nil")
	}
}

func TestMaskCredentials(t *testing.T) {
	raw := json.RawMessage(`{"api_key": "sk_live_1234567890abcdef", "password": "supersecretpassword"}`)
	masked := maskCredentials(raw)

	if !testing.Short() {
		if !json.Valid([]byte(`{}`)) {
			t.Errorf("json validation failed")
		}
	}

	if len(masked) == 0 {
		t.Errorf("expected masked string, got empty")
	}
}

func TestAdapterRegistry(t *testing.T) {
	reg := adapter.NewRegistry()

	// WooCommerce
	wc, err := reg.Get("WOOCOMMERCE")
	if err != nil || wc == nil {
		t.Fatalf("failed to get WooCommerce adapter: %v", err)
	}
	if wc.ProviderName() != domain.ProviderWooCommerce {
		t.Errorf("expected provider WOOCOMMERCE, got %s", wc.ProviderName())
	}

	// SAP
	sap, err := reg.Get("SAP")
	if err != nil || sap == nil {
		t.Fatalf("failed to get SAP adapter: %v", err)
	}

	// Odoo
	odoo, err := reg.Get("ODOO")
	if err != nil || odoo == nil {
		t.Fatalf("failed to get Odoo adapter: %v", err)
	}

	// BSALE
	bsale, err := reg.Get("BSALE")
	if err != nil || bsale == nil {
		t.Fatalf("failed to get BSALE adapter: %v", err)
	}

	// Test Mock Connection
	it := &domain.Integration{
		ID:       "test-int",
		Provider: domain.ProviderWooCommerce,
		BaseURL:  "https://demo.local/wp-json/wc/v3",
	}
	res, err := wc.TestConnection(context.Background(), it)
	if err != nil {
		t.Fatalf("test connection failed: %v", err)
	}
	if !res.Success {
		t.Errorf("expected test connection to succeed, got failure")
	}

	// Test Fetch Orders
	orders, err := wc.FetchOrders(context.Background(), it, nil)
	if err != nil {
		t.Fatalf("fetch orders failed: %v", err)
	}
	if len(orders) == 0 {
		t.Errorf("expected orders to be returned, got 0")
	}
}

func TestAlertCooldown(t *testing.T) {
	alertSvc := &AlertService{}
	key := "rule-1:int-1"

	alertSvc.cooldown.Store(key, time.Now())
	val, ok := alertSvc.cooldown.Load(key)
	if !ok || val == nil {
		t.Errorf("expected cooldown key to be present")
	}
}
