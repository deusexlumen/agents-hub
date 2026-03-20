/**
 * Execution Engine v3.1
 * 
 * Physische Brücke zum LLM.
 * Unterstützt: CLI-basiert, API-basiert, Lokale LLMs
 * 
 * @module execution-engine
 * @version 3.1.0
 */

const { EventEmitter } = require('events');
const { LLMProviderFactory } = require('./universal-llm-provider');

class ExecutionEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      provider: config.provider || 'auto',        // 'cli', 'openai', 'anthropic', 'ollama', 'auto'
      command: config.command || config.llmCommand || 'gemini-code',
      args: config.args || config.llmArgs || [],
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs || 300000,      // 5 minutes
      ...config
    };
    
    this.provider = null;
    this.isRunning = false;
  }

  /**
   * Initialisiert den Provider
   */
  async initialize() {
    if (!this.provider) {
      this.provider = LLMProviderFactory.create(this.config);
      console.log(`[ExecutionEngine] Provider initialized: ${this.provider.name}`);
    }
    return this.provider;
  }

  /**
   * Führt das LLM mit dem Master-Prompt aus
   * @param {string} masterPrompt - Der komplette Master-Prompt
   * @param {Object} options - Ausführungsoptionen
   * @param {Function} options.onData - Callback für Streaming-Output
   * @returns {Promise<string>} Die vollständige LLM-Antwort
   */
  async execute(masterPrompt, options = {}) {
    if (this.isRunning) {
      throw new Error('Execution already in progress. Wait for completion or abort.');
    }
    
    this.isRunning = true;
    
    try {
      // Initialize provider if needed
      await this.initialize();
      
      console.log(`[ExecutionEngine] Executing with ${this.provider.name}...`);
      
      // Execute through provider
      const output = await this.provider.execute(masterPrompt, {
        onData: (chunk) => {
          // Stream to terminal if callback provided
          if (options.onData) {
            try {
              options.onData(chunk);
            } catch (e) {
              console.error('[ExecutionEngine] onData callback error:', e.message);
            }
          }
          
          // Emit event for monitoring
          this.emit('data', chunk);
        },
        timeoutMs: options.timeoutMs || this.config.timeoutMs
      });
      
      this.isRunning = false;
      return output;
      
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Bricht die aktuelle Ausführung ab
   */
  abort() {
    if (this.provider) {
      console.log('[ExecutionEngine] Aborting execution...');
      this.provider.abort();
    }
    this.isRunning = false;
  }

  /**
   * Prüft ob der LLM verfügbar ist
   */
  async checkAvailability() {
    await this.initialize();
    return this.provider.checkAvailability();
  }

  /**
   * Gibt den aktuellen Status zurück
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      provider: this.provider?.name || 'not initialized',
      config: {
        provider: this.config.provider,
        command: this.config.command,
        model: this.config.model,
        baseUrl: this.config.baseUrl
      }
    };
  }

  /**
   * Wechselt den Provider zur Laufzeit
   */
  async switchProvider(newConfig) {
    if (this.isRunning) {
      throw new Error('Cannot switch provider while execution is running');
    }
    
    this.provider = null;
    this.config = { ...this.config, ...newConfig };
    
    await this.initialize();
    console.log(`[ExecutionEngine] Switched to provider: ${this.provider.name}`);
  }

  /**
   * Liste verfügbare Provider
   */
  listAvailableProviders() {
    return LLMProviderFactory.listAvailableProviders();
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  ExecutionEngine
};
