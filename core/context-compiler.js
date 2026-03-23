/**
 * Context Compiler v3.0
 * 
 * Memoized context compilation with LRU caching
 * JSON-Only Output Instructions für LLM-Kommunikation
 * 
 * @module context-compiler
 * @version 3.0.0
 */

import crypto from 'crypto';

// ============================================================================
// JSON-Only System Instructions
// ============================================================================

/**
 * System-Instructions die den LLM zwingen, NUR im JSON-Format zu antworten
 * Diese werden automatisch an Contexte angehängt
 */
export const JSON_ONLY_INSTRUCTIONS = `CRITICAL OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no explanations outside the JSON.

Required structure:
{
  "memory": ["observation 1", "observation 2"],
  "status": "idle|ready|planning|executing|reviewing|completed|error|paused",
  "next_step": "description of next action",
  "confidence": 0.0-1.0,
  "metadata": { "optional": "fields" }
}

Rules:
- Response MUST start with '{' and end with '}'
- Use double quotes for all strings and keys
- No text before or after the JSON object
- Ensure valid JSON syntax (no trailing commas)

Invalid JSON will cause a retry request.`;

// ============================================================================
// LRU Cache Implementation
// ============================================================================

export class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
  }

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      this.stats.hits++;
      return value;
    }
    this.stats.misses++;
    return undefined;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
    
    this.cache.set(key, value);
    this.stats.size = this.cache.size;
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return true;
    }
    return false;
  }

  clear() {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.evictions = 0;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      totalRequests: total
    };
  }
}

// ============================================================================
// Context Compiler with Memoization
// ============================================================================

export class ContextCompiler {
  constructor(config = {}) {
    this.cache = new LRUCache(config.cacheSize || 100);
    this.config = {
      maxContextLength: config.maxContextLength || 10000,
      includeMetadata: config.includeMetadata !== false,
      compressSummaries: config.compressSummaries !== false,
      enforceJSONOutput: config.enforceJSONOutput !== false,
      ...config
    };
    this.compilationStats = {
      totalCompilations: 0,
      cachedCompilations: 0,
      uncachedCompilations: 0,
      averageCompilationTime: 0
    };
  }

  /**
   * Generiert einen Hash für den inputState
   * 
   * @param {Object} inputState - Der zu hashende Input-State
   * @returns {String} SHA-256 Hash (16 Zeichen)
   */
  _generateHash(inputState) {
    const normalized = JSON.stringify(inputState, Object.keys(inputState).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  }

  /**
   * Memoized compileContext Methode
   * Nutzt einen Hash des inputState als Cache-Key
   * 
   * @param {Object} inputState - Der zu kompilierende Input-State
   * @param {Object} options - Optionale Kompilierungs-Optionen
   * @returns {Object} Kompilierter Context
   */
  compileContext(inputState, options = {}) {
    const startTime = Date.now();
    const cacheKey = this._generateHash(inputState);
    
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.compilationStats.totalCompilations++;
      this.compilationStats.cachedCompilations++;
      return {
        ...cached,
        _cached: true,
        _cacheKey: cacheKey,
        _compileTime: Date.now() - startTime
      };
    }

    const compiled = this._performCompilation(inputState, options);
    
    this.cache.set(cacheKey, compiled);
    
    const compileTime = Date.now() - startTime;
    this.compilationStats.totalCompilations++;
    this.compilationStats.uncachedCompilations++;
    
    const prevAvg = this.compilationStats.averageCompilationTime;
    const total = this.compilationStats.uncachedCompilations;
    this.compilationStats.averageCompilationTime = 
      (prevAvg * (total - 1) + compileTime) / total;

    return {
      ...compiled,
      _cached: false,
      _cacheKey: cacheKey,
      _compileTime: compileTime
    };
  }

  /**
   * Interne Kompilierungs-Logik
   * 
   * @param {Object} inputState - Der zu kompilierende Input
   * @param {Object} options - Kompilierungs-Optionen
   * @returns {Object} Kompilierter Context
   */
  _performCompilation(inputState, options) {
    const {
      messages = [],
      metadata = {},
      context = {},
      systemPrompt = null
    } = inputState;

    const compiledMessages = this._compileMessages(messages, options);
    const compiledMetadata = this._compileMetadata(metadata, options);
    const compiledContext = this._compileContextData(context, options);

    // Füge JSON-Only Instructions hinzu wenn aktiviert
    const finalSystemPrompt = this._buildSystemPrompt(systemPrompt, options);

    return {
      messages: compiledMessages,
      metadata: compiledMetadata,
      context: compiledContext,
      systemPrompt: finalSystemPrompt,
      compiledAt: Date.now(),
      version: '3.0.0',
      jsonEnforced: this.config.enforceJSONOutput
    };
  }

