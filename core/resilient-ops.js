/**
 * Resilient Operations Module
 * 
 * Provides retry logic, circuit breaker patterns, and resilient
 * file operations for the Agents Hub system.
 * 
 * @module resilient-ops
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Retry Configuration
// ============================================================================

const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  retryableErrors: ['EACCES', 'EPERM', 'EBUSY', 'ENOENT', 'ETIMEDOUT', 'ECONNRESET'],
  shouldRetry: (error, attempt) => true
};

// ============================================================================
// Retry Utility
// ============================================================================

/**
 * Execute an async function with retry logic
 * @param {Function} fn - Function to execute
 * @param {Object} config - Retry configuration
 * @returns {Promise} Function result
 */
async function withRetry(fn, config = {}) {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError;
  
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = cfg.retryableErrors.includes(error.code) || 
                         cfg.shouldRetry(error, attempt);
      
      if (!isRetryable || attempt === cfg.maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        cfg.delayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs
      );
      
      console.warn(`[Retry] Attempt ${attempt}/${cfg.maxAttempts} failed: ${error.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Circuit Breaker
// ============================================================================

class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.resetTimeout = config.resetTimeout || 60000; // 1 minute
    this.halfOpenMaxCalls = config.halfOpenMaxCalls || 3;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }
  
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        console.log('[CircuitBreaker] Entering HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }
  
  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        this.state = 'CLOSED';
        this.failures = 0;
        console.log('[CircuitBreaker] Circuit closed');
      }
    } else {
      this.failures = 0;
    }
  }
  
  _onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker] Circuit opened after ${this.failures} failures`);
    }
  }
  
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// ============================================================================
// Resilient File Operations
// ============================================================================

class ResilientFileOps {
  constructor(config = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.tempSuffix = '.tmp';
    this.backupSuffix = '.backup';
  }
  
