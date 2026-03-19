/**
 * Structured Logging System
 * 
 * Provides consistent, configurable logging with multiple levels
 * and output formats. Supports console, file, and JSON logging.
 * 
 * @module logger
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  level: process.env.AGENTS_HUB_LOG_LEVEL || 'info',
  format: process.env.AGENTS_HUB_LOG_FORMAT || 'pretty', // 'pretty', 'json', 'simple'
  destination: process.env.AGENTS_HUB_LOG_DEST || 'console', // 'console', 'file', 'both'
  logDir: './logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  colors: true,
  timestamps: true,
  callerInfo: false // Include file:line info
};

// Log levels with numeric values
const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 100
};

const LEVEL_NAMES = Object.keys(LEVELS);

// Colors for pretty format
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLevel = LEVELS[this.config.level] || LEVELS.info;
    this.logFile = null;
    this.fileStream = null;
    
    if (this.config.destination === 'file' || this.config.destination === 'both') {
      this._initFileLogging();
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a child logger with additional context
   */
  child(context = {}) {
    const childLogger = new Logger(this.config);
    childLogger.parent = this;
    childLogger.context = context;
    return childLogger;
  }

  /**
   * Set log level dynamically
   */
  setLevel(level) {
    if (LEVEL_NAMES.includes(level)) {
      this.config.level = level;
      this.currentLevel = LEVELS[level];
      this.info(`Log level changed to: ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }

  /**
   * Log with trace level
   */
  trace(message, meta = {}) {
    this._log('trace', message, meta);
  }

  /**
   * Log with debug level
   */
  debug(message, meta = {}) {
    this._log('debug', message, meta);
  }

  /**
   * Log with info level
   */
  info(message, meta = {}) {
    this._log('info', message, meta);
  }

  /**
   * Log with warn level
   */
  warn(message, meta = {}) {
    this._log('warn', message, meta);
  }

  /**
   * Log with error level
   */
  error(message, meta = {}) {
    this._log('error', message, meta);
  }

  /**
   * Log with fatal level and exit
   */
  fatal(message, meta = {}) {
    this._log('fatal', message, meta);
    process.exit(1);
  }

  /**
   * Log an operation start
   */
  start(operation) {
    const startTime = Date.now();
    this.info(`Starting: ${operation}`, { operation, startTime });
    
    return {
      success: (meta = {}) => {
        const duration = Date.now() - startTime;
        this.info(`Completed: ${operation}`, { operation, duration, success: true, ...meta });
        return { duration, success: true };
      },
      fail: (error, meta = {}) => {
        const duration = Date.now() - startTime;
        this.error(`Failed: ${operation}`, { 
          operation, 
          duration, 
          success: false, 
          error: error.message,
          ...meta 
        });
        return { duration, success: false, error };
      }
    };
  }

  /**
   * Close logger and cleanup resources
   */
  close() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  _log(level, message, meta = {}) {
    if (LEVELS[level] < this.currentLevel) {
      return;
    }

    const logEntry = this._format(level, message, meta);
    
    // Console output
    if (this.config.destination === 'console' || this.config.destination === 'both') {
      if (level === 'error' || level === 'fatal') {
        console.error(logEntry.formatted);
      } else {
        console.log(logEntry.formatted);
      }
    }
    
    // File output
    if ((this.config.destination === 'file' || this.config.destination === 'both') && this.fileStream) {
      this._writeToFile(logEntry.json);
    }
  }

  _format(level, message, meta) {
    const timestamp = new Date().toISOString();
    const ctx = { ...(this.parent?.context || {}), ...(this.context || {}), ...meta };
    
    const entry = {
      timestamp,
      level,
      message,
      ...ctx
    };

    let formatted;
    
    switch (this.config.format) {
      case 'json':
        formatted = JSON.stringify(entry);
        break;
      case 'simple':
        formatted = `[${level.toUpperCase()}] ${message}`;
        break;
      case 'pretty':
      default:
        formatted = this._formatPretty(entry);
        break;
    }

    return { formatted, json: JSON.stringify(entry) };
  }

  _formatPretty(entry) {
    const { timestamp, level, message, ...meta } = entry;
    
    let output = '';
    
    // Timestamp
    if (this.config.timestamps) {
      output += `${COLORS.gray}${timestamp}${COLORS.reset} `;
    }
    
    // Level with color
    const levelColor = this._getLevelColor(level);
    output += `${levelColor}[${level.toUpperCase().padStart(5)}]${COLORS.reset} `;
    
    // Message
    output += message;
    
    // Metadata
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      const metaStr = metaKeys
        .filter(k => k !== 'context')
        .map(k => `${k}=${JSON.stringify(meta[k])}`)
        .join(' ');
      output += ` ${COLORS.dim}${metaStr}${COLORS.reset}`;
    }
    
    return output;
  }

  _getLevelColor(level) {
    if (!this.config.colors) return '';
    
    switch (level) {
      case 'trace': return COLORS.gray;
      case 'debug': return COLORS.cyan;
      case 'info': return COLORS.green;
      case 'warn': return COLORS.yellow;
      case 'error': return COLORS.red;
      case 'fatal': return COLORS.bright + COLORS.red;
      default: return COLORS.reset;
    }
  }

  _initFileLogging() {
    try {
      if (!fs.existsSync(this.config.logDir)) {
        fs.mkdirSync(this.config.logDir, { recursive: true });
      }
      
      const logFile = path.join(this.config.logDir, `agents-hub-${Date.now()}.log`);
      this.fileStream = fs.createWriteStream(logFile, { flags: 'a' });
      this.logFile = logFile;
      
      // Handle stream errors
      this.fileStream.on('error', (err) => {
        console.error('Log file stream error:', err.message);
      });
      
    } catch (error) {
      console.error('Failed to initialize file logging:', error.message);
      this.config.destination = 'console';
    }
  }

  _writeToFile(jsonLine) {
    if (this.fileStream) {
      this.fileStream.write(jsonLine + '\n');
    }
  }
}

// ============================================================================
// Default Logger Instance
// ============================================================================

const defaultLogger = new Logger();

// ============================================================================
// Export
// ============================================================================

module.exports = {
  Logger,
  defaultLogger,
  LEVELS,
  LEVEL_NAMES
};
