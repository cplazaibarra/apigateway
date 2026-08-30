package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type WCBilling struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Company   string `json:"company"`
	Address1  string `json:"address_1"`
	City      string `json:"city"`
	State     string `json:"state"`
	Postcode  string `json:"postcode"`
	Country   string `json:"country"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
}

type WCShipping struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Company   string `json:"company"`
	Address1  string `json:"address_1"`
	City      string `json:"city"`
	State     string `json:"state"`
	Postcode  string `json:"postcode"`
	Country   string `json:"country"`
	Phone     string `json:"phone"`
}

type WCMetaData struct {
	// Tienda 2 - Plugin "Custom Checkout" fields
	CustomDeliveryAddress string `json:"custom_delivery_address,omitempty"`
	CustomCommune         string `json:"custom_commune,omitempty"`
	CustomRegion          string `json:"custom_region,omitempty"`
	// Tienda 3 - Plugin "WooComuna Pro" fields (completely different key names)
	WooBarrio            string `json:"woo_barrio,omitempty"`
	WooRegionEntrega     string `json:"woo_region_entrega,omitempty"`
	WooDireccionCompleta string `json:"woo_direccion_completa,omitempty"`
	WooRutCliente        string `json:"woo_rut_cliente,omitempty"`
	WooInstrucciones     string `json:"woo_instrucciones_entrega,omitempty"`
}

type WCLineItem struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	ProductID   int64   `json:"product_id"`
	VariationID int64   `json:"variation_id"`
	Quantity    int     `json:"quantity"`
	Price       float64 `json:"price"`
	Subtotal    string  `json:"subtotal"`
	Total       string  `json:"total"`
	SKU         string  `json:"sku"`
}

type WCOrder struct {
	ID                 int64        `json:"id"`
	Number             string       `json:"number"`
	OrderKey           string       `json:"order_key"`
	CreatedVia         string       `json:"created_via"`
	Version            string       `json:"version"`
	Status             string       `json:"status"` // pending, processing, on-hold, completed, cancelled, refunded, failed
	Currency           string       `json:"currency"`
	DateCreated        string       `json:"date_created"`
	DateCreatedGMT     string       `json:"date_created_gmt"`
	DateModified       string       `json:"date_modified"`
	DiscountTotal      string       `json:"discount_total"`
	ShippingTotal      string       `json:"shipping_total"`
	Total              string       `json:"total"`
	TotalTax           string       `json:"total_tax"`
	PricesIncludeTax   bool         `json:"prices_include_tax"`
	CustomerID         int64        `json:"customer_id"`
	CustomerIP         string       `json:"customer_ip_address"`
	Billing            WCBilling    `json:"billing"`
	Shipping           WCShipping   `json:"shipping"`
	MetaData           WCMetaData   `json:"meta_data"`
	LineItems          []WCLineItem `json:"line_items"`
	PaymentMethod      string       `json:"payment_method"`
	PaymentMethodTitle string       `json:"payment_method_title"`
}

type StoreServer struct {
	storeID     string
	storeName   string
	currency    string
	apiKey      string
	apiSecret   string
	mu          sync.RWMutex
	orders      []WCOrder
	orderSeq    int64
	initialTime time.Time
}

func NewStoreServer(id, name, currency, key, secret string) *StoreServer {
	s := &StoreServer{
		storeID:     id,
		storeName:   name,
		currency:    currency,
		apiKey:      key,
		apiSecret:   secret,
		orderSeq:    1000,
		initialTime: time.Now(),
	}
	s.seedInitialOrders()
	return s
}

func (s *StoreServer) seedInitialOrders() {
	sampleCustomers := []struct {
		first, last, email, address, comuna, region, phone string
	}{
		{"Carlos", "Plaza", "carlos.plaza@ejemplo.cl", "Av. Providencia 1240, Depto 502", "Providencia", "Región Metropolitana", "+56 9 9123 4567"},
		{"Valentina", "Silva", "v.silva@empresa.com", "Calle Los Aromos 450, Casa B", "Viña del Mar", "Valparaíso", "+56 9 8234 5678"},
		{"Matías", "González", "mgonzalez@retail.cl", "Av. San Martín 890, Of. 301", "Concepción", "Biobío", "+56 9 7345 6789"},
		{"Camila", "Rojas", "crojas@digital.cl", "Av. Angamos 1520, Depto 12", "Antofagasta", "Antofagasta", "+56 9 6456 7890"},
		{"Andrés", "Morales", "amorales@tech.cl", "Balmaceda 670, Local 4", "La Serena", "Coquimbo", "+56 9 5567 8901"},
	}

	for i, c := range sampleCustomers {
		s.orderSeq++
		id := s.orderSeq
		date := time.Now().Add(-time.Duration(12-i*2) * time.Hour)

		var items []WCLineItem
		if s.storeID == "tienda1" {
			items = []WCLineItem{
				{ID: id*10 + 1, Name: "Chaqueta Cortaviento Térmica", ProductID: 412, Quantity: 1, Price: 49990, Total: "49990", Subtotal: "49990", SKU: "MODA-CHQ-01"},
				{ID: id*10 + 2, Name: "Zapatillas Running Pro Sport", ProductID: 588, Quantity: 1, Price: 69990, Total: "69990", Subtotal: "69990", SKU: "MODA-ZAP-02"},
			}
		} else if s.storeID == "tienda3" {
			items = []WCLineItem{
				{ID: id*10 + 1, Name: "Silla Ergonómica Home Office Premium", ProductID: 701, Quantity: 1, Price: 189990, Total: "189990", Subtotal: "189990", SKU: "HOGAR-SIL-01"},
				{ID: id*10 + 2, Name: "Escritorio Regulable en Altura", ProductID: 702, Quantity: 1, Price: 299990, Total: "299990", Subtotal: "299990", SKU: "HOGAR-ESC-02"},
			}
		} else {
			items = []WCLineItem{
				{ID: id*10 + 1, Name: "Monitor Gamer IPS 27'' 165Hz", ProductID: 104, Quantity: 1, Price: 189990, Total: "189990", Subtotal: "189990", SKU: "TECH-MON-27"},
				{ID: id*10 + 2, Name: "Teclado Mecánico RGB Switch Red", ProductID: 215, Quantity: 1, Price: 54990, Total: "54990", Subtotal: "54990", SKU: "TECH-TEC-RGB"},
			}
		}

		var total float64
		for _, it := range items {
			total += it.Price * float64(it.Quantity)
		}

		var shipping WCShipping
		var meta WCMetaData

		if s.storeID == "tienda1" {
			// Standard WooCommerce Store (Tienda 1): Address in shipping
			shipping = WCShipping{
				FirstName: c.first,
				LastName:  c.last,
				Address1:  c.address,
				City:      c.comuna,
				State:     c.region,
				Postcode:  "7500000",
				Country:   "CL",
				Phone:     c.phone,
			}
		} else if s.storeID == "tienda3" {
			// Tienda 3 - Plugin "WooComuna Pro": uses completely different meta_data key names
			// Field structure is totally distinct from both Tienda 1 and Tienda 2
			meta = WCMetaData{
				WooDireccionCompleta: c.address,
				WooBarrio:            c.comuna,
				WooRegionEntrega:     c.region,
				WooRutCliente:        fmt.Sprintf("%d.%d.%d-%d", id%10+1, (id*7)%999, (id*3)%999, id%9),
				WooInstrucciones:     "Dejar en conserjería si no hay nadie",
			}
		} else {
			// Customized WooCommerce Store (Tienda 2): Custom checkout plugin stores address in meta_data
			meta = WCMetaData{
				CustomDeliveryAddress: c.address,
				CustomCommune:         c.comuna,
				CustomRegion:          c.region,
			}
		}

		order := WCOrder{
			ID:             id,
			Number:         fmt.Sprintf("%d", id),
			OrderKey:       fmt.Sprintf("wc_order_%s_%d", s.storeID, id),
			CreatedVia:     "checkout",
			Version:        "8.6.1",
			Status:         "processing",
			Currency:       s.currency,
			DateCreated:    date.Format(time.RFC3339),
			DateCreatedGMT: date.UTC().Format(time.RFC3339),
			DateModified:   date.Format(time.RFC3339),
			Total:          fmt.Sprintf("%.2f", total),
			Billing: WCBilling{
				FirstName: c.first,
				LastName:  c.last,
				Address1:  c.address,
				City:      c.comuna,
				State:     c.region,
				Postcode:  "7500000",
				Country:   "CL",
				Email:     c.email,
				Phone:     c.phone,
			},
			Shipping:           shipping,
			MetaData:           meta,
			LineItems:          items,
			PaymentMethod:      "webpay_plus",
			PaymentMethodTitle: "Webpay Plus Transbank",
		}
		s.orders = append(s.orders, order)
	}
}

func (s *StoreServer) checkAuth(r *http.Request) bool {
	// 1. Basic Auth check
	user, pass, ok := r.BasicAuth()
	if ok && user == s.apiKey && pass == s.apiSecret {
		return true
	}
	// 2. Query param check (WooCommerce REST API format)
	qKey := r.URL.Query().Get("consumer_key")
	qSecret := r.URL.Query().Get("consumer_secret")
	if qKey == s.apiKey && qSecret == s.apiSecret {
		return true
	}
	// 3. For convenience during local dev/tests, allow if no key is enforced or matched
	if s.apiKey == "" || qKey == s.apiKey {
		return true
	}
	return true
}

func (s *StoreServer) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(r) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    "woocommerce_rest_cannot_view",
			"message": "Lo sentimos, no tienes permisos para ver este recurso.",
			"data":    map[string]int{"status": 401},
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"environment": map[string]interface{}{
			"home_url":               fmt.Sprintf("http://localhost:8080"),
			"site_url":               fmt.Sprintf("http://localhost:8080"),
			"version":                "8.6.1",
			"log_directory":          "/var/www/html/wp-content/uploads/wc-logs/",
			"wp_version":             "6.5.2",
			"wp_multisite":           false,
			"wp_memory_limit":        268435456,
			"wp_debug_mode":          false,
			"wp_cron":                true,
			"language":               "es_CL",
			"server_info":            "nginx/1.24.0",
			"php_version":            "8.2.18",
			"php_post_max_size":      67108864,
			"php_max_execution_time": 300,
			"mysql_version":          "8.0.36",
		},
		"database": map[string]interface{}{
			"wc_database_version":    "8.6.1",
			"database_prefix":        "wp_",
			"maxmind_geoip_database": "",
		},
		"active_plugins": []string{
			"woocommerce/woocommerce.php",
			"woocommerce-transbank/woocommerce-transbank.php",
		},
		"settings": map[string]interface{}{
			"currency":           s.currency,
			"currency_symbol":    "$",
			"currency_position":  "left",
			"thousand_separator": ".",
			"decimal_separator":  ",",
			"number_of_decimals": 0,
			"store_name":         s.storeName,
		},
	})
}

func (s *StoreServer) handleOrders(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(r) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    "woocommerce_rest_cannot_view",
			"message": "Autenticación requerida.",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodPost {
		var newOrder WCOrder
		if err := json.NewDecoder(r.Body).Decode(&newOrder); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
			return
		}

		s.mu.Lock()
		s.orderSeq++
		newOrder.ID = s.orderSeq
		newOrder.Number = fmt.Sprintf("%d", newOrder.ID)
		newOrder.OrderKey = fmt.Sprintf("wc_order_%s_%d", s.storeID, newOrder.ID)
		newOrder.Version = "8.6.1"
		newOrder.Status = "processing"
		newOrder.Currency = s.currency
		newOrder.DateCreated = time.Now().Format(time.RFC3339)
		newOrder.DateCreatedGMT = time.Now().UTC().Format(time.RFC3339)
		newOrder.DateModified = time.Now().Format(time.RFC3339)

		s.orders = append([]WCOrder{newOrder}, s.orders...)
		s.mu.Unlock()

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(newOrder)
		return
	}

	// GET Orders
	s.mu.RLock()
	defer s.mu.RUnlock()

	perPage := 10
	if pp := r.URL.Query().Get("per_page"); pp != "" {
		fmt.Sscanf(pp, "%d", &perPage)
	}
	if perPage <= 0 {
		perPage = 10
	}

	statusFilter := r.URL.Query().Get("status")
	var filtered []WCOrder
	for _, o := range s.orders {
		if statusFilter != "" && statusFilter != "any" {
			matched := false
			for _, st := range strings.Split(statusFilter, ",") {
				if strings.TrimSpace(st) == o.Status {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		filtered = append(filtered, o)
	}

	if len(filtered) > perPage {
		filtered = filtered[:perPage]
	}

	// Return array of filtered orders
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(filtered)
}

func (s *StoreServer) handleOrdersBatch(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(r) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"code":    "woocommerce_rest_cannot_view",
			"message": "Autenticación requerida.",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	type orderUpdate struct {
		ID     int64  `json:"id"`
		Status string `json:"status"`
	}
	type batchPayload struct {
		Update []orderUpdate `json:"update"`
	}

	var payload batchPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload inválido"})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	var updatedOrders []WCOrder
	for _, u := range payload.Update {
		for idx, o := range s.orders {
			if o.ID == u.ID {
				s.orders[idx].Status = u.Status
				s.orders[idx].DateModified = time.Now().Format(time.RFC3339)
				updatedOrders = append(updatedOrders, s.orders[idx])
				log.Printf("[%s] 🔄 Pedido #%d actualizado a estado: %s", s.storeID, u.ID, u.Status)
				break
			}
		}
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"update": updatedOrders,
	})
}

func (s *StoreServer) handleCreateRandomOrder(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.orderSeq++
	id := s.orderSeq

	locations := []struct {
		name, email, address, comuna, region, phone string
	}{
		{"Gonzalo Rivera", fmt.Sprintf("cliente_%d@gmail.com", id), "Av. Las Condes 10450, Depto 304", "Las Condes", "Región Metropolitana", "+56 9 9876 5432"},
		{"Francisca Lara", fmt.Sprintf("cliente_%d@gmail.com", id), "Calle Sucre 1420", "Ñuñoa", "Región Metropolitana", "+56 9 8765 4321"},
		{"Ignacio Soto", fmt.Sprintf("cliente_%d@gmail.com", id), "Av. Libertad 340, Depto 102", "Viña del Mar", "Valparaíso", "+56 9 7654 3210"},
		{"Daniela Tapia", fmt.Sprintf("cliente_%d@gmail.com", id), "Barros Arana 550", "Concepción", "Biobío", "+56 9 6543 2109"},
		{"Paula Castro", fmt.Sprintf("cliente_%d@gmail.com", id), "Av. El Santo 1280", "La Serena", "Coquimbo", "+56 9 5432 1098"},
	}
	loc := locations[rand.Intn(len(locations))]

	var items []WCLineItem
	if s.storeID == "tienda1" {
		items = []WCLineItem{
			{ID: id*10 + 1, Name: "Polera Algodón Pima Orgánico", ProductID: 101, Quantity: 2, Price: 19990, Total: "39980", Subtotal: "39980", SKU: "MODA-POL-01"},
		}
	} else if s.storeID == "tienda3" {
		hogarItems := []WCLineItem{
			{ID: id*10 + 1, Name: "Silla Ergonómica Home Office Premium", ProductID: 701, Quantity: 1, Price: 189990, Total: "189990", Subtotal: "189990", SKU: "HOGAR-SIL-01"},
			{ID: id*10 + 1, Name: "Lámpara LED Escritorio Regulable", ProductID: 703, Quantity: 2, Price: 34990, Total: "69980", Subtotal: "69980", SKU: "HOGAR-LMP-03"},
			{ID: id*10 + 1, Name: "Monitor Curvo 34'' UltraWide", ProductID: 704, Quantity: 1, Price: 449990, Total: "449990", Subtotal: "449990", SKU: "HOGAR-MON-34"},
		}
		items = []WCLineItem{hogarItems[rand.Intn(len(hogarItems))]}
	} else {
		items = []WCLineItem{
			{ID: id*10 + 1, Name: "Auriculares Wireless Noise Cancelling", ProductID: 305, Quantity: 1, Price: 89990, Total: "89990", Subtotal: "89990", SKU: "TECH-AUD-NC"},
		}
	}

	var total float64
	for _, it := range items {
		total += it.Price * float64(it.Quantity)
	}

	var shipping WCShipping
	var meta WCMetaData

	if s.storeID == "tienda1" {
		shipping = WCShipping{
			FirstName: loc.name,
			LastName:  "",
			Address1:  loc.address,
			City:      loc.comuna,
			State:     loc.region,
			Postcode:  "7500000",
			Country:   "CL",
			Phone:     loc.phone,
		}
	} else if s.storeID == "tienda3" {
		// Plugin "WooComuna Pro" - completely different meta_data keys
		meta = WCMetaData{
			WooDireccionCompleta: loc.address,
			WooBarrio:            loc.comuna,
			WooRegionEntrega:     loc.region,
			WooRutCliente:        fmt.Sprintf("%d.%d.%d-%d", id%10+1, (id*7)%999, (id*3)%999, id%9),
			WooInstrucciones:     "Llamar antes de llegar",
		}
	} else {
		meta = WCMetaData{
			CustomDeliveryAddress: loc.address,
			CustomCommune:         loc.comuna,
			CustomRegion:          loc.region,
		}
	}

	order := WCOrder{
		ID:             id,
		Number:         fmt.Sprintf("%d", id),
		OrderKey:       fmt.Sprintf("wc_order_%s_%d", s.storeID, id),
		CreatedVia:     "checkout",
		Version:        "8.6.1",
		Status:         "processing",
		Currency:       s.currency,
		DateCreated:    time.Now().Format(time.RFC3339),
		DateCreatedGMT: time.Now().UTC().Format(time.RFC3339),
		DateModified:   time.Now().Format(time.RFC3339),
		Total:          fmt.Sprintf("%.2f", total),
		Billing: WCBilling{
			FirstName: loc.name,
			LastName:  "",
			Address1:  loc.address,
			City:      loc.comuna,
			State:     loc.region,
			Postcode:  "7500000",
			Country:   "CL",
			Email:     loc.email,
			Phone:     loc.phone,
		},
		Shipping:           shipping,
		MetaData:           meta,
		LineItems:          items,
		PaymentMethod:      "webpay_plus",
		PaymentMethodTitle: "Webpay Plus Transbank",
	}

	s.orders = append([]WCOrder{order}, s.orders...)

	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *StoreServer) handleUI(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" {
		http.NotFound(w, r)
		return
	}

	s.mu.RLock()
	orders := s.orders
	s.mu.RUnlock()

	pluginNote := ""
	if s.storeID == "tienda2" {
		pluginNote = `<div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 8px; padding: 10px 14px; font-size: 12px; margin-bottom: 1rem;">
			🔌 <strong>Plugin de Checkout Activo:</strong> Las direcciones de despacho se almacenan en <code>meta_data.custom_delivery_address</code> en lugar de <code>shipping.address_1</code>.
		</div>`
	} else if s.storeID == "tienda3" {
		pluginNote = `<div style="background: #fdf4ff; border: 1px solid #e9d5ff; color: #7e22ce; border-radius: 8px; padding: 10px 14px; font-size: 12px; margin-bottom: 1rem;">
			🔌 <strong>Plugin WooComuna Pro Activo:</strong> Esta tienda usa campos completamente distintos:
			<code>meta_data.woo_barrio</code> (comuna),
			<code>meta_data.woo_region_entrega</code> (región),
			<code>meta_data.woo_direccion_completa</code> (dirección),
			<code>meta_data.woo_rut_cliente</code> (RUT),
			<code>meta_data.woo_instrucciones_entrega</code> (instrucciones) —
			requiere mapeo de campos diferente al de Tienda 1 y Tienda 2.
			</div>`
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>%s - WooCommerce Store</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 2rem; }
        .container { max-width: 1100px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 2rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
        .badge { background: #96588a; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .btn { background: #7f54b3; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; transition: background 0.15s; }
        .btn:hover { background: #6b439c; }
        table { width: 100%%; border-collapse: collapse; margin-top: 1rem; font-size: 13px; }
        th { background: #f8fafc; padding: 10px 12px; text-align: left; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; }
        td { padding: 12px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .status { background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; display: inline-block; }
        .credentials { background: #f1f5f9; border-radius: 8px; padding: 12px 16px; font-size: 12px; margin-top: 1.5rem; font-family: monospace; color: #334155; }
        .phone { color: #0284c7; font-weight: 600; font-size: 12px; }
        .address { font-weight: 600; color: #334155; }
        .comuna { color: #d97706; font-weight: 700; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1 style="margin: 0; font-size: 1.5rem; color: #1e293b;">🛒 %s</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Instancia WooCommerce REST API v3 Activa | %s</p>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <span class="badge">WooCommerce 8.6.1</span>
                <form action="/create-random-order" method="POST" style="margin: 0;">
                    <button type="submit" class="btn">➕ Generar Nuevo Pedido de Prueba</button>
                </form>
            </div>
        </div>

        %s

        <h3 style="font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Pedidos Registrados en esta Tienda (%d)</h3>
        <table>
            <thead>
                <tr>
                    <th>ID / Pedido</th>
                    <th>Fecha</th>
                    <th>Cliente & Teléfono</th>
                    <th>Dirección & Comuna</th>
                    <th>Productos</th>
                    <th>Total</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>`, s.storeName, s.storeName, s.storeID, pluginNote, len(orders))

	for _, o := range orders {
		itemNames := ""
		for idx, it := range o.LineItems {
			if idx > 0 {
				itemNames += ", "
			}
			itemNames += fmt.Sprintf("%dx %s", it.Quantity, it.Name)
		}

		phoneDisplay := o.Billing.Phone
		if phoneDisplay == "" {
			phoneDisplay = "+56 9 9123 4567"
		}

		addrDisplay := o.Shipping.Address1
		if addrDisplay == "" {
			addrDisplay = o.MetaData.WooDireccionCompleta // Tienda 3: WooComuna Pro
		}
		if addrDisplay == "" {
			addrDisplay = o.MetaData.CustomDeliveryAddress // Tienda 2: Custom Checkout
		}
		if addrDisplay == "" {
			addrDisplay = o.Billing.Address1
		}

		cityDisplay := o.Shipping.City
		if cityDisplay == "" {
			cityDisplay = o.MetaData.WooBarrio // Tienda 3: WooComuna Pro
		}
		if cityDisplay == "" {
			cityDisplay = o.MetaData.CustomCommune // Tienda 2: Custom Checkout
		}
		if cityDisplay == "" {
			cityDisplay = o.Billing.City
		}

		stateDisplay := o.Shipping.State
		if stateDisplay == "" {
			stateDisplay = o.MetaData.WooRegionEntrega // Tienda 3: WooComuna Pro
		}
		if stateDisplay == "" {
			stateDisplay = o.MetaData.CustomRegion // Tienda 2: Custom Checkout
		}
		if stateDisplay == "" {
			stateDisplay = o.Billing.State
		}

		statusBg := "#ecfdf5"
		statusColor := "#059669"
		statusLabel := o.Status
		if o.Status == "sincronizado" || o.Status == "synced" {
			statusBg = "#f3e8ff"
			statusColor = "#7e22ce"
			statusLabel = "✅ Sincronizado"
		} else if o.Status == "processing" {
			statusLabel = "⏳ Procesando"
		}

		fmt.Fprintf(w, `
                <tr>
                    <td><strong>#%s</strong></td>
                    <td style="color: #64748b; font-size: 12px;">%s</td>
                    <td>
                        <strong>%s %s</strong><br>
                        <small style="color: #94a3b8;">%s</small><br>
                        <span class="phone">📞 %s</span>
                    </td>
                    <td>
                        <span class="address">📍 %s</span><br>
                        <span class="comuna">🏘️ %s</span> <small style="color: #64748b;">(%s)</small>
                    </td>
                    <td style="font-size: 12px;">%s</td>
                    <td><strong>$%s %s</strong></td>
                    <td><span class="status" style="background: %s; color: %s;">%s</span></td>
                </tr>`, o.Number, o.DateCreated[:10]+" "+o.DateCreated[11:16],
			o.Billing.FirstName, o.Billing.LastName, o.Billing.Email, phoneDisplay,
			addrDisplay, cityDisplay, stateDisplay,
			itemNames, o.Total, o.Currency, statusBg, statusColor, statusLabel)
	}

	fmt.Fprintf(w, `
            </tbody>
        </table>

        <div class="credentials">
            <strong>Endpoint REST v3 para API-Gateway:</strong> <code>http://%s:8080/wp-json/wc/v3</code><br>
            <strong>Consumer Key:</strong> <code>%s</code> | <strong>Consumer Secret:</strong> <code>%s</code>
        </div>
    </div>
</body>
</html>`, s.storeID, s.apiKey, s.apiSecret)
}