  /**
   * Baut System-Prompt mit JSON-Only Instructions
   * 
   * @param {String} customPrompt - Optionaler custom System-Prompt
   * @param {Object} options - Optionen
   * @returns {String} Finaler System-Prompt
   */
  _buildSystemPrompt(customPrompt, options) {
    const enforceJSON = options.enforceJSONOutput ?? this.config.enforceJSONOutput;
    
    const parts = [];
    
    if (enforceJSON) {
      parts.push(JSON_ONLY_INSTRUCTIONS);
    }
    
    if (customPrompt) {
      parts.push(customPrompt);
    }
    
    if (parts.length === 0) {
      return null;
    }
    
    return parts.join('\n\n---\n\n');
  }

  /**
   * Kompiliert Messages mit optionaler Längen-Begrenzung
   * 
   * @param {Array} messages - Raw Messages
   * @param {Object} options - Optionen
   * @returns {Array} Kompilierte Messages
   */
  _compileMessages(messages, options) {
    if (!Array.isArray(messages)) return [];

    const maxLength = options.maxMessageLength || this.config.maxContextLength;
    
    return messages.map(msg => {
      const compiled = {
        role: msg.role || 'user',
        content: this._truncateContent(msg.content, maxLength),
        timestamp: msg.timestamp || Date.now()
      };

      if (this.config.includeMetadata && msg.metadata) {
        compiled.metadata = msg.metadata;
      }

      return compiled;
    });
  }

  /**
   * Kompiliert Metadata
   * 
   * @param {Object} metadata - Raw Metadata
   * @param {Object} options - Optionen
   * @returns {Object} Kompilierte Metadata
   */
  _compileMetadata(metadata, options) {
    const compiled = {
      ...metadata,
      compiledAt: Date.now(),
      compilerVersion: '3.0.0'
    };

    if (options.sessionId) {
      compiled.sessionId = options.sessionId;
    }

    if (options.agentId) {
      compiled.agentId = options.agentId;
    }

    if (this.config.enforceJSONOutput) {
      compiled.outputFormat = 'json-only';
    }

    return compiled;
  }

  /**
   * Kompiliert Context-Daten
   * 
   * @param {Object} context - Raw Context
   * @param {Object} options - Optionen
   * @returns {Object} Kompilierter Context
   */
  _compileContextData(context, options) {
    const compiled = { ...context };

    if (this.config.compressSummaries && compiled.summary) {
      compiled.summary = this._compressSummary(compiled.summary);
    }

    if (options.enrichContext) {
      compiled.enriched = true;
      compiled.enrichmentTimestamp = Date.now();
    }

    return compiled;
  }

  /**
   * Truncated Content auf maximale Länge
   * 
   * @param {String} content - Der Content
   * @param {Number} maxLength - Maximale Länge
   * @returns {String} Getruncateter Content
   */
  _truncateContent(content, maxLength) {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  /**
   * Komprimiert einen Summary-Text
   * 
   * @param {String} summary - Der Summary
   * @returns {String} Komprimierter Summary
   */
  _compressSummary(summary) {
    if (!summary || summary.length < 500) return summary;
    
    const sentences = summary.split(/[.!?]+/).filter(s => s.trim());
    const keySentences = sentences.slice(0, Math.ceil(sentences.length * 0.7));
    
    return keySentences.join('. ') + '.';
  }

  /**
   * Cache-Management
   */
  getCached(hash) {
    return this.cache.get(hash);
  }

  cache(hash, value) {
    this.cache.set(hash, value);
  }

  invalidateCache(hash) {
    return this.cache.delete(hash);
  }

  clearCache() {
    this.cache.clear();
    this.compilationStats = {
      totalCompilations: 0,
      cachedCompilations: 0,
      uncachedCompilations: 0,
      averageCompilationTime: 0
    };
  }

  /**
   * Memoize-Hilfsfunktion für beliebige Funktionen
   * 
   * @param {Function} fn - Die zu memoizierende Funktion
   * @param {Object} options - Memoize-Optionen
   * @returns {Function} Memoisierte Funktion
   */
  static memoize(fn, options = {}) {
    const cache = new LRUCache(options.cacheSize || 100);
    const keyGenerator = options.keyGenerator || ((...args) => {
      const normalized = JSON.stringify(args);
      return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    });

    const memoized = function(...args) {
      const key = keyGenerator(...args);
      
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const result = fn.apply(this, args);
      
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          cache.set(key, Promise.resolve(value));
          return value;
        }).catch(err => {
          cache.delete(key);
          throw err;
        });
      }

