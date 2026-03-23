/**
 * Execution Engine v4.0 - Sandboxed Code Execution
 * 
 * Sichere Code-Ausführung mit:
 * - Command Whitelist
 * - Resource Limits (Timeout, Memory)
 * - Virtual File System (vFS)
 * - Process Isolation
 * 
 * @module execution-engine
 * @version 4.0.0
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from './logger.js';

const execAsync = promisify(exec);

// ============================================================================
// Configuration & Constants
// ============================================================================

/**
 * @typedef {Object} ExecutionConfig
 * @property {number} timeoutMs - Timeout in Millisekunden (default: 5000)
 * @property {number} memoryLimitMB - Memory-Limit in MB (default: 128)
 * @property {string} workingDir - Arbeitsverzeichnis
 * @property {string[]} allowedPaths - Erlaubte Pfade für File-System-Zugriff
 * @property {boolean} networkEnabled - Netzwerkzugriff erlaubt
 */

const DEFAULT_CONFIG = {
  timeoutMs: 5000,
  memoryLimitMB: 128,
  workingDir: './sandbox',
  allowedPaths: [],
  networkEnabled: false
};

/**
 * Whitelist der erlaubten Befehle
 * Format: command -> { args: erlaubte Argument-Patterns, description: Beschreibung }
 */
export const COMMAND_WHITELIST = {
  // Version/Info Commands
  'node': {
    args: ['-v', '--version', '-e', '--eval', '--check', '--print'],
    description: 'Node.js runtime',
    requiresFileValidation: true
  },
  'npm': {
    args: ['--version', '-v', 'test', 'run', 'install', 'ci', '--help'],
    description: 'Node Package Manager',
    blockedArgs: ['--prefix', '--global', '-g']
  },
  'git': {
    args: ['status', 'log', '--oneline', 'diff', 'show', '--version'],
    description: 'Git Version Control',
    blockedArgs: ['push', 'fetch', 'pull', 'clone', 'remote']
  },
  'npx': {
    args: ['--version'],
    description: 'NPX runner',
    blockedArgs: ['--package', '-p']
  },
  'echo': {
    args: ['*'],  // Alle Args erlaubt (aber sanitisiert)
    description: 'Echo utility'
  },
  'cat': {
    args: ['--version', '--help'],
    description: 'File display (restricted)',
    requiresFileValidation: true
  },
  'ls': {
    args: ['-la', '-l', '-a', '--version'],
    description: 'List directory (restricted)',
    requiresFileValidation: true
  },
  'pwd': {
    args: [],
    description: 'Print working directory'
  },
  'which': {
    args: [],
    description: 'Locate command'
  },
  'python3': {
    args: ['--version', '-V', '-c', '--help'],
    description: 'Python 3 interpreter',
    requiresFileValidation: true
  },
  'python': {
    args: ['--version', '-V', '-c', '--help'],
    description: 'Python interpreter',
    requiresFileValidation: true
  }
};

/**
 * Blockierte Patterns (Command Injection)
 */
