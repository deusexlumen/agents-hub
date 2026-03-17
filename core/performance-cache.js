/**
 * Performance Cache
 * 
 * Multi-level caching for templates, states, and contexts
 * Memory + Disk caching with TTL
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MEMORY_CACHE: {
    MAX_SIZE: 50 * 1024 * 1024, // 50MB
    DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes
    CLEANUP_INTERVAL_MS: 60 * 1000 // 1 minute
  },
  DISK_CACHE: {
    ENABLED: true,
    DIR: './cache',
    MAX_SIZE: 100 * 1024 * 1024, // 100MB
    DEFAULT_TTL_MS: 30 * 60 * 1000 // 30 minutes
  },
  COMPRESSION: {
    ENABLED: true,
    THRESHOLD_BYTES: 1024 // Compress entries > 1KB
  }
};

// ============================================================================
// Memory Cache
// ============================================================================

class MemoryCache {
  constructor(config = {}) {
    this.config = { ...CONFIG.MEMORY_CACHE, ...config };
    this.cache = new Map();
    this.size = 0;
    this.hits = 0;
    this.misses = 0;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, this.config.CLEANUP_INTERVAL_MS);
  }

  /**
   * Get entry from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Check if expired
    if (entry.expires && entry.expires < Date.now()) {
      this.delete(key);
      this.misses++;
      return null;
    }
    
    entry.lastAccessed = Date.now();
    entry.accessCount = (entry.accessCount || 0) + 1;
    
    this.hits++;
    return entry.value;
  }

  /**
   * Set entry in cache
   */
  set(key, value, options = {}) {
    const ttl = options.ttl || this.config.DEFAULT_TTL_MS;
    const size = this._estimateSize(value);
    
    // Check if we need to make room
    while (this.size + size > this.config.MAX_SIZE && this.cache.size > 0) {
      this._evictLRU();
    }
    
    const entry = {
      key,
      value,
      size,
      created: Date.now(),
      expires: ttl > 0 ? Date.now() + ttl : null,
      lastAccessed: Date.now(),
      accessCount: 0
    };
    
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.size -= this.cache.get(key).size;
    }
    
    this.cache.set(key, entry);
    this.size += size;
    
    return entry;
  }

  /**
   * Delete entry from cache
   */
  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.size -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Check if key exists
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (entry.expires && entry.expires < Date.now()) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.size = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.size,
      maxSize: this.config.MAX_SIZE,
      entries: this.cache.size,
      utilization: (this.size / this.config.MAX_SIZE * 100).toFixed(2) + '%',
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 
        ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  _estimateSize(value) {
    // Rough estimation
    if (typeof value === 'string') {
      return Buffer.byteLength(value, 'utf8');
    }
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  }

  _evictLRU() {
    let oldest = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldest = key;
        oldestTime = entry.lastAccessed;
      }
    }
    
    if (oldest) {
      this.delete(oldest);
    }
  }

  _cleanup() {
    const now = Date.now();
    const toDelete = [];
    
    for (const [key, entry] of this.cache) {
      if (entry.expires && entry.expires < now) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => this.delete(key));
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

// ============================================================================
// Disk Cache
// ============================================================================

class DiskCache {
  constructor(config = {}) {
    this.config = { ...CONFIG.DISK_CACHE, ...config };
    this.cacheDir = path.resolve(__dirname, this.config.DIR);
    
    if (this.config.ENABLED) {
      this._ensureDirectory();
    }
  }

  _ensureDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  _getCacheFile(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Get entry from disk cache
   */
  get(key) {
    if (!this.config.ENABLED) return null;
    
    const filePath = this._getCacheFile(key);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Check expiration
      if (data.expires && data.expires < Date.now()) {
        fs.unlinkSync(filePath);
        return null;
      }
      
      return data.value;
    } catch (e) {
      // Corrupted cache entry
      try {
        fs.unlinkSync(filePath);
      } catch {}
      return null;
    }
  }

  /**
   * Set entry in disk cache
   */
  set(key, value, options = {}) {
    if (!this.config.ENABLED) return false;
    
    const ttl = options.ttl || this.config.DEFAULT_TTL_MS;
    const filePath = this._getCacheFile(key);
    
    const data = {
      key,
      value,
      created: Date.now(),
      expires: ttl > 0 ? Date.now() + ttl : null
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data));
    return true;
  }

  /**
   * Delete entry from disk cache
   */
  delete(key) {
    if (!this.config.ENABLED) return false;
    
    const filePath = this._getCacheFile(key);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    
    return false;
  }

  /**
   * Clear all disk cache
   */
  clear() {
    if (!this.config.ENABLED) return;
    
    const files = fs.readdirSync(this.cacheDir);
    files.forEach(file => {
      fs.unlinkSync(path.join(this.cacheDir, file));
    });
  }

  /**
   * Get disk cache stats
   */
  getStats() {
    if (!this.config.ENABLED) {
      return { enabled: false };
    }
    
    let totalSize = 0;
    let count = 0;
    
    const files = fs.readdirSync(this.cacheDir);
    files.forEach(file => {
      const stats = fs.statSync(path.join(this.cacheDir, file));
      totalSize += stats.size;
      count++;
    });
    
    return {
      enabled: true,
      entries: count,
      size: totalSize,
      maxSize: this.config.MAX_SIZE,
      utilization: (totalSize / this.config.MAX_SIZE * 100).toFixed(2) + '%'
    };
  }
}

