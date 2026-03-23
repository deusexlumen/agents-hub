/**
 * Universal LLM Provider v5.0 - Circuit Breaker Edition
 * 
 * Hardened LLM-I/O-Pipeline mit:
 * - Circuit Breaker Pattern (Opossum)
 * - Fallback-Routing zwischen Providern
 * - Provider Health Monitoring
 * - Exponential Backoff mit Jitter
 * - Rate Limit Error Handling
 * 
 * @module universal-llm-provider
 * @version 5.0.0
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const CircuitBreaker = require('opossum');
const { Logger } = require('./logger');

// ============================================================================
// Configuration
// ============================================================================

const CIRCUIT_OPTIONS = {
  timeout: 30000,                    // 30 Sekunden Timeout
  errorThresholdPercentage: 50,      // 50% Fehler → Circuit öffnet
  resetTimeout: 30000,               // 30 Sekunden bis Half-Open
  rollingCountTimeout: 10000,        // 10 Sekunden Messfenster
  rollingCountBuckets: 10,           // Buckets für Fehlerrate
  name: 'llm-provider'
};

const FALLBACK_CHAIN = {
  'anthropic': ['openai', 'gemini', 'ollama'],
  'openai': ['anthropic', 'gemini', 'ollama'],
  'gemini': ['openai', 'anthropic', 'ollama'],
  'ollama': ['gemini', 'openai', 'anthropic']
};

const PROVIDER_CONFIGS = {
  openai: {
    baseUrl: 'https://api.openai.com',
    endpoint: '/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    endpoint: '/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-opus-20240229',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    endpoint: '/v1beta/models/gemini-pro:generateContent',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-pro',
    models: ['gemini-pro', 'gemini-pro-vision']
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    endpoint: '/api/generate',
    envKey: null,
    defaultModel: 'llama2',
    models: ['llama2', 'mistral', 'codellama']
  }
};

// ============================================================================
// Custom Exceptions
// ============================================================================

class LLMExecutionError extends Error {
  constructor(message, cause, code = 'LLM_EXECUTION_FAILED') {
    super(message);
    this.name = 'LLMExecutionError';
    this.cause = cause;
    this.code = code;
  }
}

class LLMExecutionTimeoutError extends LLMExecutionError {
  constructor(command, timeoutMs, cause) {
    super(`LLM execution timeout: ${command} exceeded ${timeoutMs}ms`, cause, 'LLM_TIMEOUT');
    this.name = 'LLMExecutionTimeoutError';
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

class LLMProcessError extends LLMExecutionError {
  constructor(message, exitCode, stderr, cause) {
    super(message, cause, 'LLM_PROCESS_ERROR');
    this.name = 'LLMProcessError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

class RateLimitError extends LLMExecutionError {
  constructor(provider, retryAfter = null, cause) {
    super(`Rate limit exceeded for ${provider}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`, cause, 'RATE_LIMIT');
    this.name = 'RateLimitError';
    this.provider = provider;
    this.retryAfter = retryAfter;
    this.isRateLimit = true;
  }
}

class CircuitOpenError extends LLMExecutionError {
  constructor(provider, cause) {
    super(`Circuit breaker is OPEN for provider: ${provider}`, cause, 'CIRCUIT_OPEN');
    this.name = 'CircuitOpenError';
    this.provider = provider;
  }
}

// ============================================================================
// Provider Health Monitor
// ============================================================================

/**
 * Globaler Health-Monitor für alle LLM-Provider
 * Trackt Status über die gesamte Session
 */
class ProviderHealthMonitor {
  constructor() {
    this.providers = new Map();
    this.logger = new Logger({ context: { component: 'ProviderHealthMonitor' } });
    this._initProviders();
  }