      cache.set(key, result);
      return result;
    };

    memoized.cache = cache;
    memoized.clearCache = () => cache.clear();
    memoized.getCacheStats = () => cache.getStats();

    return memoized;
  }

  /**
   * Statistiken abrufen
   */
  getStats() {
    return {
      ...this.cache.getStats(),
      compilation: { ...this.compilationStats },
      config: { ...this.config }
    };
  }

  /**
   * Status-Report
   */
  printStats() {
    const stats = this.getStats();
    
    console.log('\n============================');
    console.log('CONTEXT COMPILER STATS (v3.0)');
    console.log('============================');
    console.log(`Cache Size: ${stats.size}/${this.cache.maxSize}`);
    console.log(`Cache Hits: ${stats.hits}`);
    console.log(`Cache Misses: ${stats.misses}`);
    console.log(`Hit Rate: ${stats.hitRate.toFixed(2)}%`);
    console.log(`Evictions: ${stats.evictions}`);
    console.log(`\nCompilation Stats:`);
    console.log(`  Total: ${stats.compilation.totalCompilations}`);
    console.log(`  Cached: ${stats.compilation.cachedCompilations}`);
    console.log(`  Uncached: ${stats.compilation.uncachedCompilations}`);
    console.log(`  Avg Time: ${stats.compilation.averageCompilationTime.toFixed(2)}ms`);
    console.log(`\nConfig:`);
    console.log(`  JSON-Only Output: ${stats.config.enforceJSONOutput ? 'ENABLED' : 'DISABLED'}`);
    console.log('============================\n');
  }
}

// ============================================================================
// Specialized Context Compilers
// ============================================================================

export class AgentContextCompiler extends ContextCompiler {
  constructor(config = {}) {
    super({
      ...config,
      maxContextLength: config.maxContextLength || 5000,
      enforceJSONOutput: config.enforceJSONOutput !== false
    });
  }

  compileAgentContext(agentState, taskContext, options = {}) {
    const inputState = {
      messages: agentState.history || [],
      metadata: {
        agentId: agentState.id,
        agentName: agentState.name,
        capabilities: agentState.capabilities,
        ...agentState.metadata
      },
      context: {
        taskId: taskContext.taskId,
        taskType: taskContext.taskType,
        taskDescription: taskContext.description,
        ...taskContext
      },
      systemPrompt: options.systemPrompt || `You are agent "${agentState.name}". Respond with valid JSON.`
    };

    return this.compileContext(inputState, options);
  }
}

export class TaskContextCompiler extends ContextCompiler {
  constructor(config = {}) {
    super({
      ...config,
      compressSummaries: true,
      enforceJSONOutput: config.enforceJSONOutput !== false
    });
  }

  compileTaskContext(task, agentResults = [], options = {}) {
    const inputState = {
      messages: [
        { role: 'system', content: JSON_ONLY_INSTRUCTIONS },
        { role: 'user', content: `Task: ${task.description}`, timestamp: task.createdAt },
        ...agentResults.map((result, idx) => ({
          role: 'assistant',
          content: JSON.stringify({
            agent: idx + 1,
            result: result
          }),
          timestamp: Date.now()
        }))
      ],
      metadata: {
        taskId: task.id,
        taskType: task.type,
        priority: task.priority,
        status: task.status
      },
      context: {
        dependencies: task.dependencies,
        handoffCount: task.handoffCount,
        assignedTo: task.assignedTo
      },
      systemPrompt: options.systemPrompt || 'You are coordinating a multi-agent task. Respond with valid JSON only.'
    };

    return this.compileContext(inputState, options);
  }
}

// ============================================================================
// Export
// ============================================================================

export default ContextCompiler;