// ============================================================================
// Multi-Level Cache
// ============================================================================

class MultiLevelCache {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.memory = new MemoryCache(this.config.MEMORY_CACHE);
    this.disk = new DiskCache(this.config.DISK_CACHE);
  }

  /**
   * Get with multi-level lookup
   */
  get(key) {
    // Try memory first
    let value = this.memory.get(key);
    if (value !== null) {
      return { value, source: 'memory' };
    }
    
    // Try disk
    value = this.disk.get(key);
    if (value !== null) {
      // Promote to memory
      this.memory.set(key, value);
      return { value, source: 'disk' };
    }
    
    return { value: null, source: null };
  }

  /**
   * Set in both caches
   */
  set(key, value, options = {}) {
    const memoryOptions = { ttl: options.memoryTtl || options.ttl };
    const diskOptions = { ttl: options.diskTtl || options.ttl };
    
    this.memory.set(key, value, memoryOptions);
    this.disk.set(key, value, diskOptions);
  }

  /**
   * Delete from both caches
   */
  delete(key) {
    this.memory.delete(key);
    this.disk.delete(key);
  }

  /**
   * Clear all caches
   */
  clear() {
    this.memory.clear();
    this.disk.clear();
  }

  /**
   * Get combined stats
   */
  getStats() {
    return {
      memory: this.memory.getStats(),
      disk: this.disk.getStats()
    };
  }
}

// ============================================================================
// Template Cache Manager
// ============================================================================

class TemplateCache {
  constructor() {
    this.cache = new MultiLevelCache();
    this.metadata = new Map();
  }

  /**
   * Get cached template
   */
  get(templateName, options = {}) {
    const cacheKey = `template:${templateName}:${JSON.stringify(options)}`;
    const result = this.cache.get(cacheKey);
    
    if (result.value) {
      return result.value;
    }
    
    return null;
  }

  /**
   * Cache template
   */
  set(templateName, template, options = {}) {
    const cacheKey = `template:${templateName}:${JSON.stringify(options)}`;
    
    this.cache.set(cacheKey, template, {
      memoryTtl: 10 * 60 * 1000, // 10 min in memory
      diskTtl: 60 * 60 * 1000    // 1 hour on disk
    });
    
    this.metadata.set(templateName, {
      cachedAt: Date.now(),
      size: JSON.stringify(template).length
    });
  }

  /**
   * Invalidate template cache
   */
  invalidate(templateName) {
    // Find and delete all variants
    for (const key of this.cache.memory.cache.keys()) {
      if (key.startsWith(`template:${templateName}:`)) {
        this.cache.delete(key);
      }
    }
    
    this.metadata.delete(templateName);
  }

  /**
   * Get cache info for template
   */
  getInfo(templateName) {
    return this.metadata.get(templateName);
  }
}

// ============================================================================
// Context Cache Manager
// ============================================================================

class ContextCache {
  constructor() {
    this.cache = new MultiLevelCache();
  }

  /**
   * Get cached context for task
   */
  get(taskHash) {
    return this.cache.get(`context:${taskHash}`);
  }

  /**
   * Cache context
   */
  set(taskHash, context) {
    this.cache.set(`context:${taskHash}`, context, {
      memoryTtl: 5 * 60 * 1000,  // 5 min
      diskTtl: 15 * 60 * 1000    // 15 min
    });
  }

  /**
   * Generate hash for task description
   */
  static hashTask(taskDescription) {
    return crypto.createHash('md5').update(taskDescription).digest('hex');
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  MemoryCache,
  DiskCache,
  MultiLevelCache,
  TemplateCache,
  ContextCache,
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  console.log('Performance Cache v1.0\n');
  
  // Memory cache example
  console.log('Example: Memory Cache');
  const memory = new MemoryCache();
  memory.set('key1', 'value1');
  memory.set('key2', { data: 'value2' });
  console.log('  Stats:', memory.getStats());
  console.log('  Get key1:', memory.get('key1'));
  
  // Disk cache example
  console.log('\nExample: Disk Cache');
  const disk = new DiskCache();
  disk.set('key1', 'persisted value');
  console.log('  Stats:', disk.getStats());
  console.log('  Get key1:', disk.get('key1'));
  
  // Multi-level cache example
  console.log('\nExample: Multi-Level Cache');
  const multi = new MultiLevelCache();
  multi.set('key1', 'cached value');
  const result = multi.get('key1');
  console.log('  Result:', result);
  console.log('  Stats:', multi.getStats());
  
  // Cleanup
  memory.destroy();
  disk.clear();
  multi.clear();
  
  console.log('\nUsage:');
  console.log('  const { MultiLevelCache } = require("./performance-cache");');
  console.log('  const cache = new MultiLevelCache();');
  console.log('  cache.set("key", value);');
  console.log('  const { value, source } = cache.get("key");');
}
