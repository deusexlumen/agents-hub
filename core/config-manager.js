/**
 * Configuration Manager
 * 
 * Centralized configuration with environment variable support,
 * validation, and type checking.
 * 
 * @module config-manager
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  // Core settings
  project: {
    name: 'agents-hub-project',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development'
  },
  
  // Session management
  session: {
    autosaveInterval: 5 * 60 * 1000, // 5 minutes
    maxCheckpoints: 10,
    pruneThreshold: 8000, // tokens
    archiveAfterDays: 30,
    defaultWorkflow: 'software-dev'
  },
  
  // State persistence
  persistence: {
    format: 'json', // 'json' or 'yaml'
    stateDir: './session_state',
    atomicWrites: true,
    createBackups: true
  },
  
  // Logging
  logging: {
    level: process.env.AGENTS_HUB_LOG_LEVEL || 'info',
    format: 'pretty', // 'pretty', 'json', 'simple'
    destination: 'console', // 'console', 'file', 'both'
    colors: true
  },
  
  // Resilience
  resilience: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 60000
    }
  },
  
  // Multi-agent
  multiAgent: {
    maxConcurrent: 5,
    defaultTimeout: 5 * 60 * 1000, // 5 minutes
    spawnDelay: 100 // ms between spawns
  },
  
  // MCP integration
  mcp: {
    enabled: true,
    configPath: './mcp-config.yaml',
    autoDiscover: true,
    timeout: 30000
  },
  
  // Templates
  templates: {
    preferLocal: true,
    cacheEnabled: true,
    cacheTtl: 3600000, // 1 hour
    paths: ['./templates', './core/templates']
  },
  
  // Auto-transition
  autoTransition: {
    enabled: false,
    checkInterval: 3, // messages
    confidenceThreshold: 0.7
  },
  
  // Learning engine
  learning: {
    enabled: true,
    dataDir: './learning_data',
    minPatternConfidence: 0.6,
    maxPatterns: 100
  }
};

// ============================================================================
// Schema for Validation
// ============================================================================

const CONFIG_SCHEMA = {
  'project.name': { type: 'string', min: 1, max: 100 },
  'project.version': { type: 'string', pattern: /^\d+\.\d+\.\d+/ },
  'session.autosaveInterval': { type: 'number', min: 1000, max: 3600000 },
  'session.maxCheckpoints': { type: 'number', min: 1, max: 100 },
  'persistence.format': { type: 'enum', values: ['json', 'yaml'] },
  'logging.level': { type: 'enum', values: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] },
  'resilience.maxRetries': { type: 'number', min: 0, max: 10 },
  'multiAgent.maxConcurrent': { type: 'number', min: 1, max: 20 }
};

// ============================================================================
// Config Manager Class
// ============================================================================

class ConfigManager {
  constructor() {
    this.config = null;
    this.configPath = null;
    this.watchers = [];
    this._fileWatcher = null;
  }
  
  /**
   * Load configuration from file and environment
   */
  load(configPath = null) {
    this.configPath = configPath || this._findConfigFile();
    
    // Start with defaults
    let config = this._deepClone(DEFAULT_CONFIG);
    
    // Load from file if exists
    if (this.configPath && fs.existsSync(this.configPath)) {
      const fileConfig = this._loadFromFile(this.configPath);
      config = this._mergeDeep(config, fileConfig);
    }
    
    // Override with environment variables
    config = this._applyEnvOverrides(config);
    
    // Validate
    const validation = this._validate(config);
    if (!validation.valid) {
      console.error('Configuration validation failed:');
      validation.errors.forEach(err => console.error(`  - ${err}`));
      throw new Error('Invalid configuration');
    }
    
    this.config = config;
    
    // Setup file watching in development
    if (config.project.env === 'development' && this.configPath) {
      this._setupFileWatcher();
    }
    
    return config;
  }
  
  /**
   * Get configuration value by path
   */
  get(path, defaultValue = undefined) {
    if (!this.config) {
      this.load();
    }
    
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value === null || value === undefined) {
        return defaultValue;
      }
      value = value[key];
    }
    
    return value !== undefined ? value : defaultValue;
  }
  
  /**
   * Set configuration value
   */
  set(path, value) {
    if (!this.config) {
      this.load();
    }
    
    const keys = path.split('.');
    let target = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    target[keys[keys.length - 1]] = value;
    
    // Validate after change
    const validation = this._validate(this.config);
    if (!validation.valid) {
      console.error('Configuration validation failed after update:');
      validation.errors.forEach(err => console.error(`  - ${err}`));
    }
  }
  
  /**
   * Get all configuration
   */
  getAll() {
    if (!this.config) {
      this.load();
    }
    return this._deepClone(this.config);
  }
  
  /**
   * Save configuration to file
   */
  save(configPath = null) {
    const targetPath = configPath || this.configPath;
    
    if (!targetPath) {
      throw new Error('No configuration path specified');
    }
    
    const format = path.extname(targetPath) === '.yaml' || path.extname(targetPath) === '.yml' 
      ? 'yaml' 
      : 'json';
    
    let content;
    if (format === 'yaml') {
      content = yaml.stringify(this.config);
    } else {
      content = JSON.stringify(this.config, null, 2);
    }
    
    fs.writeFileSync(targetPath, content, 'utf8');
    
    return { success: true, path: targetPath };
  }
  
  /**
   * Register a callback for config changes
   */
  onChange(callback) {
    this.watchers.push(callback);
    return () => {
      const index = this.watchers.indexOf(callback);
      if (index > -1) {
        this.watchers.splice(index, 1);
      }
    };
  }
  
  /**
   * Create initial configuration file
   */
  init(projectPath, options = {}) {
    const configFile = path.join(projectPath, 'agents-hub.config.js');
    
    const config = {
      project: {
        name: options.name || 'my-agents-project',
        version: '1.0.0',
        env: process.env.NODE_ENV || 'development'
      },
      session: {
        defaultWorkflow: options.workflow || 'software-dev',
        autosaveInterval: 300000,
        maxCheckpoints: 10
      },
      logging: {
        level: 'info'
      },
      mcp: {
        enabled: true,
        configPath: './mcp-config.yaml'
      }
    };
    
    const content = `module.exports = ${JSON.stringify(config, null, 2)};`;
    fs.writeFileSync(configFile, content);
    
    return { success: true, path: configFile };
  }
  
  /**
   * Close and cleanup
   */
  close() {
    if (this._fileWatcher) {
      this._fileWatcher.close();
      this._fileWatcher = null;
    }
    this.watchers = [];
  }
  
  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------
  
  _findConfigFile() {
    const candidates = [
      './agents-hub.config.js',
      './agents-hub.config.json',
      './agents-hub.config.yaml',
      './.agents-hub/config.js',
      './config/agents-hub.js'
    ];
    
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    
    return null;
  }
  
  _loadFromFile(filePath) {
    const ext = path.extname(filePath);
    
    try {
      if (ext === '.js') {
        // Clear require cache for hot reload
        delete require.cache[require.resolve(path.resolve(filePath))];
        return require(path.resolve(filePath));
      } else if (ext === '.json') {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else if (ext === '.yaml' || ext === '.yml') {
        return yaml.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (error) {
      console.error(`Failed to load config from ${filePath}: ${error.message}`);
      return {};
    }
    
    return {};
  }
  
  _applyEnvOverrides(config) {
    const envMappings = {
      'AGENTS_HUB_ENV': ['project', 'env'],
      'AGENTS_HUB_LOG_LEVEL': ['logging', 'level'],
      'AGENTS_HUB_LOG_FORMAT': ['logging', 'format'],
      'AGENTS_HUB_STATE_DIR': ['persistence', 'stateDir'],
      'AGENTS_HUB_MAX_RETRIES': ['resilience', 'maxRetries'],
      'AGENTS_HUB_MAX_AGENTS': ['multiAgent', 'maxConcurrent'],
      'AGENTS_HUB_AUTOSAVE_INTERVAL': ['session', 'autosaveInterval'],
      'AGENTS_HUB_MCP_ENABLED': ['mcp', 'enabled'],
      'AGENTS_HUB_MCP_CONFIG': ['mcp', 'configPath']
    };
    
    for (const [envVar, pathParts] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        let target = config;
        for (let i = 0; i < pathParts.length - 1; i++) {
          target = target[pathParts[i]];
        }
        
        // Parse value
        const key = pathParts[pathParts.length - 1];
        target[key] = this._parseEnvValue(value, typeof target[key]);
      }
    }
    
    return config;
  }
  
  _parseEnvValue(value, targetType) {
    if (targetType === 'number') {
      const num = Number(value);
      return isNaN(num) ? value : num;
    }
    if (targetType === 'boolean') {
      return value === 'true' || value === '1';
    }
    return value;
  }
  
  _validate(config) {
    const errors = [];
    
    for (const [path, schema] of Object.entries(CONFIG_SCHEMA)) {
      const value = this._getValueByPath(config, path);
      
      if (value === undefined) {
        continue; // Skip undefined values
      }
      
      // Type validation
      if (schema.type === 'string' && typeof value !== 'string') {
        errors.push(`${path}: expected string, got ${typeof value}`);
      } else if (schema.type === 'number' && typeof value !== 'number') {
        errors.push(`${path}: expected number, got ${typeof value}`);
      } else if (schema.type === 'enum' && !schema.values.includes(value)) {
        errors.push(`${path}: expected one of ${schema.values.join(', ')}, got ${value}`);
      }
      
      // Range validation
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`${path}: value ${value} is below minimum ${schema.min}`);
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push(`${path}: value ${value} is above maximum ${schema.max}`);
      }
      
      // Pattern validation
      if (schema.pattern && !schema.pattern.test(value)) {
        errors.push(`${path}: value does not match required pattern`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  _getValueByPath(obj, path) {
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }
    
    return value;
  }
  
  _setupFileWatcher() {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      return;
    }
    
    try {
      this._fileWatcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          console.log('[ConfigManager] Configuration file changed, reloading...');
          try {
            this.load(this.configPath);
            this.watchers.forEach(cb => cb(this.config));
          } catch (error) {
            console.error('[ConfigManager] Failed to reload config:', error.message);
          }
        }
      });
    } catch (error) {
      console.warn('[ConfigManager] Failed to setup file watcher:', error.message);
    }
  }
  
  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  
  _mergeDeep(target, source) {
    const output = { ...target };
    
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this._mergeDeep(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
    
    return output;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const configManager = new ConfigManager();

// ============================================================================
// Export
// ============================================================================

module.exports = {
  ConfigManager,
  configManager,
  DEFAULT_CONFIG,
  CONFIG_SCHEMA
};
