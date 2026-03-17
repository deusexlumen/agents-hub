/**
 * Enhanced Error Recovery
 * 
 * Retry logic, circuit breaker pattern, and graceful degradation
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY_MS: 1000,
    MAX_DELAY_MS: 30000,
    BACKOFF_MULTIPLIER: 2,
    JITTER: true
  },
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 5,
    SUCCESS_THRESHOLD: 3,
    TIMEOUT_MS: 60000,
    HALF_OPEN_MAX_CALLS: 3
  },
  FALLBACK: {
    ENABLED: true,
    DEFAULT_TIMEOUT_MS: 5000
  }
};

// ============================================================================
// Error Classification
// ============================================================================

const ERROR_TYPES = {
  RETRYABLE: [
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE',
    'ENOTFOUND',
    'NETWORK_ERROR',
    'RATE_LIMIT',
    'SERVICE_UNAVAILABLE'
  ],
  NON_RETRYABLE: [
    'EACCES',
    'EPERM',
    'ENOENT',
    'VALIDATION_ERROR',
    'AUTHENTICATION_ERROR',
    'NOT_FOUND'
  ]
};

// ============================================================================
// Retry Utility
// ============================================================================

class RetryHandler {
  constructor(config = {}) {
    this.config = { ...CONFIG.RETRY, ...config };
  }

  /**
   * Execute function with retry logic
   */
  async execute(operation, options = {}) {
    const config = { ...this.config, ...options };
    let lastError;
    
    for (let attempt = 1; attempt <= config.MAX_ATTEMPTS; attempt++) {
      try {
        const result = await operation();
        
        // Success - log if it took multiple attempts
        if (attempt > 1) {
          console.log(`[RetryHandler] Operation succeeded on attempt ${attempt}`);
        }
        
        return {
          success: true,
          result,
          attempts: attempt
        };
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this._isRetryable(error)) {
          return {
            success: false,
            error,
            attempts: attempt,
            retryable: false
          };
        }
        
        // Don't retry on last attempt
        if (attempt === config.MAX_ATTEMPTS) {
          break;
        }
        
        // Calculate delay
        const delay = this._calculateDelay(attempt, config);
        
        console.log(`[RetryHandler] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await this._sleep(delay);
      }
    }
    
    return {
      success: false,
      error: lastError,
      attempts: config.MAX_ATTEMPTS,
      retryable: true
    };
  }

  _isRetryable(error) {
    const code = error.code || error.type || error.message;
    return ERROR_TYPES.RETRYABLE.some(type => 
      code && code.toString().toUpperCase().includes(type)
    );
  }

  _calculateDelay(attempt, config) {
    // Exponential backoff
    const exponentialDelay = config.INITIAL_DELAY_MS * 
      Math.pow(config.BACKOFF_MULTIPLIER, attempt - 1);
    
    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, config.MAX_DELAY_MS);
    
    // Add jitter to prevent thundering herd
    if (config.JITTER) {
      const jitter = Math.random() * 0.3 * cappedDelay;
      return Math.floor(cappedDelay + jitter);
    }
    
    return cappedDelay;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...CONFIG.CIRCUIT_BREAKER, ...config };
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
    
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(operation) {
    this.stats.totalCalls++;
    
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (this._shouldAttemptReset()) {
        this._transitionTo('HALF_OPEN');
      } else {
        this.stats.rejectedCalls++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker '${this.name}' is OPEN. Try again later.`,
          this._getNextRetryTime()
        );
      }
    }
    
    // Limit half-open calls
    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.config.HALF_OPEN_MAX_CALLS) {
      this.stats.rejectedCalls++;
      throw new CircuitBreakerOpenError(
        `Circuit breaker '${this.name}' is HALF_OPEN and at capacity.`
      );
    }
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
    }
    
    try {
      const result = await operation();
      this._onSuccess();
      this.stats.successfulCalls++;
      return result;
    } catch (error) {
      this._onFailure();
      this.stats.failedCalls++;
      throw error;
    }
  }

  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      if (this.successCount >= this.config.SUCCESS_THRESHOLD) {
        this._transitionTo('CLOSED');
      }
    } else {
      this.failureCount = 0;
    }
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this._transitionTo('OPEN');
    } else if (this.failureCount >= this.config.FAILURE_THRESHOLD) {
      this._transitionTo('OPEN');
    }
  }

  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    
    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenCalls = 0;
    } else if (newState === 'HALF_OPEN') {
      this.halfOpenCalls = 0;
      this.successCount = 0;
    }
    
    console.log(`[CircuitBreaker:${this.name}] ${oldState} → ${newState}`);
  }

  _shouldAttemptReset() {
    if (!this.lastFailureTime) return true;
    
    const elapsed = Date.now() - this.lastFailureTime;
    return elapsed >= this.config.TIMEOUT_MS;
  }

  _getNextRetryTime() {
    if (!this.lastFailureTime) return 0;
    
    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = Math.max(0, this.config.TIMEOUT_MS - elapsed);
    return remaining;
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stats: this.stats,
      nextRetryIn: this._getNextRetryTime()
    };
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(message, retryIn = 0) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.retryIn = retryIn;
  }
}

