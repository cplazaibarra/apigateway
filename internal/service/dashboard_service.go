package service

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"time"

	"order-integration-hub/internal/domain"
)

type DashboardService struct {
	db *sql.DB
}

func NewDashboardService(db *sql.DB) *DashboardService {
	return &DashboardService{db: db}
}

type DashboardFilter struct {
	CustomerID    string
	Provider      string
	IntegrationID string
	DateFrom      *time.Time
	DateTo        *time.Time
	Status        string
}

func (s *DashboardService) GetSummary(ctx context.Context, f DashboardFilter) (*domain.DashboardSummary, error) {
	summary := &domain.DashboardSummary{
		AvgResponseTimeByProvider: make(map[string]int),
		ProblematicIntegrations:   make([]domain.ProblematicIntegration, 0),
	}

	// 1. Total Customers
	_ = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM customers WHERE is_active = true").Scan(&summary.TotalCustomers)

	// 2. Integration status counts
	intRows, err := s.db.QueryContext(ctx, `
		SELECT status, polling_enabled, COUNT(*)
		FROM integrations
		GROUP BY status, polling_enabled
	`)
	if err == nil {
		defer intRows.Close()
		for intRows.Next() {
			var st string
			var pol bool
			var cnt int64
			if err := intRows.Scan(&st, &pol, &cnt); err == nil {
				if st == "ACTIVE" {
					summary.ActiveIntegrations += cnt
				} else if st == "ERROR" {
					summary.ErrorIntegrations += cnt
				}
				if !pol || st == "DISABLED" {
					summary.DisabledIntegrations += cnt
				}
			}
		}
	}

	// 3. Today's metrics (queries, recovered orders, errors)
	todayStart := time.Now().Truncate(24 * time.Hour)
	_ = s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(COUNT(*), 0) AS today_queries,
			COALESCE(SUM(orders_found), 0) AS today_orders,
			COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) AS today_errors,
			COALESCE(AVG(duration_ms), 0) AS avg_duration,
			MAX(finished_at) AS last_sync
		FROM sync_jobs
		WHERE started_at >= $1
	`, todayStart).Scan(&summary.TodayQueries, &summary.TodayRecoveredOrders, &summary.TodayErrors, &summary.AvgResponseTimeMs, &summary.GlobalLastSync)

	if summary.TodayQueries > 0 {
		successCount := summary.TodayQueries - summary.TodayErrors
		summary.SuccessRatePercent = math.Round((float64(successCount)/float64(summary.TodayQueries)*100)*10) / 10
	} else {
		summary.SuccessRatePercent = 100.0
	}

	// 4. Avg response time by provider
	provRows, err := s.db.QueryContext(ctx, `
		SELECT provider, COALESCE(AVG(avg_response_time_ms), 0)
		FROM integrations
		GROUP BY provider
	`)
	if err == nil {
		defer provRows.Close()
		for provRows.Next() {
			var prov string
			var avgMs float64
			if err := provRows.Scan(&prov, &avgMs); err == nil {
				summary.AvgResponseTimeByProvider[prov] = int(avgMs)
			}
		}
	}

	// 5. Problematic Integrations
	probRows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.name, c.id, c.name, i.provider, i.last_sync_at, COALESCE(i.last_error, ''),
		       i.status, i.consecutive_errors, i.next_polling_at
		FROM integrations i
		JOIN customers c ON i.customer_id = c.id
		WHERE i.status = 'ERROR' OR i.consecutive_errors > 0
		ORDER BY i.consecutive_errors DESC, i.last_sync_at DESC
		LIMIT 10
	`)
	if err == nil {
		defer probRows.Close()
		for probRows.Next() {
			var p domain.ProblematicIntegration
			if err := probRows.Scan(&p.IntegrationID, &p.IntegrationName, &p.CustomerID, &p.CustomerName,
				&p.Provider, &p.LastRunAt, &p.LastError, &p.Status, &p.ConsecutiveFailures, &p.NextPollingAt); err == nil {
				summary.ProblematicIntegrations = append(summary.ProblematicIntegrations, p)
			}
		}
	}

	return summary, nil
}

