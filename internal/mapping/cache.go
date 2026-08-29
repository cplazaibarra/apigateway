package mapping

import (
	"sync"
	"time"

	"order-integration-hub/internal/domain"
)

type cachedMapping struct {
	mappings  []domain.FieldMapping
	cachedAt  time.Time
	expiresAt time.Time
}

// MappingCache provides in-memory thread-safe caching of resolved field mappings
type MappingCache struct {
	mu     sync.RWMutex
	items  map[string]cachedMapping
	ttl    time.Duration
	hits   int64
	misses int64
}

func NewMappingCache(ttl time.Duration) *MappingCache {
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	return &MappingCache{
		items: make(map[string]cachedMapping),
		ttl:   ttl,
	}
}

// Get returns cached mappings if present and not expired
func (c *MappingCache) Get(integrationID string) ([]domain.FieldMapping, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	item, found := c.items[integrationID]
	if !found {
		c.misses++
		return nil, false
	}

	if time.Now().After(item.expiresAt) {
		c.misses++
		return nil, false
	}

	c.hits++
	// Return a copy to avoid external mutations
	out := make([]domain.FieldMapping, len(item.mappings))
	copy(out, item.mappings)
	return out, true
}

// Set stores mappings in cache
func (c *MappingCache) Set(integrationID string, mappings []domain.FieldMapping) {
	c.mu.Lock()
	defer c.mu.Unlock()

	out := make([]domain.FieldMapping, len(mappings))
	copy(out, mappings)

	now := time.Now()
	c.items[integrationID] = cachedMapping{
		mappings:  out,
		cachedAt:  now,
		expiresAt: now.Add(c.ttl),
	}
}

// Invalidate clears cache for a specific integration
func (c *MappingCache) Invalidate(integrationID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, integrationID)
}

// InvalidateAll flushes the whole cache
func (c *MappingCache) InvalidateAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]cachedMapping)
}

// Stats returns cache hits and misses
func (c *MappingCache) Stats() (int64, int64, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.hits, c.misses, len(c.items)
}
