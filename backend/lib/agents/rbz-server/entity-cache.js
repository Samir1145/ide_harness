'use strict';

/**
 * EntityCache: Smart In-Memory TTL Cache for RBZ Server Intelligence
 * ------------------------------------------------------------------
 * Caches MCA Company Master Profiles and Address Cluster Graph Traversal
 * results to prevent redundant PostgreSQL queries and reduce CPU latency.
 */

class EntityCache {
    /**
     * @param {Object} options
     * @param {number} [options.maxEntries=1000] Maximum entries before LRU eviction
     * @param {number} [options.defaultTtlMs=3600000] Default TTL in ms (1 hour)
     */
    constructor(options = {}) {
        this.maxEntries = options.maxEntries || 1000;
        this.defaultTtlMs = options.defaultTtlMs || 3600000; // 1 hour
        this._cache = new Map(); // key -> { value, expiresAt, lastAccessed }
        this._stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            evictions: 0
        };
    }

    /**
     * Normalizes a CIN for cache lookup.
     */
    companyKey(cin) {
        return `cin:${(cin || '').trim().toUpperCase()}`;
    }

    /**
     * Normalizes an address string for cluster cache lookup.
     */
    addressKey(address) {
        const clean = (address || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 80);
        return `addr:${clean}`;
    }

    /**
     * Retrieves an item from the cache if not expired.
     */
    get(key) {
        const entry = this._cache.get(key);
        if (!entry) {
            this._stats.misses++;
            return null;
        }

        const now = Date.now();
        if (entry.expiresAt && now > entry.expiresAt) {
            // Expired
            this._cache.delete(key);
            this._stats.misses++;
            return null;
        }

        entry.lastAccessed = now;
        this._stats.hits++;
        return entry.value;
    }

    /**
     * Stores an item with a TTL.
     */
    set(key, value, ttlMs) {
        if (!key || value === undefined) return;

        // Evict if max size reached
        if (this._cache.size >= this.maxEntries && !this._cache.has(key)) {
            this._evictOldest();
        }

        const now = Date.now();
        const effectiveTtl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
        const expiresAt = effectiveTtl > 0 ? now + effectiveTtl : null;

        this._cache.set(key, {
            value,
            expiresAt,
            lastAccessed: now
        });
        this._stats.sets++;
    }

    /**
     * Checks if an active unexpired key exists.
     */
    has(key) {
        const entry = this._cache.get(key);
        if (!entry) return false;
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this._cache.delete(key);
            return false;
        }
        return true;
    }

    /**
     * Removes an item from cache.
     */
    invalidate(key) {
        return this._cache.delete(key);
    }

    /**
     * Clears all cache entries.
     */
    clear() {
        this._cache.clear();
        this._stats.hits = 0;
        this._stats.misses = 0;
        this._stats.sets = 0;
        this._stats.evictions = 0;
    }

    /**
     * Evicts least recently accessed item.
     * @private
     */
    _evictOldest() {
        let oldestKey = null;
        let oldestAccess = Infinity;

        for (const [k, v] of this._cache.entries()) {
            if (v.lastAccessed < oldestAccess) {
                oldestAccess = v.lastAccessed;
                oldestKey = k;
            }
        }

        if (oldestKey) {
            this._cache.delete(oldestKey);
            this._stats.evictions++;
        }
    }

    /**
     * Returns cache performance statistics.
     */
    getStats() {
        const total = this._stats.hits + this._stats.misses;
        const hitRatio = total > 0 ? parseFloat((this._stats.hits / total).toFixed(4)) : 0;
        return {
            size: this._cache.size,
            maxEntries: this.maxEntries,
            hits: this._stats.hits,
            misses: this._stats.misses,
            hitRatio,
            sets: this._stats.sets,
            evictions: this._stats.evictions
        };
    }
}

// Global Singleton for RBZ Server
const defaultEntityCache = new EntityCache();

module.exports = {
    EntityCache,
    entityCache: defaultEntityCache
};