  /**
   * Write file atomically (write to temp, then rename)
   */
  async writeFile(filePath, data, options = {}) {
    return withRetry(async () => {
      const tempPath = filePath + this.tempSuffix;
      const backupPath = filePath + this.backupSuffix;
      
      // Create backup if file exists
      if (fs.existsSync(filePath) && options.createBackup !== false) {
        try {
          fs.copyFileSync(filePath, backupPath);
        } catch (e) {
          console.warn(`[FileOps] Failed to create backup: ${e.message}`);
        }
      }
      
      // Write to temp file
      await this._writeToFile(tempPath, data);
      
      // Atomic rename
      fs.renameSync(tempPath, filePath);
      
      // Clean up backup on success
      if (fs.existsSync(backupPath)) {
        try {
          fs.unlinkSync(backupPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      return { success: true, path: filePath };
    }, this.retryConfig);
  }
  
  /**
   * Read file with retry
   */
  async readFile(filePath, options = {}) {
    return withRetry(async () => {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const encoding = options.encoding || 'utf8';
      const data = fs.readFileSync(filePath, encoding);
      
      return { success: true, data, path: filePath };
    }, this.retryConfig);
  }
  
  /**
   * Safe JSON read with validation
   */
  async readJSON(filePath, options = {}) {
    const result = await this.readFile(filePath, options);
    
    try {
      const parsed = JSON.parse(result.data);
      
      // Validate against schema if provided
      if (options.schema) {
        const validation = this._validateSchema(parsed, options.schema);
        if (!validation.valid) {
          throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
        }
      }
      
      return { ...result, data: parsed };
    } catch (error) {
      // Try to restore from backup if available
      const backupPath = filePath + this.backupSuffix;
      if (fs.existsSync(backupPath) && options.fallbackToBackup !== false) {
        console.warn(`[FileOps] JSON parse failed, trying backup: ${error.message}`);
        const backup = fs.readFileSync(backupPath, 'utf8');
        return { success: true, data: JSON.parse(backup), path: filePath, fromBackup: true };
      }
      throw error;
    }
  }
  
  /**
   * Safe JSON write
   */
  async writeJSON(filePath, data, options = {}) {
    const space = options.pretty !== false ? 2 : undefined;
    const jsonString = JSON.stringify(data, null, space);
    return this.writeFile(filePath, jsonString, options);
  }
  
  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath) {
    return withRetry(async () => {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return { success: true, path: dirPath };
    }, this.retryConfig);
  }
  
  /**
   * Safe delete with backup option
   */
  async deleteFile(filePath, options = {}) {
    return withRetry(async () => {
      if (!fs.existsSync(filePath)) {
        if (options.ignoreNotFound) {
          return { success: true, path: filePath, ignored: true };
        }
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Create backup before delete if requested
      if (options.createBackup) {
        const backupPath = filePath + '.deleted-' + Date.now();
        fs.copyFileSync(filePath, backupPath);
      }
      
      fs.unlinkSync(filePath);
      return { success: true, path: filePath };
    }, this.retryConfig);
  }
  
  /**
   * Copy file with verification
   */
  async copyFile(source, dest, options = {}) {
    return withRetry(async () => {
      if (!fs.existsSync(source)) {
        throw new Error(`Source file not found: ${source}`);
      }
      
      // Ensure destination directory exists
      const destDir = path.dirname(dest);
      await this.ensureDir(destDir);
      
      // Copy file
      fs.copyFileSync(source, dest);
      
      // Verify copy if requested
      if (options.verify) {
        const sourceStats = fs.statSync(source);
        const destStats = fs.statSync(dest);
        
        if (sourceStats.size !== destStats.size) {
          throw new Error('Copy verification failed: size mismatch');
        }
      }
      
      return { success: true, source, dest };
    }, this.retryConfig);
  }
  
  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  
  _writeToFile(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, data);
  }
  
  _validateSchema(data, schema) {
    // Simple schema validation - can be enhanced with joi/zod
    const errors = [];
    
    if (schema.required) {
      for (const field of schema.required) {
        if (data[field] === undefined) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

class BatchProcessor {
  constructor(config = {}) {
    this.batchSize = config.batchSize || 10;
    this.concurrency = config.concurrency || 3;
    this.retryConfig = config.retry || DEFAULT_RETRY_CONFIG;
  }
  
  /**
   * Process items in batches with controlled concurrency
   */
  async process(items, processorFn) {
    const results = [];
    const errors = [];
    
    // Split into batches
    const batches = this._chunk(items, this.batchSize);
    
    for (const batch of batches) {
      // Process batch with limited concurrency
      const batchResults = await this._processBatch(batch, processorFn);
      
      results.push(...batchResults.successes);
      errors.push(...batchResults.errors);
      
      // Log progress
      const progress = Math.round((results.length + errors.length) / items.length * 100);
      console.log(`[BatchProcessor] Progress: ${progress}% (${results.length} success, ${errors.length} errors)`);
    }
    
    return {
      total: items.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }
  
  async _processBatch(batch, processorFn) {
    const successes = [];
    const errors = [];
    
    // Process with limited concurrency using semaphore pattern
    const executing = [];
    
    for (const item of batch) {
      const promise = withRetry(async () => {
        return await processorFn(item);
      }, this.retryConfig).then(
        result => ({ success: true, item, result }),
        error => ({ success: false, item, error: error.message })
      );
      
      executing.push(promise);
      
      if (executing.length >= this.concurrency) {
        const completed = await Promise.race(executing);
        const index = executing.findIndex(p => p === completed);
        executing.splice(index, 1);
        
        if (completed.success) {
          successes.push(completed);
        } else {
          errors.push(completed);
        }
      }
    }
    
    // Wait for remaining
    const remaining = await Promise.all(executing);
    for (const result of remaining) {
      if (result.success) {
        successes.push(result);
      } else {
        errors.push(result);
      }
    }
    
    return { successes, errors };
  }
  
  _chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  withRetry,
  sleep,
  CircuitBreaker,
  ResilientFileOps,
  BatchProcessor,
  DEFAULT_RETRY_CONFIG
};