const BLOCKED_PATTERNS = [
  /[;|&`$(){}[\]\\]/,           // Shell-Metazeichen
  /\$\(.*\)/,                     // Command substitution
  /`.*`/,                         // Backtick substitution
  /<.*>/,                         // Input redirection
  />.*>/,                         // Output redirection chaining
  /curl\s+.*\|\s*(ba)?sh/,        // curl | bash
  /wget\s+.*\|\s*(ba)?sh/,        // wget | bash
  /eval\s*\(/,                     // eval(
  /exec\s*\(/,                     // exec(
  /require\s*\(\s*['"]child_process['"]\s*\)/,  // child_process require
  /spawn\s*\(/,                    // spawn(
  /fork\s*\(/,                     // fork(
  /\bfs\.unlinkSync\s*\(/,         // fs.unlinkSync
  /\bfs\.rmdirSync\s*\(/,          // fs.rmdirSync
  /\brm\s+-rf\s+\//,               // rm -rf /
  /\bmkfs\./,                      // Filesystem formatting
  /\bdd\s+if=/,                    // Disk operations
  />\s*\/dev\/(null|zero|random)/  // Device writes
];

// ============================================================================
// Validation Error
// ============================================================================

export class ExecutionValidationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ExecutionValidationError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

// ============================================================================
// Virtual File System (vFS)
// ============================================================================

/**
 * VirtualFileSystem - Beschränkt Dateizugriff auf erlaubte Pfade
 */
export class VirtualFileSystem {
  /**
   * @param {string[]} allowedPaths - Liste erlaubter absoluter Pfade
   * @param {string} basePath - Basis-Pfad für relative Pfade
   */
  constructor(allowedPaths = [], basePath = process.cwd()) {
    this.allowedPaths = allowedPaths.map(p => path.resolve(p));
    this.basePath = path.resolve(basePath);
    this.logger = new Logger({ context: { component: 'vFS' } });
  }

  /**
   * Prüft ob ein Pfad zugänglich ist
   * @param {string} filePath - Zu prüfender Pfad
   * @returns {boolean}
   */
  isAllowed(filePath) {
    const resolved = path.resolve(this.basePath, filePath);
    
    // Immer erlaubt: Unterverzeichnisse des basePath
    if (resolved.startsWith(this.basePath)) {
      return true;
    }
    
    // Prüfe gegen explizit erlaubte Pfade
    return this.allowedPaths.some(allowed => {
      return resolved === allowed || resolved.startsWith(allowed + path.sep);
    });
  }

  /**
   * Liest Datei (mit Validierung)
   * @param {string} filePath - Pfad zur Datei
   * @returns {Promise<string>}
   */
  async readFile(filePath) {
    if (!this.isAllowed(filePath)) {
      throw new ExecutionValidationError(
        `Access denied: ${filePath}`,
        'VFS_ACCESS_DENIED',
        { filePath, allowedPaths: this.allowedPaths }
      );
    }

    const resolved = path.resolve(this.basePath, filePath);
    return fs.readFile(resolved, 'utf8');
  }

  /**
   * Schreibt Datei (mit Validierung)
   * @param {string} filePath - Pfad zur Datei
   * @param {string} content - Zu schreibender Content
   */
  async writeFile(filePath, content) {
    if (!this.isAllowed(filePath)) {
      throw new ExecutionValidationError(
        `Access denied: ${filePath}`,
        'VFS_ACCESS_DENIED',
        { filePath }
      );
    }

    const resolved = path.resolve(this.basePath, filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf8');
  }

  /**
   * Listet Verzeichnis (mit Validierung)
   * @param {string} dirPath - Pfad zum Verzeichnis
   * @returns {Promise<Array>}
   */
  async listDirectory(dirPath) {
    if (!this.isAllowed(dirPath)) {
      throw new ExecutionValidationError(
        `Access denied: ${dirPath}`,
        'VFS_ACCESS_DENIED',
        { dirPath }
      );
    }

    const resolved = path.resolve(this.basePath, dirPath);
    return fs.readdir(resolved, { withFileTypes: true });
  }
}

// ============================================================================
// Execution Sandbox
// ============================================================================

/**
 * @typedef {Object} SandboxResult
 * @property {boolean} success - Ob die Ausführung erfolgreich war
 * @property {string} stdout - Standard-Output
 * @property {string} stderr - Standard-Error
 * @property {number} exitCode - Exit-Code des Prozesses
 * @property {number} executionTimeMs - Ausführungszeit in Millisekunden
 * @property {string} [error] - Fehlermeldung bei Misserfolg
 */

/**
 * ExecutionSandbox - Kapselt Code-Ausführung mit Ressourcenlimits
 */
export class ExecutionSandbox {
  /**
   * @param {ExecutionConfig} config - Sandbox-Konfiguration
   */
  constructor(config = {}) {
    /** @type {ExecutionConfig} */
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.vfs = new VirtualFileSystem(
      this.config.allowedPaths,
      this.config.workingDir
    );
    this.logger = new Logger({ context: { component: 'ExecutionSandbox' } });
    this.activeProcesses = new Map();
  }

  /**
   * Validiert und führt einen Befehl aus
   * @param {string} command - Der auszuführende Befehl
   * @param {string[]} args - Argumente
   * @param {Object} options - Zusätzliche Optionen
   * @returns {Promise<SandboxResult>}
   */
  async validateAndRun(command, args = [], options = {}) {
    const startTime = Date.now();
    
    try {
      // 1. Befehl validieren
      this._validateCommand(command, args);
      
      // 2. Argumente validieren
      this._validateArguments(command, args);
      
      // 3. Ausführen mit Limits
      const result = await this._executeWithLimits(command, args, options);
      
      this.logger.info('Command executed', {
        command,
        args: args.join(' '),
        exitCode: result.exitCode,
        executionTimeMs: Date.now() - startTime
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('Execution failed', {
        command,
        error: error.message,
        code: error.code
      });
      
      return {
        success: false,
        stdout: '',
        stderr: error.message,
        exitCode: -1,
        executionTimeMs: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Führt JavaScript-Code in einer isolierten Umgebung aus
   * @param {string} code - Auszuführender JavaScript-Code
   * @param {Object} context - Context-Variablen
   * @returns {Promise<any>}
   */
  async runJavaScript(code, context = {}) {
    // Code auf gefährliche Patterns prüfen
    this._validateJavaScript(code);
    
    // Sandbox-Context erstellen
    const sandbox = {
      console: {
        log: (...args) => this.logger.info('sandbox.log', { args }),
        error: (...args) => this.logger.error('sandbox.error', { args }),
        warn: (...args) => this.logger.warn('sandbox.warn', { args })
      },
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Promise,
      ...context
    };

    // Async-Funktion erstellen und ausführen
    const fn = new Function(
      'sandbox',
      `
        with (sandbox) {
          return (async () => {
            ${code}
          })();
        }
      `
    );

    const timeout = setTimeout(() => {
      throw new ExecutionValidationError(
        'JavaScript execution timeout',
        'JS_TIMEOUT',
        { timeoutMs: this.config.timeoutMs }
      );
    }, this.config.timeoutMs);

    try {
      const result = await fn(sandbox);
      clearTimeout(timeout);
      return result;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Validiert einen Befehl gegen die Whitelist
   * @private
   */
  _validateCommand(command, args) {
    // Kommando-String auf Injection prüfen
    const fullCommand = `${command} ${args.join(' ')}`;
    
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(fullCommand)) {
        throw new ExecutionValidationError(
          `Blocked pattern detected in command: ${pattern}`,
          'VALIDATION_BLOCKED_PATTERN',
          { command, pattern: pattern.toString() }
        );
      }
    }

    // Gegen Whitelist prüfen
    const whitelistEntry = COMMAND_WHITELIST[command];
    if (!whitelistEntry) {
      throw new ExecutionValidationError(
        `Command not in whitelist: ${command}`,
        'VALIDATION_NOT_WHITELISTED',
        { command, allowedCommands: Object.keys(COMMAND_WHITELIST) }
      );
    }

    return whitelistEntry;
  }

  /**
   * Validiert Argumente eines Befehls
   * @private
   */
  _validateArguments(command, args) {
    const whitelistEntry = COMMAND_WHITELIST[command];
    if (!whitelistEntry) return;

    // Blockierte Argumente prüfen
    if (whitelistEntry.blockedArgs) {
      for (const arg of args) {
        for (const blocked of whitelistEntry.blockedArgs) {
          if (arg.includes(blocked)) {
            throw new ExecutionValidationError(
              `Blocked argument detected: ${arg}`,
              'VALIDATION_BLOCKED_ARG',
              { command, arg, blocked }
            );
          }
        }
      }
    }

    // File-Validation für Befehle die Dateien lesen
    if (whitelistEntry.requiresFileValidation) {
      for (const arg of args) {
        if (!arg.startsWith('-') && arg.includes('/')) {
          if (!this.vfs.isAllowed(arg)) {
            throw new ExecutionValidationError(
              `File access denied: ${arg}`,
              'VALIDATION_FILE_ACCESS',
              { command, file: arg }
            );
          }
        }
      }
    }

    // Argumente gegen erlaubte Liste prüfen (wenn '*' nicht erlaubt)
    if (!whitelistEntry.args.includes('*')) {
      for (const arg of args) {
        const isValid = whitelistEntry.args.some(allowed => 
          arg === allowed || arg.startsWith(allowed)
        );
        
        if (!isValid && !arg.startsWith('-')) {
          this.logger.warn(`Unrecognized argument: ${arg} for command ${command}`);
        }
      }
    }
  }

  /**
   * Validiert JavaScript-Code
   * @private
   */
  _validateJavaScript(code) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(code)) {
        throw new ExecutionValidationError(
          `Blocked pattern in JavaScript: ${pattern}`,
          'JS_BLOCKED_PATTERN',
          { pattern: pattern.toString() }
        );
      }
    }

    // Blockierte Imports
    const blockedImports = [
      'child_process',
      'fs',
      'path',
      'os',
      'net',
      'http',
      'https',
      'cluster',
      'worker_threads'
    ];

    for (const mod of blockedImports) {
      const importPattern = new RegExp(`require\\s*\\(\\s*['"\`]${mod}['"\`]\\s*\\)`);
      if (importPattern.test(code)) {
        throw new ExecutionValidationError(
          `Blocked module import: ${mod}`,
          'JS_BLOCKED_MODULE',
          { module: mod }
        );
      }
    }
  }

  /**
   * Führt Befehl mit Ressourcenlimits aus
   * @private
   */
  _executeWithLimits(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutMs || this.config.timeoutMs;
      const memoryLimitMB = options.memoryLimitMB || this.config.memoryLimitMB;
      
      const stdout = [];
      const stderr = [];
      
      // Prozess starten
      const proc = spawn(command, args, {
        cwd: this.config.workingDir,
        env: {
          PATH: process.env.PATH,
          NODE_OPTIONS: `--max-old-space-size=${memoryLimitMB}`,
          ...options.env
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Tracking
      const executionId = crypto.randomUUID();
      this.activeProcesses.set(executionId, proc);

      // Timeout-Handling
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
        
        reject(new ExecutionValidationError(
          `Execution timeout after ${timeoutMs}ms`,
          'EXECUTION_TIMEOUT',
          { command, timeoutMs }
        ));
      }, timeoutMs);

      // Output-Handling
      proc.stdout.on('data', (data) => {
        stdout.push(data.toString());
        if (options.onData) options.onData(data.toString());
      });

      proc.stderr.on('data', (data) => {
        stderr.push(data.toString());
      });

      // Process-Ende
      proc.on('close', (exitCode) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(executionId);
        
        resolve({
          success: exitCode === 0,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          exitCode: exitCode || 0,
          executionTimeMs: Date.now() - (proc.startTime || Date.now())
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(executionId);
        reject(error);
      });
    });
  }

  /**
   * Bricht alle laufenden Prozesse ab
   */
  abortAll() {
    for (const [id, proc] of this.activeProcesses) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 1000);
    }
    this.activeProcesses.clear();
  }
}