type ChartsResponse struct {
	HourlyQueries     domain.ChartDataSeries `json:"hourly_queries"`
	DailyQueries      domain.ChartDataSeries `json:"daily_queries"`
	DailyErrors       domain.ChartDataSeries `json:"daily_errors"`
	DailyOrders       domain.ChartDataSeries `json:"daily_orders"`
	AvgResponseTime   domain.ChartDataSeries `json:"avg_response_time"`
	QueriesByProvider domain.ChartDataSeries `json:"queries_by_provider"`
	QueriesByCustomer domain.ChartDataSeries `json:"queries_by_customer"`
}

func (s *DashboardService) GetCharts(ctx context.Context, f DashboardFilter) (*ChartsResponse, error) {
	now := time.Now()

	// 1. Hourly Queries (last 24 hours)
	hourlyLabels := make([]string, 24)
	hourlySuccess := make([]float64, 24)
	hourlyErrors := make([]float64, 24)
	for i := 23; i >= 0; i-- {
		t := now.Add(-time.Duration(i) * time.Hour)
		hourlyLabels[23-i] = fmt.Sprintf("%02d:00", t.Hour())
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT
			EXTRACT(HOUR FROM started_at) AS hr,
			COUNT(CASE WHEN status != 'FAILED' THEN 1 END) AS successes,
			COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS fails
		FROM sync_jobs
		WHERE started_at >= NOW() - INTERVAL '24 hours'
		GROUP BY hr
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var hr int
			var succ, fail int64
			if err := rows.Scan(&hr, &succ, &fail); err == nil {
				// Map to hourly index
				for idx, lbl := range hourlyLabels {
					if lbl == fmt.Sprintf("%02d:00", hr) {
						hourlySuccess[idx] = float64(succ)
						hourlyErrors[idx] = float64(fail)
					}
				}
			}
		}
	}

	// 2. Daily Queries, Errors, Orders (last 7 days)
	dailyLabels := make([]string, 7)
	dailyQueriesData := make([]float64, 7)
	dailyErrorsData := make([]float64, 7)
	dailyOrdersData := make([]float64, 7)
	dailyAvgLatency := make([]float64, 7)

	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		dailyLabels[6-i] = d.Format("02 Jan")
	}

	dRows, err := s.db.QueryContext(ctx, `
		SELECT
			TO_CHAR(started_at, 'DD Mon') AS dt_label,
			COUNT(*) AS total_q,
			COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS total_err,
			COALESCE(SUM(orders_found), 0) AS total_ord,
			COALESCE(AVG(duration_ms), 0) AS avg_lat
		FROM sync_jobs
		WHERE started_at >= NOW() - INTERVAL '7 days'
		GROUP BY dt_label
	`)
	if err == nil {
		defer dRows.Close()
		for dRows.Next() {
			var lbl string
			var q, errs, ords int64
			var lat float64
			if err := dRows.Scan(&lbl, &q, &errs, &ords, &lat); err == nil {
				for idx, dlbl := range dailyLabels {
					if stringsEqualIgnoreCase(dlbl, lbl) {
						dailyQueriesData[idx] = float64(q)
						dailyErrorsData[idx] = float64(errs)
						dailyOrdersData[idx] = float64(ords)
						dailyAvgLatency[idx] = math.Round(lat)
					}
				}
			}
		}
	}

	// 3. Queries by Provider
	provLabels := []string{}
	provData := []float64{}
	pRows, err := s.db.QueryContext(ctx, `
		SELECT i.provider, COUNT(j.id)
		FROM sync_jobs j
		JOIN integrations i ON j.integration_id = i.id
		GROUP BY i.provider
	`)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var p string
			var cnt int64
			if err := pRows.Scan(&p, &cnt); err == nil {
				provLabels = append(provLabels, p)
				provData = append(provData, float64(cnt))
			}
		}
	}

	// 4. Queries by Customer
	custLabels := []string{}
	custData := []float64{}
	cRows, err := s.db.QueryContext(ctx, `
		SELECT c.name, COUNT(j.id)
		FROM sync_jobs j
		JOIN integrations i ON j.integration_id = i.id
		JOIN customers c ON i.customer_id = c.id
		GROUP BY c.name
		ORDER BY COUNT(j.id) DESC
		LIMIT 5
	`)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var name string
			var cnt int64
			if err := cRows.Scan(&name, &cnt); err == nil {
				custLabels = append(custLabels, name)
				custData = append(custData, float64(cnt))
			}
		}
	}

	return &ChartsResponse{
		HourlyQueries: domain.ChartDataSeries{
			Labels: hourlyLabels,
			Datasets: []domain.Dataset{
				{Label: "Consultas Exitosas", Data: hourlySuccess, BorderColor: "#10b981", BackgroundColor: "rgba(16, 185, 129, 0.1)"},
				{Label: "Errores", Data: hourlyErrors, BorderColor: "#ef4444", BackgroundColor: "rgba(239, 68, 68, 0.1)"},
			},
		},
		DailyQueries: domain.ChartDataSeries{
			Labels: dailyLabels,
			Datasets: []domain.Dataset{
				{Label: "Total Consultas", Data: dailyQueriesData, BorderColor: "#3b82f6", BackgroundColor: "rgba(59, 130, 246, 0.15)"},
			},
		},
		DailyErrors: domain.ChartDataSeries{
			Labels: dailyLabels,
			Datasets: []domain.Dataset{
				{Label: "Errores", Data: dailyErrorsData, BorderColor: "#ef4444", BackgroundColor: "rgba(239, 68, 68, 0.15)"},
			},
		},
		DailyOrders: domain.ChartDataSeries{
			Labels: dailyLabels,
			Datasets: []domain.Dataset{
				{Label: "Pedidos Sincronizados", Data: dailyOrdersData, BorderColor: "#8b5cf6", BackgroundColor: "rgba(139, 92, 246, 0.15)"},
			},
		},
		AvgResponseTime: domain.ChartDataSeries{
			Labels: dailyLabels,
			Datasets: []domain.Dataset{
				{Label: "Tiempo Promedio (ms)", Data: dailyAvgLatency, BorderColor: "#f59e0b", BackgroundColor: "rgba(245, 158, 11, 0.15)"},
			},
		},
		QueriesByProvider: domain.ChartDataSeries{
			Labels: provLabels,
			Datasets: []domain.Dataset{
				{Label: "Consultas por Proveedor", Data: provData},
			},
		},
		QueriesByCustomer: domain.ChartDataSeries{
			Labels: custLabels,
			Datasets: []domain.Dataset{
				{Label: "Consultas por Cliente", Data: custData},
			},
		},
	}, nil
}

