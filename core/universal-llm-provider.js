/**
 * Universal LLM Provider
 * 
 * Abstraktionsschicht für verschiedene LLM-Backends:
 * - CLI-based (gemini-code, aider, claude-code)
 * - API-based (OpenAI, Anthropic, Gemini)
 * - Local (Ollama, llama.cpp)
 * 
 * @module universal-llm-provider
 * @version 3.0.0
 */

const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');

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
// ============================================================================

class CLIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'cli';
    this.command = config.command || 'gemini-code';
    this.args = config.args || [];
    this.activeProcess = null;
  }

  async execute(prompt, options = {}) {
    const { onData, timeoutMs = 300000 } = options;
    
    return new Promise((resolve, reject) => {
      const outputChunks = [];
      let stderrChunks = [];
      let timeoutId = null;
      
      // Prepare command
      const args = [...this.args];
      
      // Spawn the process
      this.activeProcess = spawn(this.command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });
      
      // Set timeout
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          this.abort();
          reject(new Error(`Execution timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      
      // Handle stdout
      this.activeProcess.stdout.on('data', (chunk) => {
        const data = chunk.toString('utf8');
        outputChunks.push(data);
        
        if (onData) {
          try { onData(data); } catch (e) {}
        }
      });
      
      // Handle stderr
      this.activeProcess.stderr.on('data', (chunk) => {
        const data = chunk.toString('utf8');
        stderrChunks.push(data);
        console.error('[LLM stderr]:', data.substring(0, 500));
      });
      
      // Handle exit
      this.activeProcess.on('close', (code, signal) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcess = null;
        
        if (signal) {
          reject(new Error(`Process terminated by signal: ${signal}`));
          return;
        }
        
        const fullOutput = outputChunks.join('');
        
        if (code !== 0 && code !== null) {
          if (fullOutput.length > 0) {
            console.warn(`[CLIProvider] Non-zero exit code ${code}, but output received`);
            resolve(fullOutput);
            return;
          }
          reject(new Error(`Process exited with code ${code}`));
          return;
        }
        
        resolve(fullOutput);
      });
      
      // Handle errors
      this.activeProcess.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.activeProcess = null;
        reject(new Error(`Failed to spawn process: ${error.message}`));
      });
      
      // Write prompt to stdin
      try {
        this.activeProcess.stdin.write(prompt, 'utf8');
        this.activeProcess.stdin.end();
      } catch (e) {
        reject(new Error(`Failed to write to stdin: ${e.message}`));
      }
    });
  }

  abort() {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.activeProcess && !this.activeProcess.killed) {
          this.activeProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async checkAvailability() {
    return new Promise((resolve) => {
      const proc = spawn(this.command, ['--version'], {
        stdio: 'pipe',
        timeout: 5000
      });
      
      let output = '';
      proc.stdout.on('data', (d) => output += d);
      
      proc.on('close', (code) => {
        resolve({
          available: code === 0,
          version: output.trim(),
          command: this.command
        });
      });
      
      proc.on('error', () => {
        resolve({
          available: false,
          error: `Command '${this.command}' not found`
        });
      });
    });
  }
}

// ============================================================================
// HTTP/API Provider (OpenAI, Anthropic, Gemini, etc.)
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
  }

  async execute(prompt, options = {}) {
    const { onData, timeoutMs = 300000 } = options;
    
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
        timeout: timeoutMs
      };
      
      const protocol = url.protocol === 'https:' ? https : http;
      
      this.activeRequest = protocol.request(url, requestOptions, (res) => {
        let data = '';
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
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
        reject(new Error(`Request failed: ${error.message}`));
      });
      
      this.activeRequest.on('timeout', () => {
        this.activeRequest.destroy();
        reject(new Error('Request timeout'));
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
// ============================================================================

class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
    this.activeRequest = null;
  }

  async execute(prompt, options = {}) {
    const { onData, timeoutMs = 300000 } = options;
    
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
        timeout: timeoutMs
      };
      
      this.activeRequest = http.request(url, requestOptions, (res) => {
        let data = '';
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
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
        reject(new Error(`Ollama request failed: ${error.message}`));
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
  
  static listAvailableProviders() {
    const providers = [];
    
    // Check CLI
    const { execSync } = require('child_process');
    const cliTools = ['gemini-code', 'aider', 'claude-code', 'codex'];
    for (const tool of cliTools) {
      try {
        execSync(`which ${tool}`, { stdio: 'ignore' });
        providers.push({ type: 'cli', name: tool, available: true });
      } catch {
        providers.push({ type: 'cli', name: tool, available: false });
      }
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
    const http = require('http');
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      providers.push({ 
        type: 'local', 
        name: 'Ollama', 
        available: res.statusCode === 200 
      });
    });
    req.on('error', () => {
      providers.push({ 
        type: 'local', 
        name: 'Ollama', 
        available: false 
      });
    });
    req.end();
    
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
  LLMProviderFactory
};
