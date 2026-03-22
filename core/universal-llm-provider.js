/**
 * Universal LLM Provider v4.0
 * 
 * Abstraktionsschicht für verschiedene LLM-Backends:
 * - CLI-based (gemini-code, aider, claude-code) - JETZT mit execa
 * - API-based (OpenAI, Anthropic, Gemini)
 * - Local (Ollama, llama.cpp)
 * 
 * REFACTORED: Zombie-Prozesse und Deadlocks verhindert durch execa
 * - Strikte Timeouts (5 Minuten)
 - Max Buffer (10 MB)
 * - Saubere Prozess-Terminierung
 * 
 * @module universal-llm-provider
 * @version 4.0.0
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ============================================================================
// Custom Exceptions für Orchestrator
// ============================================================================

class LLMExecutionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'LLMExecutionError';
    this.cause = cause;
    this.code = 'LLM_EXECUTION_FAILED';
  }
}

class LLMExecutionTimeoutError extends LLMExecutionError {
  constructor(command, timeoutMs, cause) {
    super(`LLM execution timeout: ${command} exceeded ${timeoutMs}ms`, cause);
    this.name = 'LLMExecutionTimeoutError';
    this.code = 'LLM_TIMEOUT';
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

class LLMProcessError extends LLMExecutionError {
  constructor(message, exitCode, stderr, cause) {
    super(message, cause);
    this.name = 'LLMProcessError';
    this.code = 'LLM_PROCESS_ERROR';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// ============================================================================
// Base Provider Class
// ============================================================================

class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
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
// CLI Provider (gemini-code, aider, claude-code, etc.)
// REFACTORED: Nutzt jetzt execa statt child_process.spawn
// ============================================================================

class CLIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'cli';
    this.command = config.command || 'gemini-code';
    this.args = config.args || [];
    this.activeProcess = null;
    
    // Konstanten für Timeout und Buffer
    this.EXECUTION_TIMEOUT = 300000; // 5 Minuten
    this.MAX_BUFFER = 10485760;      // 10 MB
  }

  /**
   * Führt CLI-Befehl mit execa aus
   * Verhindert Zombie-Prozesse durch saubere Timeout- und Abort-Handling
   */
  async execute(prompt, options = {}) {
    const { onData } = options;
    
    // Lazy-load execa (ESM-Modul in CommonJS)
    const { execa } = await import('execa');
    
    const args = [...this.args];
    const controller = new AbortController();
    let stderrOutput = ''; // Muss außerhalb try definiert sein
    
    try {
      // execa mit strikten Limits
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
      
      // Write prompt to stdin
      if (prompt) {
        this.activeProcess.stdin.write(prompt, 'utf8');
        this.activeProcess.stdin.end();
      }
      
      // Stream-Handling wenn onData Callback vorhanden
      if (onData && this.activeProcess.stdout) {
        this.activeProcess.stdout.on('data', (chunk) => {
          try {
            onData(chunk.toString('utf8'));
          } catch (e) {
            // Callback-Fehler ignorieren
          }
        });
      }
      
      // stderr für Logging
      if (this.activeProcess.stderr) {
        this.activeProcess.stderr.on('data', (chunk) => {
          const data = chunk.toString('utf8');
          stderrOutput += data;
          console.error('[LLM stderr]:', data.substring(0, 500));
        });
      }
      
      // Warte auf Ergebnis
      const result = await this.activeProcess;
      
      return result.stdout || '';
      
    } catch (error) {
      // Präzise Fehlerunterscheidung für Orchestrator
      if (error.isCanceled || error.timedOut) {
        throw new LLMExecutionTimeoutError(
          this.command,
          this.EXECUTION_TIMEOUT,
          error
        );
      }
      
      if (error.exitCode !== undefined && error.exitCode !== 0) {
        throw new LLMProcessError(
          `Process exited with code ${error.exitCode}: ${error.message}`,
          error.exitCode,
          error.stderr || stderrOutput,
          error
        );
      }
      
      throw new LLMExecutionError(
        `LLM execution failed: ${error.message}`,
        error
      );
      
    } finally {
      // Cleanup: Signal für AbortController
      controller.abort();
      this.activeProcess = null;
    }
  }

  /**
   * Abbruch des aktiven Prozesses
   * Nutzt AbortController für saubere Terminierung
   */
  abort() {
    if (this.activeProcess) {
      try {
        // AbortController signalisiert Abbruch
        // execa handled die Prozess-Terminierung
        this.activeProcess.kill('SIGTERM');
      } catch (e) {
        // Prozess bereits beendet
      }
    }
  }

  /**
   * Prüft Verfügbarkeit des CLI-Tools
   * REFACTORED: Nutzt execa statt spawn
   */
  async checkAvailability() {
    try {
      const { execa } = await import('execa');
      
      const result = await execa(this.command, ['--version'], {
        timeout: 5000,
        maxBuffer: 1024 * 1024, // 1 MB für Version reicht
        reject: false // Nicht werfen bei Exit-Code != 0
      });
      
      return {
        available: result.exitCode === 0,
        version: result.stdout?.trim() || 'unknown',
        command: this.command,
        exitCode: result.exitCode
      };
      
    } catch (error) {
      // Timeout oder anderer Fehler
      if (error.timedOut) {
        return {
          available: false,
          error: `Command '${this.command}' timed out during version check`,
          command: this.command
        };
      }
      
      return {
        available: false,
        error: `Command '${this.command}' not found or not executable`,
        command: this.command,
        details: error.message
      };
    }
  }
}