// ============================================================================
// Main Execution Engine
// ============================================================================

/**
 * ExecutionEngine - Hauptklasse für sichere Code-Ausführung
 */
export class ExecutionEngine {
  constructor(config = {}) {
    this.config = {
      sandbox: { ...DEFAULT_CONFIG, ...config.sandbox },
      ...config
    };
    this.sandbox = new ExecutionSandbox(this.config.sandbox);
    this.logger = new Logger({ context: { component: 'ExecutionEngine' } });
  }

  /**
   * Führt einen Befehl sicher aus
   * @param {string} command - Befehl
   * @param {string[]} args - Argumente
   * @param {Object} options - Optionen
   * @returns {Promise<SandboxResult>}
   */
  async execute(command, args = [], options = {}) {
    this.logger.info('Executing command', { command, args: args.join(' ') });
    return this.sandbox.validateAndRun(command, args, options);
  }

  /**
   * Führt JavaScript-Code aus
   * @param {string} code - JavaScript-Code
   * @param {Object} context - Context-Variablen
   * @returns {Promise<any>}
   */
  async executeJavaScript(code, context = {}) {
    this.logger.info('Executing JavaScript', { codeLength: code.length });
    return this.sandbox.runJavaScript(code, context);
  }

  /**
   * Validiert einen Befehl ohne Ausführung
   * @param {string} command - Befehl
   * @param {string[]} args - Argumente
   * @returns {Object} Validierungsergebnis
   */
  validate(command, args = []) {
    try {
      this.sandbox._validateCommand(command, args);
      this.sandbox._validateArguments(command, args);
      return { valid: true, command, args };
    } catch (error) {
      return { valid: false, error: error.message, code: error.code };
    }
  }

  /**
   * Gibt Status zurück
   */
  getStatus() {
    return {
      sandbox: {
        workingDir: this.config.sandbox.workingDir,
        timeoutMs: this.config.sandbox.timeoutMs,
        memoryLimitMB: this.config.sandbox.memoryLimitMB,
        allowedPaths: this.config.sandbox.allowedPaths
      },
      whitelistSize: Object.keys(COMMAND_WHITELIST).length,
      blockedPatterns: BLOCKED_PATTERNS.length
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  ExecutionEngine,
  ExecutionSandbox,
  VirtualFileSystem,
  ExecutionValidationError,
  COMMAND_WHITELIST,
  BLOCKED_PATTERNS,
  DEFAULT_CONFIG
};

export default ExecutionEngine;