  _initProviders() {
    for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
      this.providers.set(name, {
        name,
        available: false,
        circuitState: 'CLOSED',
        lastError: null,
        lastSuccess: null,
        consecutiveFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgLatencyMs: 0,
        config
      });
    }
  }

  /**
   * Aktualisiert Provider-Status
   * @param {string} providerName - Provider-Name
   * @param {string} state - Circuit-Zustand (CLOSED, OPEN, HALF_OPEN)
   * @param {Error} [error] - Optionaler Fehler
   */
  updateCircuitState(providerName, state, error = null) {
    const provider = this.providers.get(providerName);
    if (!provider) return;

    const oldState = provider.circuitState;
    provider.circuitState = state;

    if (state === 'OPEN') {
      provider.consecutiveFailures++;
      provider.lastError = error;
      this.logger.warn(`Circuit OPEN for ${providerName}`, { 
        provider: providerName, 
        previousState: oldState,
        error: error?.message 
      });
    } else if (state === 'HALF_OPEN') {
      this.logger.info(`Circuit HALF_OPEN for ${providerName} - testing...`, { provider: providerName });
    } else if (state === 'CLOSED' && oldState !== 'CLOSED') {
      provider.consecutiveFailures = 0;
      provider.lastError = null;
      this.logger.info(`Circuit CLOSED for ${providerName} - back to normal`, { provider: providerName });
    }

    // Melde an Orchestrator
    this._notifyOrchestrator(providerName, state, error);
  }

  /**
   * Trackt erfolgreichen Request
   * @param {string} providerName - Provider-Name
   * @param {number} latencyMs - Latenz in Millisekunden
   */
  recordSuccess(providerName, latencyMs) {
    const provider = this.providers.get(providerName);
    if (!provider) return;

    provider.totalRequests++;
    provider.successfulRequests++;
    provider.lastSuccess = Date.now();
    provider.consecutiveFailures = 0;

    // Rolling average latency
    const n = provider.successfulRequests;
    provider.avgLatencyMs = (provider.avgLatencyMs * (n - 1) + latencyMs) / n;

    this.logger.debug(`Request succeeded for ${providerName}`, { 
      provider: providerName, 
      latencyMs 
    });
  }

  /**
   * Trackt fehlgeschlagenen Request
   * @param {string} providerName - Provider-Name
   * @param {Error} error - Fehler
   */
  recordFailure(providerName, error) {
    const provider = this.providers.get(providerName);
    if (!provider) return;

    provider.totalRequests++;
    provider.failedRequests++;
    provider.consecutiveFailures++;
    provider.lastError = error;

    this.logger.warn(`Request failed for ${providerName}`, { 
      provider: providerName, 
      error: error.message,
      code: error.code 
    });
  }

  /**
   * Gibt den besten verfügbaren Provider zurück
   * @param {string} [preferred] - Bevorzugter Provider
   * @returns {string|null} - Besten Provider oder null
   */
  getBestProvider(preferred = null) {
    // Bevorzugter Provider verfügbar?
    if (preferred) {
      const pref = this.providers.get(preferred);
      if (pref && pref.circuitState === 'CLOSED') {
        return preferred;
      }
    }

    // Sortiere nach: CLOSED > HALF_OPEN > OPEN, dann nach Latenz
    const available = Array.from(this.providers.values())
      .filter(p => p.circuitState === 'CLOSED' || p.circuitState === 'HALF_OPEN')
      .sort((a, b) => {
        // CLOSED vor HALF_OPEN
        if (a.circuitState !== b.circuitState) {
          return a.circuitState === 'CLOSED' ? -1 : 1;
        }
        // Dann nach Latenz
        return a.avgLatencyMs - b.avgLatencyMs;
      });

    return available[0]?.name || null;
  }

  /**
   * Gibt alle Provider-Status zurück
   * @returns {Array} - Provider-Status-Array
   */
  getAllStatuses() {
    return Array.from(this.providers.values()).map(p => ({
      name: p.name,
      available: p.circuitState === 'CLOSED' || p.circuitState === 'HALF_OPEN',
      circuitState: p.circuitState,
      consecutiveFailures: p.consecutiveFailures,
      totalRequests: p.totalRequests,
      successRate: p.totalRequests > 0 ? (p.successfulRequests / p.totalRequests) : 0,
      avgLatencyMs: Math.round(p.avgLatencyMs)
    }));
  }

  _notifyOrchestrator(providerName, state, error) {
    // Hier könnte eine Event-Emission oder Callback an den Orchestrator erfolgen
    // Für jetzt: nur Logging
    if (state === 'OPEN') {
      this.logger.error(`Provider ${providerName} is DOWN`, {
        provider: providerName,
        error: error?.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Globaler Monitor-Instance
const globalHealthMonitor = new ProviderHealthMonitor();

// ============================================================================
// Circuit Breaker Wrapper
// ============================================================================

/**
 * Erstellt einen Circuit Breaker für einen API-Call
 * @param {Function} asyncFunction - Auszuführende Funktion
 * @param {string} providerName - Provider-Name für Logging
 * @param {Object} options - Circuit Breaker Optionen
 * @returns {CircuitBreaker} - Circuit Breaker Instance
 */
function createCircuitBreaker(asyncFunction, providerName, options = {}) {
  const breaker = new CircuitBreaker(asyncFunction, {
    ...CIRCUIT_OPTIONS,
    ...options,
    name: `${CIRCUIT_OPTIONS.name}-${providerName}`
  });

  const logger = new Logger({ context: { component: `Circuit-${providerName}` } });

  // Event-Handler für State-Changes
  breaker.on('open', () => {
    logger.error(`Circuit OPEN for ${providerName}`);
    globalHealthMonitor.updateCircuitState(providerName, 'OPEN');
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit HALF_OPEN for ${providerName}`);
    globalHealthMonitor.updateCircuitState(providerName, 'HALF_OPEN');
  });

  breaker.on('close', () => {
    logger.info(`Circuit CLOSED for ${providerName}`);
    globalHealthMonitor.updateCircuitState(providerName, 'CLOSED');
  });

  breaker.on('fallback', (result) => {
    logger.warn(`Fallback executed for ${providerName}`, { result });
  });

  breaker.on('reject', () => {
    logger.warn(`Request rejected - Circuit OPEN for ${providerName}`);
  });

  breaker.on('timeout', () => {
    logger.error(`Circuit timeout for ${providerName}`);
  });

  breaker.on('success', (latency) => {
    globalHealthMonitor.recordSuccess(providerName, latency);
  });

  breaker.on('failure', (error) => {
    globalHealthMonitor.recordFailure(providerName, error);
  });

  return breaker;
}

// ============================================================================
// Base Provider Class
// ============================================================================

class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
    this.circuitBreaker = null;
  }

  async execute(prompt, options = {}) {
    throw new Error('execute() must be implemented by subclass');
  }

  async checkAvailability() {
    return { available: false, error: 'Not implemented' };
  }

  abort() {
    // Override in subclass
  }
}

// ============================================================================
// CLI Provider mit Circuit Breaker
// ============================================================================

class CLIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = config.name || 'cli';
    this.command = config.command || 'gemini-code';
    this.args = config.args || [];
    this.activeProcess = null;
    
    this.EXECUTION_TIMEOUT = 300000;
    this.MAX_BUFFER = 10485760;

    // Circuit Breaker für CLI-Execution
    this.circuitBreaker = createCircuitBreaker(
      this._executeInternal.bind(this),
      this.name,
      { timeout: 60000 } // CLI braucht länger
    );
  }

  async execute(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.circuitBreaker.fire(prompt, options);
      globalHealthMonitor.recordSuccess(this.name, Date.now() - startTime);
      return result;
    } catch (error) {
      globalHealthMonitor.recordFailure(this.name, error);
      
      if (this.circuitBreaker.opened) {
        throw new CircuitOpenError(this.name, error);
      }
      throw error;
    }
  }

  async _executeInternal(prompt, options = {}) {
    const { onData } = options;
    const { execa } = await import('execa');
    
    const args = [...this.args];
    const controller = new AbortController();
    let stderrOutput = '';
    
    try {
      this.activeProcess = execa(this.command, args, {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: this.EXECUTION_TIMEOUT,
        maxBuffer: this.MAX_BUFFER,
        cancelSignal: controller.signal,
        env: process.env,
        stripFinalNewline: false
      });
      
      if (prompt) {
        this.activeProcess.stdin.write(prompt, 'utf8');
        this.activeProcess.stdin.end();
      }
      
      if (onData && this.activeProcess.stdout) {
        this.activeProcess.stdout.on('data', (chunk) => {
          try {
            onData(chunk.toString('utf8'));
          } catch (e) {}
        });
      }
      
      if (this.activeProcess.stderr) {
        this.activeProcess.stderr.on('data', (chunk) => {
          stderrOutput += chunk.toString('utf8');
        });
      }
      
      const result = await this.activeProcess;
      return result.stdout || '';
      
    } catch (error) {
      if (error.isCanceled || error.timedOut) {
        throw new LLMExecutionTimeoutError(this.command, this.EXECUTION_TIMEOUT, error);
      }
      
      if (error.exitCode !== undefined && error.exitCode !== 0) {
        throw new LLMProcessError(
          `Process exited with code ${error.exitCode}`,
          error.exitCode,
          error.stderr || stderrOutput,
          error
        );
      }
      
      throw new LLMExecutionError(`LLM execution failed: ${error.message}`, error);
    } finally {
      controller.abort();
      this.activeProcess = null;
    }
  }

  abort() {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch (e) {}
    }
  }

  async checkAvailability() {
    try {
      const { execa } = await import('execa');
      const result = await execa('which', [this.command], {
        timeout: 5000,
        reject: false
      });
      
      return {
        available: result.exitCode === 0,
        command: this.command
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}

// ============================================================================
// API Provider mit Circuit Breaker
// ============================================================================

class APIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = config.name || 'api';
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.endpoint = config.endpoint;
    this.activeRequest = null;
    
    this.EXECUTION_TIMEOUT = 300000;

    // Circuit Breaker für API-Calls
    this.circuitBreaker = createCircuitBreaker(
      this._executeInternal.bind(this),
      this.name
    );
  }

  async execute(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.circuitBreaker.fire(prompt, options);
      globalHealthMonitor.recordSuccess(this.name, Date.now() - startTime);
      return result;
    } catch (error) {
      globalHealthMonitor.recordFailure(this.name, error);
      
      if (this.circuitBreaker.opened) {
        throw new CircuitOpenError(this.name, error);
      }
      throw error;
    }
  }

  async _executeInternal(prompt, options = {}) {
    const { onData } = options;
    
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint, this.baseUrl);
      
      const postData = JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        stream: !!onData,
        temperature: 0.7,
        max_tokens: 4000
      });
      
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.EXECUTION_TIMEOUT
      };
      
      const protocol = url.protocol === 'https:' ? https : http;
      
      this.activeRequest = protocol.request(url, requestOptions, (res) => {
        // Rate Limit Handling (HTTP 429)
        if (res.statusCode === 429) {
          const retryAfter = res.headers['retry-after'];
          reject(new RateLimitError(this.name, retryAfter ? parseInt(retryAfter) : null));
          return;
        }
        
        if (res.statusCode >= 500) {
          reject(new LLMExecutionError(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new LLMExecutionError(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        let data = '';
        
        res.on('data', (chunk) => {
          const text = chunk.toString();
          
          if (onData) {
            const lines = text.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                if (jsonStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const content = parsed.choices?.[0]?.delta?.content || 
                                 parsed.choices?.[0]?.message?.content;
                  if (content) {
                    onData(content);
                    data += content;
                  }
                } catch (e) {}
              }
            }
          } else {
            data += text;
          }
        });
        
        res.on('end', () => {
          this.activeRequest = null;
          
          if (!onData) {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.message?.content || '';
              resolve(content);
            } catch (e) {
              resolve(data);
            }
          } else {
            resolve(data);
          }
        });
      });
      
      this.activeRequest.on('error', (error) => {
        this.activeRequest = null;
        reject(new LLMExecutionError(`Request failed: ${error.message}`, error));
      });
      
      this.activeRequest.on('timeout', () => {
        this.activeRequest.destroy();
        reject(new LLMExecutionTimeoutError(
          `${this.baseUrl}${this.endpoint}`,
          this.EXECUTION_TIMEOUT,
          new Error('HTTP request timeout')
        ));
      });
      
      this.activeRequest.write(postData);
      this.activeRequest.end();
    });
  }

  abort() {
    if (this.activeRequest) {
      this.activeRequest.destroy();
      this.activeRequest = null;
    }
  }

  async checkAvailability() {
    if (!this.apiKey) {
      return { available: false, error: 'API key not configured' };
    }
    
    return new Promise((resolve) => {
      const url = new URL('/v1/models', this.baseUrl);
      
      const requestOptions = {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 10000
      };
      
      const protocol = url.protocol === 'https:' ? https : http;
      
      const req = protocol.request(url, requestOptions, (res) => {
        resolve({
          available: res.statusCode === 200,
          statusCode: res.statusCode,
          baseUrl: this.baseUrl,
          model: this.model
        });
      });
      
      req.on('error', (error) => {
        resolve({ available: false, error: error.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ available: false, error: 'Connection timeout' });
      });
      
      req.end();
    });
  }
}

// ============================================================================
// Ollama Provider mit Circuit Breaker
// ============================================================================

class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
    this.activeRequest = null;
    
    this.EXECUTION_TIMEOUT = 300000;

    // Circuit Breaker für Ollama
    this.circuitBreaker = createCircuitBreaker(
      this._executeInternal.bind(this),
      this.name,
      { timeout: 120000 } // Lokale Modelle brauchen länger
    );
  }

  async execute(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.circuitBreaker.fire(prompt, options);
      globalHealthMonitor.recordSuccess(this.name, Date.now() - startTime);
      return result;
    } catch (error) {
      globalHealthMonitor.recordFailure(this.name, error);
      
      if (this.circuitBreaker.opened) {
        throw new CircuitOpenError(this.name, error);
      }
      throw error;
    }
  }

  async _executeInternal(prompt, options = {}) {
    const { onData } = options;
    
    return new Promise((resolve, reject) => {
      const url = new URL('/api/generate', this.baseUrl);
      
      const postData = JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: !!onData,
        options: { temperature: 0.7 }
      });
      
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.EXECUTION_TIMEOUT
      };
      
      this.activeRequest = http.request(url, requestOptions, (res) => {
        let data = '';
        
        if (res.statusCode !== 200) {
          reject(new LLMExecutionError(`HTTP ${res.statusCode}`));
          return;
        }
        
        res.on('data', (chunk) => {
          const text = chunk.toString();
          const lines = text.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              const content = parsed.response || '';
              
              if (onData && content) {
                onData(content);
              }
              
              data += content;
              
              if (parsed.done) {
                resolve(data);
              }
            } catch (e) {}
          }
        });
        
        res.on('end', () => {
          this.activeRequest = null;
          if (!onData) {
            resolve(data);
          }
        });
      });
      
      this.activeRequest.on('error', (error) => {
        this.activeRequest = null;
        reject(new LLMExecutionError(`Ollama request failed: ${error.message}`, error));
      });
      
      this.activeRequest.write(postData);
      this.activeRequest.end();
    });
  }

  abort() {
    if (this.activeRequest) {
      this.activeRequest.destroy();
      this.activeRequest = null;
    }
  }

  async checkAvailability() {
    return new Promise((resolve) => {
      const req = http.get(
        `${this.baseUrl}/api/tags`,
        { timeout: 5000 },
        (res) => {
          resolve({
            available: res.statusCode === 200,
            baseUrl: this.baseUrl,
            model: this.model
          });
        }
      );
      
      req.on('error', () => {
        resolve({ available: false, error: `Ollama not available at ${this.baseUrl}` });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ available: false, error: 'Connection timeout' });
      });
    });
  }
}

// ============================================================================
// Provider Factory mit Fallback-Routing
// ============================================================================

class LLMProviderFactory {
  static create(config = {}) {
    const providerType = config.provider || this.detectProvider();
    const providerName = config.name || providerType;
    
    switch (providerType.toLowerCase()) {
      case 'cli':
      case 'command':
        return new CLIProvider({ ...config, name: providerName });
        
      case 'openai':
        return new APIProvider({
          name: 'openai',
          baseUrl: PROVIDER_CONFIGS.openai.baseUrl,
          endpoint: PROVIDER_CONFIGS.openai.endpoint,
          apiKey: config.apiKey || process.env.OPENAI_API_KEY,
          model: config.model || PROVIDER_CONFIGS.openai.defaultModel,
          ...config
        });
        
      case 'anthropic':
      case 'claude':
        return new APIProvider({
          name: 'anthropic',
          baseUrl: PROVIDER_CONFIGS.anthropic.baseUrl,
          endpoint: PROVIDER_CONFIGS.anthropic.endpoint,
          apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
          model: config.model || PROVIDER_CONFIGS.anthropic.defaultModel,
          ...config
        });
        
      case 'gemini':
        return new APIProvider({
          name: 'gemini',
          baseUrl: PROVIDER_CONFIGS.gemini.baseUrl,
          endpoint: PROVIDER_CONFIGS.gemini.endpoint,
          apiKey: config.apiKey || process.env.GEMINI_API_KEY,
          model: config.model || PROVIDER_CONFIGS.gemini.defaultModel,
          ...config
        });
        
      case 'ollama':
        return new OllamaProvider(config);
        
      case 'custom':
        return new APIProvider({ name: 'custom', ...config });
        
      default:
        return new CLIProvider({ ...config, name: providerName });
    }
  }
  
  static detectProvider() {
    if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL) return 'ollama';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    return 'cli';
  }

  /**
   * Führt Request mit automatischem Fallback durch
   * @param {string} prompt - Der Prompt
   * @param {Object} options - Optionen
   * @param {string} options.preferredProvider - Bevorzugter Provider
   * @param {Array} options.fallbackChain - Fallback-Kette
   * @returns {Promise<Object>} - Ergebnis mit Provider-Info
   */
  static async executeWithFallback(prompt, options = {}) {
    const preferred = options.preferredProvider || this.detectProvider();
    const chain = options.fallbackChain || FALLBACK_CHAIN[preferred] || [];
    const providersToTry = [preferred, ...chain];
    
    const logger = new Logger({ context: { component: 'FallbackRouter' } });
    const errors = [];
    
    for (const providerName of providersToTry) {
      const provider = this.create({ provider: providerName });
      
      // Prüfe Circuit State
      const health = globalHealthMonitor.providers.get(providerName);
      if (health && health.circuitState === 'OPEN') {
        logger.warn(`Skipping ${providerName} - Circuit OPEN`);
        continue;
      }
      
      try {
        logger.info(`Trying provider: ${providerName}`);
        const startTime = Date.now();
        const result = await provider.execute(prompt, options);
        
        return {
          success: true,
          provider: providerName,
          result,
          latencyMs: Date.now() - startTime,
          fallbackUsed: providerName !== preferred
        };
        
      } catch (error) {
        logger.error(`Provider ${providerName} failed`, { error: error.message });
        errors.push({ provider: providerName, error: error.message, code: error.code });
        
        // Rate Limit → sofortiger Fallback
        if (error.isRateLimit || error.code === 'RATE_LIMIT') {
          logger.warn(`Rate limit on ${providerName}, trying next...`);
          continue;
        }
        
        // Circuit Open → nächster Provider
        if (error.code === 'CIRCUIT_OPEN') {
          continue;
        }
        
        // Andere Fehler → auch Fallback versuchen
        continue;
      }
    }
    
    // Alle Provider failed
    throw new LLMExecutionError(
      `All providers failed. Errors: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`,
      null,
      'ALL_PROVIDERS_FAILED'
    );
  }
  
  static async listAvailableProviders() {
    const providers = [];
    
    // Check CLI tools
    const cliTools = ['gemini-code', 'aider', 'claude-code', 'codex'];
    
    let execa;
    try {
      const execaModule = await import('execa');
      execa = execaModule.execa;
    } catch {
      execa = null;
    }
    
    if (execa) {
      const cliChecks = await Promise.all(
        cliTools.map(async (tool) => {
          try {
            const result = await execa('which', [tool], { timeout: 5000, reject: false });
            return { type: 'cli', name: tool, available: result.exitCode === 0 };
          } catch {
            return { type: 'cli', name: tool, available: false };
          }
        })
      );
      providers.push(...cliChecks);
    } else {
      cliTools.forEach(tool => {
        providers.push({ type: 'cli', name: tool, available: null });
      });
    }
    
    // Check API keys
    providers.push({ 
      type: 'api', 
      name: 'OpenAI', 
      available: !!process.env.OPENAI_API_KEY,
      circuitState: globalHealthMonitor.providers.get('openai')?.circuitState
    });
    providers.push({ 
      type: 'api', 
      name: 'Anthropic', 
      available: !!process.env.ANTHROPIC_API_KEY,
      circuitState: globalHealthMonitor.providers.get('anthropic')?.circuitState
    });
    providers.push({ 
      type: 'api', 
      name: 'Gemini', 
      available: !!process.env.GEMINI_API_KEY,
      circuitState: globalHealthMonitor.providers.get('gemini')?.circuitState
    });
    
    // Check Ollama
    const ollamaCheck = new Promise((resolve) => {
      const req = http.get('http://localhost:11434/api/tags', { timeout: 5000 }, (res) => {
        resolve({ 
          type: 'local', 
          name: 'Ollama', 
          available: res.statusCode === 200,
          circuitState: globalHealthMonitor.providers.get('ollama')?.circuitState
        });
      });
      req.on('error', () => {
        resolve({ type: 'local', name: 'Ollama', available: false, circuitState: 'OPEN' });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ type: 'local', name: 'Ollama', available: false, circuitState: 'OPEN' });
      });
    });
    
    providers.push(await ollamaCheck);
    
    return providers;
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Providers
  BaseProvider,
  CLIProvider,
  APIProvider,
  OllamaProvider,
  
  // Factory
  LLMProviderFactory,
  
  // Health Monitor
  ProviderHealthMonitor,
  globalHealthMonitor,
  
  // Errors
  LLMExecutionError,
  LLMExecutionTimeoutError,
  LLMProcessError,
  RateLimitError,
  CircuitOpenError,
  
  // Circuit Breaker Utils
  createCircuitBreaker,
  CIRCUIT_OPTIONS,
  FALLBACK_CHAIN,
  PROVIDER_CONFIGS
};