// ============================================================================
// HTTP/API Provider (OpenAI, Anthropic, Gemini, etc.)
// UNVERÄNDERT: HTTP-Requests nutzen bereits native Timeout-Handling
// ============================================================================

class APIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'api';
    this.baseUrl = config.baseUrl || 'https://api.openai.com';
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || 'gpt-4';
    this.endpoint = config.endpoint || '/v1/chat/completions';
    this.activeRequest = null;
    
    this.EXECUTION_TIMEOUT = 300000; // 5 Minuten
  }

  async execute(prompt, options = {}) {
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
        let data = '';
        
        if (res.statusCode !== 200) {
          reject(new LLMExecutionError(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        res.on('data', (chunk) => {
          const text = chunk.toString();
          
          if (onData) {
            // Handle streaming response
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
                } catch (e) {
                  // Ignore parse errors in stream
                }
              }
            }
          } else {
            data += text;
          }
        });
        
        res.on('end', () => {
          this.activeRequest = null;
          
          if (!onData) {
            // Non-streaming: parse full response
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
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
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
        resolve({
          available: false,
          error: error.message
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          available: false,
          error: 'Connection timeout'
        });
      });
      
      req.end();
    });
  }
}

// ============================================================================
// Ollama Provider (Local LLMs)
// UNVERÄNDERT: HTTP-Requests nutzen bereits native Timeout-Handling
// ============================================================================

class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
    this.activeRequest = null;
    
    this.EXECUTION_TIMEOUT = 300000; // 5 Minuten
  }

  async execute(prompt, options = {}) {
    const { onData } = options;
    
    return new Promise((resolve, reject) => {
      const url = new URL('/api/generate', this.baseUrl);
      
      const postData = JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: !!onData,
        options: {
          temperature: 0.7
        }
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
          
          // Ollama streams JSON lines
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
            } catch (e) {
              // Ignore parse errors
            }
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
      const url = new URL('/api/tags', this.baseUrl);
      
      const req = http.get(url, { timeout: 5000 }, (res) => {
        resolve({
          available: res.statusCode === 200,
          baseUrl: this.baseUrl,
          model: this.model
        });
      });
      
      req.on('error', () => {
        resolve({
          available: false,
          error: `Ollama not available at ${this.baseUrl}`
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          available: false,
          error: 'Connection timeout'
        });
      });
    });
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