// ============================================================================
// Fallback Handler
// ============================================================================

class FallbackHandler {
  constructor(config = {}) {
    this.config = { ...CONFIG.FALLBACK, ...config };
    this.fallbacks = new Map();
  }

  /**
   * Register a fallback for an operation
   */
  register(operationName, fallbackFn, options = {}) {
    this.fallbacks.set(operationName, {
      fn: fallbackFn,
      timeout: options.timeout || this.config.DEFAULT_TIMEOUT_MS
    });
  }

  /**
   * Execute with fallback
   */
  async execute(operationName, primaryOperation, ...args) {
    try {
      return await primaryOperation(...args);
    } catch (error) {
      const fallback = this.fallbacks.get(operationName);
      
      if (!fallback) {
        throw error;
      }
      
      console.log(`[FallbackHandler] Executing fallback for ${operationName}`);
      
      // Execute fallback with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Fallback timeout')), fallback.timeout);
      });
      
      return await Promise.race([
        fallback.fn(...args),
        timeoutPromise
      ]);
    }
  }

  /**
   * Get available fallback
   */
  getFallback(operationName) {
    return this.fallbacks.get(operationName);
  }
}

// ============================================================================
// Error Recovery Manager
// ============================================================================

class ErrorRecoveryManager {
  constructor() {
    this.retryHandler = new RetryHandler();
    this.circuitBreakers = new Map();
    this.fallbackHandler = new FallbackHandler();
  }

  /**
   * Get or create circuit breaker
   */
  getCircuitBreaker(name, config) {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(name, config));
    }
    return this.circuitBreakers.get(name);
  }

  /**
   * Execute operation with full protection
   */
  async execute(operationName, operation, options = {}) {
    const {
      retry = true,
      circuitBreaker = null,
      fallback = null,
      timeout = null
    } = options;

    let wrappedOperation = operation;

    // Add circuit breaker
    if (circuitBreaker) {
      const cb = this.getCircuitBreaker(circuitBreaker.name, circuitBreaker.config);
      const originalOp = wrappedOperation;
      wrappedOperation = () => cb.execute(originalOp);
    }

    // Add timeout
    if (timeout) {
      const originalOp = wrappedOperation;
      wrappedOperation = () => this._withTimeout(originalOp, timeout);
    }

    // Add retry
    if (retry) {
      const retryConfig = typeof retry === 'object' ? retry : {};
      const result = await this.retryHandler.execute(wrappedOperation, retryConfig);
      
      if (!result.success) {
        // Try fallback if available
        if (fallback) {
          return await fallback();
        }
        throw result.error;
      }
      
      return result.result;
    }

    // Execute without retry
    return await wrappedOperation();
  }

  /**
   * Wrap function with error recovery
   */
  wrap(fn, options) {
    return async (...args) => {
      return this.execute(fn.name || 'anonymous', () => fn(...args), options);
    };
  }

  _withTimeout(operation, timeoutMs) {
    return Promise.race([
      operation(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates() {
    const states = {};
    for (const [name, cb] of this.circuitBreakers) {
      states[name] = cb.getState();
    }
    return states;
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  RetryHandler,
  CircuitBreaker,
  CircuitBreakerOpenError,
  FallbackHandler,
  ErrorRecoveryManager,
  ERROR_TYPES,
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  console.log('Enhanced Error Recovery v1.0\n');
  
  // Example: Retry handler
  console.log('Example: Retry Handler');
  const retry = new RetryHandler();
  console.log('  Config:', retry.config);
  
  // Example: Circuit breaker
  console.log('\nExample: Circuit Breaker');
  const cb = new CircuitBreaker('api');
  console.log('  Initial state:', cb.getState());
  
  // Example: Error recovery manager
  console.log('\nExample: Error Recovery Manager');
  const manager = new ErrorRecoveryManager();
  console.log('  Circuit breakers:', Object.keys(manager.getCircuitBreakerStates()));
  
  console.log('\nUsage:');
  console.log('  const { ErrorRecoveryManager } = require("./enhanced-error-recovery");');
  console.log('  const manager = new ErrorRecoveryManager();');
  console.log('  const result = await manager.execute("operation", async () => {');
  console.log('    // Your operation here');
  console.log('  }, { retry: true, circuitBreaker: { name: "api" } });');
}