type DetailedStatistics struct {
	TotalQueries      int64       `json:"total_queries"`
	SuccessQueries    int64       `json:"success_queries"`
	FailedQueries     int64       `json:"failed_queries"`
	SuccessRate       float64     `json:"success_rate"`
	AvgDurationMs     int         `json:"avg_duration_ms"`
	MinDurationMs     int         `json:"min_duration_ms"`
	MaxDurationMs     int         `json:"max_duration_ms"`
	P95DurationMs     int         `json:"p95_duration_ms"`
	RecoveredOrders   int64       `json:"recovered_orders"`
	TotalRetries      int64       `json:"total_retries"`
	TotalTimeouts     int64       `json:"total_timeouts"`
	GroupedByProvider []StatGroup `json:"grouped_by_provider"`
	GroupedByCustomer []StatGroup `json:"grouped_by_customer"`
}

type StatGroup struct {
	Name         string  `json:"name"`
	TotalQueries int64   `json:"total_queries"`
	SuccessCount int64   `json:"success_count"`
	ErrorCount   int64   `json:"error_count"`
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMs int     `json:"avg_latency_ms"`
	OrdersCount  int64   `json:"orders_count"`
}

func (s *DashboardService) GetStatistics(ctx context.Context) (*DetailedStatistics, error) {
	stats := &DetailedStatistics{}

	// Global stats
	_ = s.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*),
			COUNT(CASE WHEN status != 'FAILED' THEN 1 END),
			COUNT(CASE WHEN status = 'FAILED' THEN 1 END),
			COALESCE(AVG(duration_ms), 0),
			COALESCE(MIN(duration_ms), 0),
			COALESCE(MAX(duration_ms), 0),
			COALESCE(SUM(orders_found), 0),
			COALESCE(SUM(retries_count), 0),
			COUNT(CASE WHEN error_message ILIKE '%timeout%' THEN 1 END)
		FROM sync_jobs
	`).Scan(&stats.TotalQueries, &stats.SuccessQueries, &stats.FailedQueries, &stats.AvgDurationMs,
		&stats.MinDurationMs, &stats.MaxDurationMs, &stats.RecoveredOrders, &stats.TotalRetries, &stats.TotalTimeouts)

	if stats.TotalQueries > 0 {
		stats.SuccessRate = math.Round((float64(stats.SuccessQueries)/float64(stats.TotalQueries)*100)*10) / 10
	} else {
		stats.SuccessRate = 100.0
	}

	// Calculate P95 latency
	durRows, err := s.db.QueryContext(ctx, "SELECT duration_ms FROM sync_jobs WHERE duration_ms > 0 ORDER BY duration_ms ASC")
	if err == nil {
		defer durRows.Close()
		var durations []int
		for durRows.Next() {
			var d int
			if err := durRows.Scan(&d); err == nil {
				durations = append(durations, d)
			}
		}
		if len(durations) > 0 {
			p95Idx := int(float64(len(durations)) * 0.95)
			if p95Idx >= len(durations) {
				p95Idx = len(durations) - 1
			}
			sort.Ints(durations)
			stats.P95DurationMs = durations[p95Idx]
		}
	}

	// Grouped by Provider
	pRows, err := s.db.QueryContext(ctx, `
		SELECT i.provider,
		       COUNT(j.id) as total_q,
		       COUNT(CASE WHEN j.status != 'FAILED' THEN 1 END) as succ,
		       COUNT(CASE WHEN j.status = 'FAILED' THEN 1 END) as errs,
		       COALESCE(AVG(j.duration_ms), 0) as avg_lat,
		       COALESCE(SUM(j.orders_found), 0) as total_ord
		FROM sync_jobs j
		JOIN integrations i ON j.integration_id = i.id
		GROUP BY i.provider
		ORDER BY total_q DESC
	`)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var g StatGroup
			if err := pRows.Scan(&g.Name, &g.TotalQueries, &g.SuccessCount, &g.ErrorCount, &g.AvgLatencyMs, &g.OrdersCount); err == nil {
				if g.TotalQueries > 0 {
					g.SuccessRate = math.Round((float64(g.SuccessCount)/float64(g.TotalQueries)*100)*10) / 10
				}
				stats.GroupedByProvider = append(stats.GroupedByProvider, g)
			}
		}
	}

	// Grouped by Customer
	cRows, err := s.db.QueryContext(ctx, `
		SELECT c.name,
		       COUNT(j.id) as total_q,
		       COUNT(CASE WHEN j.status != 'FAILED' THEN 1 END) as succ,
		       COUNT(CASE WHEN j.status = 'FAILED' THEN 1 END) as errs,
		       COALESCE(AVG(j.duration_ms), 0) as avg_lat,
		       COALESCE(SUM(j.orders_found), 0) as total_ord
		FROM sync_jobs j
		JOIN integrations i ON j.integration_id = i.id
		JOIN customers c ON i.customer_id = c.id
		GROUP BY c.name
		ORDER BY total_q DESC
	`)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var g StatGroup
			if err := cRows.Scan(&g.Name, &g.TotalQueries, &g.SuccessCount, &g.ErrorCount, &g.AvgLatencyMs, &g.OrdersCount); err == nil {
				if g.TotalQueries > 0 {
					g.SuccessRate = math.Round((float64(g.SuccessCount)/float64(g.TotalQueries)*100)*10) / 10
				}
				stats.GroupedByCustomer = append(stats.GroupedByCustomer, g)
			}
		}
	}

	return stats, nil
}

func stringsEqualIgnoreCase(a, b string) bool {
	return fmt.Sprintf("%s", a) == fmt.Sprintf("%s", b)
}