class LLMProviderFactory {
  static create(config = {}) {
    const providerType = config.provider || this.detectProvider();
    
    switch (providerType.toLowerCase()) {
      case 'cli':
      case 'command':
        return new CLIProvider(config);
        
      case 'openai':
        return new APIProvider({
          baseUrl: 'https://api.openai.com',
          endpoint: '/v1/chat/completions',
          apiKey: config.apiKey || process.env.OPENAI_API_KEY,
          model: config.model || 'gpt-4',
          ...config
        });
        
      case 'anthropic':
      case 'claude':
        return new APIProvider({
          baseUrl: 'https://api.anthropic.com',
          endpoint: '/v1/messages',
          apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
          model: config.model || 'claude-3-opus-20240229',
          ...config
        });
        
      case 'gemini':
        return new APIProvider({
          baseUrl: 'https://generativelanguage.googleapis.com',
          endpoint: '/v1beta/models/gemini-pro:generateContent',
          apiKey: config.apiKey || process.env.GEMINI_API_KEY,
          model: config.model || 'gemini-pro',
          ...config
        });
        
      case 'ollama':
        return new OllamaProvider(config);
        
      case 'custom':
        return new APIProvider(config);
        
      default:
        // Try CLI as fallback
        return new CLIProvider(config);
    }
  }
  
  static detectProvider() {
    // Auto-detect based on environment
    if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL) {
      return 'ollama';
    }
    if (process.env.OPENAI_API_KEY) {
      return 'openai';
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return 'anthropic';
    }
    if (process.env.GEMINI_API_KEY) {
      return 'gemini';
    }
    return 'cli';
  }
  
  /**
   * Listet verfügbare Provider auf
   * REFACTORED: Nutzt execa statt child_process.execSync
   */
  static async listAvailableProviders() {
    const providers = [];
    
    // Lazy-load execa
    let execa;
    try {
      const execaModule = await import('execa');
      execa = execaModule.execa;
    } catch {
      // execa nicht verfügbar, Fallback zu basic checks
    }
    
    // Check CLI tools
    const cliTools = ['gemini-code', 'aider', 'claude-code', 'codex'];
    
    if (execa) {
      // Parallel checks mit execa
      const cliChecks = await Promise.all(
        cliTools.map(async (tool) => {
          try {
            const result = await execa('which', [tool], {
              timeout: 5000,
              reject: false
            });
            return {
              type: 'cli',
              name: tool,
              available: result.exitCode === 0
            };
          } catch {
            return {
              type: 'cli',
              name: tool,
              available: false
            };
          }
        })
      );
      providers.push(...cliChecks);
    } else {
      // Fallback: Keine CLI checks möglich ohne execa
      cliTools.forEach(tool => {
        providers.push({
          type: 'cli',
          name: tool,
          available: null // Unknown
        });
      });
    }
    
    // Check API keys
    providers.push({ 
      type: 'api', 
      name: 'OpenAI', 
      available: !!process.env.OPENAI_API_KEY 
    });
    providers.push({ 
      type: 'api', 
      name: 'Anthropic', 
      available: !!process.env.ANTHROPIC_API_KEY 
    });
    providers.push({ 
      type: 'api', 
      name: 'Gemini', 
      available: !!process.env.GEMINI_API_KEY 
    });
    
    // Check Ollama
    const ollamaCheck = new Promise((resolve) => {
      const req = http.get('http://localhost:11434/api/tags', { timeout: 5000 }, (res) => {
        resolve({ 
          type: 'local', 
          name: 'Ollama', 
          available: res.statusCode === 200 
        });
      });
      req.on('error', () => {
        resolve({ 
          type: 'local', 
          name: 'Ollama', 
          available: false 
        });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ 
          type: 'local', 
          name: 'Ollama', 
          available: false 
        });
      });
      req.end();
    });
    
    providers.push(await ollamaCheck);
    
    return providers;
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  BaseProvider,
  CLIProvider,
  APIProvider,
  OllamaProvider,
  LLMProviderFactory,
  LLMExecutionError,
  LLMExecutionTimeoutError,
  LLMProcessError
};