func main() {
	storeID := os.Getenv("STORE_ID")
	if storeID == "" {
		storeID = "tienda1"
	}
	storeName := os.Getenv("STORE_NAME")
	if storeName == "" {
		storeName = "Tienda 1 - Moda & Calzado"
	}
	currency := os.Getenv("CURRENCY")
	if currency == "" {
		currency = "CLP"
	}
	apiKey := os.Getenv("WC_KEY")
	if apiKey == "" {
		apiKey = "ck_tienda_key"
	}
	apiSecret := os.Getenv("WC_SECRET")
	if apiSecret == "" {
		apiSecret = "cs_tienda_secret"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := NewStoreServer(storeID, storeName, currency, apiKey, apiSecret)

	mux := http.NewServeMux()
	mux.HandleFunc("/wp-json/wc/v3/system_status", server.handleSystemStatus)
	mux.HandleFunc("/wp-json/wc/v3/orders/batch", server.handleOrdersBatch)
	mux.HandleFunc("/wp-json/wc/v3/orders", server.handleOrders)
	mux.HandleFunc("/create-random-order", server.handleCreateRandomOrder)
	mux.HandleFunc("/", server.handleUI)

	log.Printf("🚀 WooCommerce Store [%s] (%s) corriendo en http://0.0.0.0:%s", storeID, storeName, port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Error iniciando servidor: %v", err)
	}
}
