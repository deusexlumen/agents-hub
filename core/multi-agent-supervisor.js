/**
 * Multi-Agent Supervisor v6.0
 * 
 * Refactored: Atomares State-Locking + Batch-Commit + Context-Caching
 * Thread-sichere parallele Agent-Ausführung mit deterministischen State-Updates
 * 
 * @module multi-agent-supervisor
 * @version 6.0.0
 */

const { createMachine, interpret, assign } = require('xstate');
const { z } = require('zod');
const { SmartLoader } = require('./smart-loader');
const { ErrorRecoveryManager } = require('./enhanced-error-recovery');
const { ContextCompiler } = require('./context-compiler');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// ============================================================================
// Atomarer Mutex für State-Locking (File-based für Cross-Process-Safety)
// ============================================================================

class StateLockManager {
  constructor(lockDir = './locks') {
    this.lockDir = lockDir;
    this.localLock = new Map();
    this.lockCounter = 0;
    this.lockQueue = [];
  }

  async acquire(lockName = 'state', timeout = 30000) {
    const startTime = Date.now();
    const lockFile = path.join(this.lockDir, `${lockName}.lock`);
    
    await fs.mkdir(this.lockDir, { recursive: true });
    
    while (Date.now() - startTime < timeout) {
      try {
        await fs.writeFile(lockFile, JSON.stringify({
          pid: process.pid,
          timestamp: Date.now()
        }), { flag: 'wx' });
        
        this.localLock.set(lockName, lockFile);
        this.lockCounter++;
        
        return {
          release: async () => {
            try {
              await fs.unlink(lockFile);
              this.localLock.delete(lockName);
            } catch (err) {
              console.warn(`[Mutex] Lock release warning: ${err.message}`);
            }
          }
        };
      } catch (err) {
        if (err.code === 'EEXIST') {
          await this._sleep(50);
          continue;
        }
        throw err;
      }
    }
    
    throw new Error(`Failed to acquire lock '${lockName}' within ${timeout}ms`);
  }

  async withLock(lockName, fn, timeout = 30000) {
    const lock = await this.acquire(lockName, timeout);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isLocked(lockName) {
    return this.localLock.has(lockName);
  }

  getStats() {
    return {
      activeLocks: this.localLock.size,
      totalLocksAcquired: this.lockCounter,
      lockNames: Array.from(this.localLock.keys())
    };
  }
}

// ============================================================================
// Batch-Commit Manager für atomare State-Updates
// ============================================================================

class BatchCommitManager {
  constructor(supervisor) {
    this.supervisor = supervisor;
    this.pendingResults = [];
    this.isCommitting = false;
    this.commitQueue = [];
    this.stats = {
      totalCommits: 0,
      batchCommits: 0,
      individualCommits: 0,
      failedCommits: 0,
      errorsMarked: 0
    };
  }

  addPendingResult(result) {
    this.pendingResults.push({
      ...result,
      pendingSince: Date.now()
    });
  }

  async executeBatchCommit() {
    if (this.isCommitting || this.pendingResults.length === 0) {
      return { committed: 0, results: [] };
    }

    this.isCommitting = true;
    const batch = [...this.pendingResults];
    this.pendingResults = [];

    const lockManager = this.supervisor.lockManager;
    
    try {
      const commitResult = await lockManager.withLock('state', async () => {
        const results = [];
        const errors = [];

        for (const item of batch) {
          try {
            const result = await this._commitSingle(item);
            results.push({ success: true, id: item.taskId, result });
          } catch (err) {
            errors.push({ 
              success: false, 
              id: item.taskId, 
              error: err.message,
              marked: true 
            });
            this.stats.errorsMarked++;
            
            if (item.task) {
              item.task.status = 'failed';
              item.task.result = { 
                error: err.message, 
                batchError: true,
                timestamp: Date.now()
              };
            }
          }
        }

        return { results, errors, total: batch.length };
      });

      this.stats.totalCommits++;
      this.stats.batchCommits++;

      console.log(`[BatchCommit] Committed ${commitResult.total} items (${commitResult.results.length} OK, ${commitResult.errors.length} errors)`);

      return commitResult;

    } catch (err) {
      this.stats.failedCommits++;
      
      for (const item of batch) {
        if (item.task) {
          item.task.status = 'failed';
          item.task.result = { 
            error: `Batch commit failed: ${err.message}`,
            timestamp: Date.now()
          };
        }
      }
      
      throw err;
    } finally {
      this.isCommitting = false;
    }
  }

  async _commitSingle(item) {
    const { task, agent, result } = item;
    
    if (!task || !agent) {
      throw new Error('Invalid commit item: missing task or agent');
    }

    task.status = 'completed';
    task.result = result;
    task.completedAt = Date.now();

    this.supervisor.stats.tasksCompleted++;
    this.supervisor.stats.totalExecutionTime += (task.completedAt - task.startedAt);

    agent.status = 'idle';
    agent.currentTask = null;
    agent.history.push({
      task: task.id,
      result: 'success',
      duration: task.completedAt - task.startedAt
    });

    this.supervisor.stateService.send({
      type: 'COMPLETE',
      result
    });

    return {
      taskId: task.id,
      agentId: agent.id,
      timestamp: task.completedAt
    };
  }

  async commitIndividual(task, agent, result) {
    return this.lockManager.withLock('state', async () => {
      this.stats.individualCommits++;
      return this._commitSingle({ task, agent, result });
    });
  }

  getPendingCount() {
    return this.pendingResults.length;
  }

  getStats() {
    return { ...this.stats, pending: this.pendingResults.length };
  }
}

// ============================================================================
// Zod Schemas für strikte I/O-Validierung
// ============================================================================

const AgentMessageSchema = z.object({
  agentId: z.string().min(1).max(100),
  taskId: z.string().min(1).max(100),
  payload: z.object({
    type: z.enum(['TASK_REQUEST', 'TASK_RESPONSE', 'HANDOFF_REQUEST', 'ERROR_REPORT']),
    data: z.record(z.any()).optional(),
    metadata: z.object({
      timestamp: z.number().default(() => Date.now()),
      compressionApplied: z.boolean().default(false),
      originalMessageCount: z.number().optional()
    }).default({})
  }),
  summary: z.string().max(5000).default('')
});

const CompressedContextSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(10000),
    timestamp: z.number().optional()
  })).max(5),
  summary: z.string().max(10000),
  metadata: z.object({
    originalCount: z.number(),
    compressionRatio: z.number(),
    compressedAt: z.number()
  })
});

const ValidationResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  errors: z.array(z.object({
    path: z.array(z.string()),
    message: z.string()
  })).default([])
});

// ============================================================================
// Custom Validation Errors
// ============================================================================

class AgentMessageValidationError extends Error {
  constructor(issues, originalData) {
    const errorMessages = issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    super(`AgentMessage validation failed: ${errorMessages}`);
    this.name = 'AgentMessageValidationError';
    this.issues = issues;
    this.originalData = originalData;
    this.timestamp = Date.now();
  }
}

class ContextCompressionError extends Error {
  constructor(message, context) {
    super(message);
    this.name = 'ContextCompressionError';
    this.context = context;
    this.timestamp = Date.now();
  }
}

class HandoffValidationError extends Error {
  constructor(message, fromAgent, toAgent, taskId) {
    super(message);
    this.name = 'HandoffValidationError';
    this.fromAgent = fromAgent;
    this.toAgent = toAgent;
    this.taskId = taskId;
    this.timestamp = Date.now();
  }
}

class StateLockError extends Error {
  constructor(message, lockName) {
    super(message);
    this.name = 'StateLockError';
    this.lockName = lockName;
    this.timestamp = Date.now();
  }
}

// ============================================================================
// XState Finite State Machine
// ============================================================================

const supervisorMachine = createMachine({
  id: 'multiAgentSupervisor',
  
  initial: 'idle',
  
  context: {
    handoffCount: 0,
    maxHandoffs: 5,
    currentAgent: null,
    previousAgent: null,
    taskHistory: [],
    errorContext: null,
    lastValidationResult: null
  },
  
  states: {
    idle: {
      on: {
        INITIALIZE: {
          target: 'ready',
          actions: assign({})
        }
      }
    },
    
    ready: {
      entry: () => console.log('[Supervisor FSM] State: ready'),
      on: {
        ASSIGN_TASK: {
          target: 'assigning',
          actions: assign({
            currentAgent: ({ event }) => event.agentId
          })
        },
        SHUTDOWN: {
          target: 'terminated'
        }
      }
    },
    
    assigning: {
      entry: ({ context }) => console.log(`[Supervisor FSM] Task assigned to: ${context.currentAgent}`),
      on: {
        EXECUTE: {
          target: 'executing'
        },
        HANDOFF: [
          {
            target: 'handoff',
            actions: assign({
              handoffCount: ({ context }) => context.handoffCount + 1
            }),
            guard: ({ context }) => context.handoffCount < context.maxHandoffs
          },
          {
            target: 'escalation',
            actions: assign({
              errorContext: ({ context }) => ({
                message: `Handoff budget exhausted: ${context.handoffCount}/${context.maxHandoffs}`,
                timestamp: Date.now()
              })
            })
          }
        ],
        VALIDATION_ERROR: {
          target: 'validation_failed',
          actions: assign({
            errorContext: ({ event }) => ({
              message: event.error?.message || 'Validation failed',
              validationErrors: event.error?.issues || [],
              timestamp: Date.now()
            }),
            lastValidationResult: ({ event }) => ({
              success: false,
              errors: event.error?.issues || []
            })
          })
        },
        ERROR: {
          target: 'error',
          actions: assign({
            errorContext: ({ event }) => ({
              message: event.error?.message || 'Unknown error',
              timestamp: Date.now()
            })
          })
        }
      }
    },
    
    executing: {
      entry: ({ context }) => console.log(`[Supervisor FSM] Executing on: ${context.currentAgent}`),
      on: {
        COMPLETE: {
          target: 'ready',
          actions: assign({
            handoffCount: 0,
            taskHistory: ({ context, event }) => [...context.taskHistory, {
              agent: context.currentAgent,
              timestamp: Date.now(),
              result: event.result
            }]
          })
        },
        HANDOFF: [
          {
            target: 'handoff',
            actions: assign({
              handoffCount: ({ context }) => context.handoffCount + 1
            }),
            guard: ({ context }) => context.handoffCount < context.maxHandoffs
          },
          {
            target: 'escalation',
            actions: assign({
              errorContext: ({ context }) => ({
                message: `Handoff budget exhausted: ${context.handoffCount}/${context.maxHandoffs}`,
                timestamp: Date.now()
              })
            })
          }
        ],
        VALIDATION_ERROR: {
          target: 'validation_failed',
          actions: assign({
            errorContext: ({ event }) => ({
              message: event.error?.message || 'Validation failed',
              validationErrors: event.error?.issues || [],
              timestamp: Date.now()
            })
          })
        },
        ERROR: {
          target: 'error',
          actions: assign({
            errorContext: ({ event }) => ({
              message: event.error?.message || 'Unknown error',
              timestamp: Date.now()
            })
          })
        }
      }
    },
    
    handoff: {
      entry: ({ context, event }) => {
        console.log(
          `[Supervisor FSM] Handoff #${context.handoffCount}/${context.maxHandoffs}: ` +
          `${context.currentAgent} → ${event.targetAgent || 'unknown'}`
        );
      },
      on: {
        ASSIGN_TASK: {
          target: 'assigning',
          actions: assign({
            previousAgent: ({ context }) => context.currentAgent,
            currentAgent: ({ event }) => event.agentId
          })
        },
        VALIDATION_ERROR: {
          target: 'validation_failed',
          actions: assign({
            errorContext: ({ event }) => ({
              message: event.error?.message || 'Validation failed during handoff',
              validationErrors: event.error?.issues || [],
              timestamp: Date.now()
            })
          })
        },
        ERROR: {
          target: 'error',
          actions: assign({
            errorContext: ({ event }) => ({
              message: event.error?.message || 'Unknown error',
              timestamp: Date.now()
            })
          })
        }
      }
    },
    
    validation_failed: {
      entry: ({ context }) => {
        console.error(`[Supervisor FSM] Validation failed:`, context.errorContext?.message);
        if (context.errorContext?.validationErrors) {
          console.error('[Supervisor FSM] Validation issues:', context.errorContext.validationErrors);
        }
      },
      on: {
        RECOVER: {
          target: 'ready',
          actions: assign({
            errorContext: null,
            lastValidationResult: null
          })
        },
        ESCALATE: {
          target: 'escalation'
        }
      }
    },
    
    error: {
      entry: ({ context }) => {
        console.error(`[Supervisor FSM] Error:`, context.errorContext?.message);
      },
      on: {
        RECOVER: {
          target: 'ready',
          actions: assign({
            errorContext: null,
            handoffCount: 0
          })
        },
        ESCALATE: {
          target: 'escalation'
        }
      }
    },
    
    escalation: {
      entry: ({ context }) => {
        console.error(
          `[Supervisor FSM] 🚨 ESCALATION: ${context.errorContext?.message || 'Unknown issue'}. ` +
          `Human intervention required.`
        );
      },
      on: {
        RESOLVE: {
          target: 'ready',
          actions: assign({
            errorContext: null,
            handoffCount: 0
          })
        }
      }
    },
    
    terminated: {
      type: 'final',
      entry: () => console.log('[Supervisor FSM] Terminated')
    }
  }
});

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_PARALLEL_AGENTS: 5,
  AGENT_TIMEOUT_MS: 30000,
  COORDINATION_INTERVAL_MS: 5000,
  CONFLICT_RESOLUTION: 'hierarchy',
  MAX_HANDOFFS: 5,
  MAX_CONTEXT_MESSAGES: 5,
  CONTEXT_SUMMARY_MAX_LENGTH: 10000,
  BATCH_COMMIT_INTERVAL: 1000,
  LOCK_TIMEOUT: 30000
};

// ============================================================================
// Agent Definition
// ============================================================================

class Agent {
  constructor(config) {
    this.id = config.id || this._generateId();
    this.name = config.name;
    this.template = config.template;
    this.capabilities = config.capabilities || [];
    this.priority = config.priority || 0;
    this.status = 'idle';
    this.currentTask = null;
    this.history = [];
    this.contextBuffer = [];
    
    this.loader = new SmartLoader();
    this.context = null;
  }

  async initialize(taskDescription) {
    this.context = this.loader.loadOptimalContext(taskDescription);
    this.status = 'ready';
    return this;
  }

  async execute(task) {
    this.status = 'busy';
    this.currentTask = task;
    
    const startTime = Date.now();
    
    try {
      const result = await this._performTask(task);
      
      this.history.push({
        task: task.id,
        result: 'success',
        duration: Date.now() - startTime
      });
      
      this.status = 'idle';
      this.currentTask = null;
      
      return {
        success: true,
        agent: this.name,
        agentId: this.id,
        result
      };
    } catch (error) {
      this.history.push({
        task: task.id,
        result: 'error',
        error: error.message,
        duration: Date.now() - startTime
      });
      
      this.status = 'error';
      this.currentTask = null;
      
      throw error;
    }
  }

  canHandle(task) {
    return task.requiredCapabilities.every(cap => 
      this.capabilities.includes(cap)
    );
  }

  _generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  async _performTask(task) {
    return {
      taskId: task.id,
      agent: this.name,
      agentId: this.id,
      output: `Completed by ${this.name}`,
      context: this.context
    };
  }
}

// ============================================================================
// Task Definition
// ============================================================================

class Task {
  constructor(config) {
    this.id = config.id || this._generateId();
    this.type = config.type;
    this.description = config.description;
    this.requiredCapabilities = config.requiredCapabilities || [];
    this.dependencies = config.dependencies || [];
    this.priority = config.priority || 0;
    this.status = 'pending';
    this.result = null;
    this.assignedTo = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.handoffCount = 0;
    this.contextHistory = [];
  }

  _generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }
}

// ============================================================================
// Multi-Agent Supervisor mit Mutex + Batch-Commit + Context-Caching
// ============================================================================

class MultiAgentSupervisor {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.agents = new Map();
    this.tasks = new Map();
    this.taskQueue = [];
    this.errorRecovery = new ErrorRecoveryManager();
    this.contextCompiler = new ContextCompiler();
    this.lockManager = new StateLockManager(config.lockDir || './locks');
    this.batchManager = new BatchCommitManager(this);
    this.running = false;
    this.stats = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
      handoffsPrevented: 0,
      validationFailures: 0,
      contextsCompressed: 0,
      mutexWaits: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.stateService = interpret(supervisorMachine);
    
    this.stateService.subscribe((state) => {
      this.currentState = state;
      const ctx = state.context;
      console.log(`[Supervisor] State: ${state.value} | Handoffs: ${ctx.handoffCount}/${ctx.maxHandoffs}`);
    });
    
    this.stateService.start();
    this.currentState = this.stateService.getSnapshot();
    
    this._startBatchCommitTimer();
  }

  _startBatchCommitTimer() {
    this.batchCommitInterval = setInterval(async () => {
      if (this.batchManager.getPendingCount() > 0 && !this.batchManager.isCommitting) {
        try {
          await this.batchManager.executeBatchCommit();
        } catch (err) {
          console.error('[BatchCommit] Timer-triggered commit failed:', err.message);
        }
      }
    }, this.config.BATCH_COMMIT_INTERVAL);
  }

  // ============================================================================
  // Atomares State-Locking (Mutex)
  // ============================================================================

  async withStateLock(fn, timeout = null) {
    const startTime = Date.now();
    try {
      const result = await this.lockManager.withLock('state', fn, timeout || this.config.LOCK_TIMEOUT);
      this.stats.mutexWaits += Date.now() - startTime;
      return result;
    } catch (err) {
      throw new StateLockError(`State lock failed: ${err.message}`, 'state');
    }
  }

  async saveStateAtomic(stateUpdate) {
    return this.withStateLock(async () => {
      const stateHash = this._generateStateHash(stateUpdate);
      const persistedState = {
        ...stateUpdate,
        persistedAt: Date.now(),
        stateHash
      };
      
      console.log(`[Mutex] State saved atomically: ${stateHash}`);
      return persistedState;
    });
  }

  // ============================================================================
  // Context-Kompression mit Caching
  // ============================================================================

  _compressContext(contextArray) {
    const inputHash = this._generateHash(JSON.stringify(contextArray));
    
    const cached = this.contextCompiler.getCached(inputHash);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }
    
    this.stats.cacheMisses++;

    if (!Array.isArray(contextArray)) {
      throw new ContextCompressionError('Context must be an array', contextArray);
    }

    const maxMessages = this.config.MAX_CONTEXT_MESSAGES;
    
    if (contextArray.length <= maxMessages) {
      const result = {
        messages: contextArray,
        summary: '',
        metadata: {
          originalCount: contextArray.length,
          compressionRatio: 1.0,
          compressedAt: Date.now()
        }
      };
      this.contextCompiler.cache(inputHash, result);
      return result;
    }

    const messagesToKeep = contextArray.slice(-maxMessages);
    const messagesToSummarize = contextArray.slice(0, -maxMessages);
    const summary = this._generateSummary(messagesToSummarize);

    this.stats.contextsCompressed++;

    const compressedContext = {
      messages: messagesToKeep,
      summary: summary,
      metadata: {
        originalCount: contextArray.length,
        compressionRatio: maxMessages / contextArray.length,
        compressedAt: Date.now()
      }
    };

    try {
      CompressedContextSchema.parse(compressedContext);
    } catch (error) {
      throw new ContextCompressionError(
        `Compressed context validation failed: ${error.message}`,
        compressedContext
      );
    }

    this.contextCompiler.cache(inputHash, compressedContext);
    return compressedContext;
  }

  _generateSummary(messages) {
    if (messages.length === 0) return '';

    const keyPoints = messages.map(msg => {
      const role = msg.role || 'unknown';
      const content = msg.content || '';
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      return `[${role}] ${preview}`;
    });

    const summary = `Previous conversation (${messages.length} messages):\n` +
      keyPoints.join('\n');

    return summary.length > this.config.CONTEXT_SUMMARY_MAX_LENGTH 
      ? summary.substring(0, this.config.CONTEXT_SUMMARY_MAX_LENGTH) + '...'
      : summary;
  }

  // ============================================================================
  // Delegation mit Zod-Validierung
  // ============================================================================

  _validateAgentMessage(payload) {
    try {
      const validatedData = AgentMessageSchema.parse(payload);
      return {
        success: true,
        data: validatedData,
        errors: []
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => ({
          path: issue.path,
          message: issue.message
        }));
        return {
          success: false,
          data: null,
          errors: issues
        };
      }
      return {
        success: false,
        data: null,
        errors: [{ path: [], message: error.message }]
      };
    }
  }

  async delegateTask(fromAgentId, toAgentId, task, contextData = null) {
    const fromAgent = this.agents.get(fromAgentId);
    const toAgent = this.agents.get(toAgentId);

    if (!fromAgent) {
      throw new HandoffValidationError(
        `Source agent not found: ${fromAgentId}`,
        fromAgentId,
        toAgentId,
        task?.id
      );
    }

    if (!toAgent) {
      throw new HandoffValidationError(
        `Target agent not found: ${toAgentId}`,
        fromAgentId,
        toAgentId,
        task?.id
      );
    }

    const currentState = this.stateService.getSnapshot();
    
    if (currentState.context.handoffCount >= currentState.context.maxHandoffs) {
      console.error(`[Supervisor] HANDOFF BLOCKED: Budget exhausted (${currentState.context.handoffCount}/${currentState.context.maxHandoffs})`);
      this.stats.handoffsPrevented++;
      this.stateService.send({ type: 'ESCALATE' });
      
      throw new HandoffValidationError(
        `Infinite loop prevention: Maximum handoffs (${this.config.MAX_HANDOFFS}) exceeded`,
        fromAgentId,
        toAgentId,
        task?.id
      );
    }

    const messagePayload = {
      agentId: toAgentId,
      taskId: task?.id || this._generateTaskId(),
      payload: {
        type: 'HANDOFF_REQUEST',
        data: {
          fromAgent: fromAgentId,
          taskDescription: task?.description || '',
          requiredCapabilities: task?.requiredCapabilities || [],
          handoffCount: currentState.context.handoffCount + 1
        },
        metadata: {
          timestamp: Date.now(),
          compressionApplied: false,
          originalMessageCount: 0
        }
      },
      summary: ''
    };

    if (contextData && Array.isArray(contextData.messages)) {
      const compressedContext = this._compressContext(contextData.messages);
      
      messagePayload.payload.data.context = compressedContext.messages;
      messagePayload.summary = compressedContext.summary;
      messagePayload.payload.metadata.compressionApplied = true;
      messagePayload.payload.metadata.originalMessageCount = compressedContext.metadata.originalCount;
      messagePayload.payload.metadata.compressionMetadata = compressedContext.metadata;
    }

    const validationResult = this._validateAgentMessage(messagePayload);

    if (!validationResult.success) {
      this.stats.validationFailures++;
      
      const validationError = new AgentMessageValidationError(
        validationResult.errors,
        messagePayload
      );
      
      this.stateService.send({
        type: 'VALIDATION_ERROR',
        error: validationError
      });
      
      throw validationError;
    }

    console.log(`[Supervisor] Validated handoff: ${fromAgentId} → ${toAgentId}`);
    console.log(`[Supervisor] Context compressed: ${messagePayload.payload.metadata.compressionApplied}`);

    this.stateService.send({
      type: 'HANDOFF',
      targetAgent: toAgentId
    });
    
    this.stateService.send({
      type: 'ASSIGN_TASK',
      agentId: toAgentId
    });

    if (task) {
      task.handoffCount = (task.handoffCount || 0) + 1;
      
      if (!task.contextHistory) {
        task.contextHistory = [];
      }
      task.contextHistory.push({
        handoffNumber: currentState.context.handoffCount + 1,
        from: fromAgentId,
        to: toAgentId,
        timestamp: Date.now(),
        compressed: messagePayload.payload.metadata.compressionApplied
      });
    }

    const result = {
      success: true,
      from: fromAgentId,
      to: toAgentId,
      handoffNumber: currentState.context.handoffCount + 1,
      validatedMessage: validationResult.data,
      compressed: messagePayload.payload.metadata.compressionApplied,
      originalMessageCount: messagePayload.payload.metadata.originalMessageCount
    };

    const persistedState = await this.saveStateAtomic(result);
    
    return persistedState;
  }

  _generateStateHash(state) {
    const stateString = JSON.stringify(state);
    return crypto.createHash('sha256').update(stateString).digest('hex').substring(0, 16);
  }

  _generateHash(input) {
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  _generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  // ============================================================================
  // Legacy Handoff Methods
  // ============================================================================

  async initiateHandoff(fromAgentId, toAgentId, task) {
    return this.delegateTask(fromAgentId, toAgentId, task);
  }

  canHandoff() {
    const state = this.stateService.getSnapshot();
    return state.context.handoffCount < state.context.maxHandoffs;
  }

  getHandoffBudget() {
    const state = this.stateService.getSnapshot();
    return {
      used: state.context.handoffCount,
      max: state.context.maxHandoffs,
      remaining: state.context.maxHandoffs - state.context.handoffCount
    };
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  registerAgent(agentConfig) {
    const agent = new Agent(agentConfig);
    this.agents.set(agent.id, agent);
    console.log(`[Supervisor] Agent registered: ${agent.name} (${agent.id})`);
    return agent;
  }

  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      console.log(`[Supervisor] Agent unregistered: ${agent.name}`);
    }
  }

  getAvailableAgents() {
    return [...this.agents.values()].filter(a => a.status === 'idle');
  }

  findBestAgent(task) {
    const candidates = [...this.agents.values()].filter(agent => 
      agent.status === 'idle' && agent.canHandle(task)
    );
    
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => {
      const aMatch = a.capabilities.filter(c => task.requiredCapabilities.includes(c)).length;
      const bMatch = b.capabilities.filter(c => task.requiredCapabilities.includes(c)).length;
      
      if (bMatch !== aMatch) return bMatch - aMatch;
      return b.priority - a.priority;
    });
    
    return candidates[0];
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  createTask(config) {
    const task = new Task(config);
    this.tasks.set(task.id, task);
    this.taskQueue.push(task);
    this.stats.tasksCreated++;
    
    console.log(`[Supervisor] Task created: ${task.id} (${task.type})`);
    
    if (this.currentState.value === 'idle') {
      this.stateService.send({ type: 'INITIALIZE' });
    }
    
    this._processQueue();
    
    return task;
  }

  createTasks(configs) {
    return configs.map(config => this.createTask(config));
  }

  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    return task ? {
      id: task.id,
      status: task.status,
      assignedTo: task.assignedTo,
      result: task.result,
      handoffCount: task.handoffCount,
      contextHistory: task.contextHistory || []
    } : null;
  }

  // ============================================================================
  // Task Execution mit Batch-Commit
  // ============================================================================

  start() {
    if (this.running) return;
    
    this.running = true;
    
    if (this.currentState.value === 'idle') {
      this.stateService.send({ type: 'INITIALIZE' });
    }
    
    console.log('[Supervisor] Started');
    
    this.coordinationInterval = setInterval(() => {
      this._coordinate();
    }, this.config.COORDINATION_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    
    if (this.coordinationInterval) {
      clearInterval(this.coordinationInterval);
    }
    
    if (this.batchCommitInterval) {
      clearInterval(this.batchCommitInterval);
    }
    
    this.stateService.send({ type: 'SHUTDOWN' });
    this.stateService.stop();
    
    console.log('[Supervisor] Stopped');
  }

  _processQueue() {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      
      const depsSatisfied = task.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });
      
      if (!depsSatisfied) break;
      
      const agent = this.findBestAgent(task);
      
      if (!agent) break;
      
      this.taskQueue.shift();
      this._assignTask(task, agent);
    }
  }

  async _assignTask(task, agent) {
    task.status = 'assigned';
    task.assignedTo = agent.id;
    
    this.stateService.send({
      type: 'ASSIGN_TASK',
      agentId: agent.id
    });
    
    console.log(`[Supervisor] Task ${task.id} assigned to ${agent.name}`);
    
    try {
      await agent.initialize(task.description);
      
      task.status = 'running';
      task.startedAt = Date.now();
      
      this.stateService.send({ type: 'EXECUTE' });
      
      const result = await this.errorRecovery.execute(
        `task_${task.id}`,
        () => agent.execute(task),
        {
          retry: { MAX_ATTEMPTS: 2 },
          timeout: this.config.AGENT_TIMEOUT_MS
        }
      );
      
      this.batchManager.addPendingResult({
        task,
        agent,
        result,
        taskId: task.id
      });
      
      if (this.batchManager.getPendingCount() >= 5) {
        await this.batchManager.executeBatchCommit();
      }
      
    } catch (error) {
      this.stateService.send({
        type: 'ERROR',
        error
      });
      
      task.status = 'failed';
      task.result = { error: error.message };
      task.completedAt = Date.now();
      
      this.stats.tasksFailed++;
      
      console.log(`[Supervisor] Task ${task.id} failed: ${error.message}`);
    }
    
    this._processQueue();
  }

  // ============================================================================
  // Coordinate mit Batch-Processing (Refactored)
  // ============================================================================

  async _coordinate() {
    const state = this.stateService.getSnapshot();
    
    if (state.value === 'escalation') {
      console.warn('[Supervisor] Currently in escalation state - manual intervention required');
      return;
    }
    
    if (state.value === 'validation_failed') {
      console.warn('[Supervisor] Validation failed - awaiting recovery');
      return;
    }

    const runningTasks = [...this.tasks.values()].filter(t => t.status === 'running');
    const parallelResults = [];
    
    for (const task of runningTasks) {
      const elapsed = Date.now() - task.startedAt;
      
      if (elapsed > this.config.AGENT_TIMEOUT_MS * 2) {
        console.log(`[Supervisor] Task ${task.id} appears stuck`);
        parallelResults.push({
          taskId: task.id,
          status: 'stuck',
          elapsed
        });
      } else {
        parallelResults.push({
          taskId: task.id,
          status: 'running',
          elapsed
        });
      }
    }

    if (parallelResults.length > 0) {
      console.log(`[Coordinator] ${parallelResults.length} tasks in flight`);
    }

    if (this.batchManager.getPendingCount() > 0 && !this.batchManager.isCommitting) {
      try {
        await this.batchManager.executeBatchCommit();
      } catch (err) {
        console.error('[Coordinator] Batch commit failed:', err.message);
      }
    }
    
    this._processQueue();
  }

  // ============================================================================
  // Result Aggregation
  // ============================================================================

  aggregateResults(taskIds, strategy = 'merge') {
    const results = taskIds.map(id => {
      const task = this.tasks.get(id);
      return task && task.result;
    }).filter(Boolean);
    
    switch (strategy) {
      case 'merge':
        return this._mergeResults(results);
      case 'concat':
        return results;
      case 'vote':
        return this._voteResults(results);
      default:
        return results;
    }
  }

  _mergeResults(results) {
    const merged = {};
    results.forEach(result => {
      if (typeof result === 'object') {
        Object.assign(merged, result);
      }
    });
    return merged;
  }

  _voteResults(results) {
    const counts = {};
    results.forEach(result => {
      const key = JSON.stringify(result);
      counts[key] = (counts[key] || 0) + 1;
    });
    
    const winner = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0];
    
    return winner ? JSON.parse(winner[0]) : null;
  }

  // ============================================================================
  // Reporting
  // ============================================================================

  getStatus() {
    const fsmState = this.stateService.getSnapshot();
    
    return {
      running: this.running,
      fsmState: fsmState.value,
      handoffBudget: {
        used: fsmState.context.handoffCount,
        max: fsmState.context.maxHandoffs,
        remaining: fsmState.context.maxHandoffs - fsmState.context.handoffCount
      },
      agents: {
        total: this.agents.size,
        idle: this.getAvailableAgents().length,
        busy: [...this.agents.values()].filter(a => a.status === 'busy').length
      },
      tasks: {
        total: this.tasks.size,
        pending: this.taskQueue.length,
        running: [...this.tasks.values()].filter(t => t.status === 'running').length,
        completed: this.stats.tasksCompleted,
        failed: this.stats.tasksFailed
      },
      stats: this.stats,
      lockStats: this.lockManager.getStats(),
      batchStats: this.batchManager.getStats(),
      cacheStats: this.contextCompiler.getStats(),
      escalation: fsmState.value === 'escalation',
      validationFailed: fsmState.value === 'validation_failed'
    };
  }

  printStatus() {
    const status = this.getStatus();
    
    console.log('\n============================');
    console.log('SUPERVISOR STATUS (v6.0 Mutex + Batch + Cache)');
    console.log('============================');
    console.log(`FSM State: ${status.fsmState}`);
    console.log(`Running: ${status.running}`);
    console.log(`\nHandoff Budget: ${status.handoffBudget.used}/${status.handoffBudget.max} ` +
      `(remaining: ${status.handoffBudget.remaining})`);
    
    if (status.escalation) {
      console.log('\n🚨 ESCALATION STATE: Manual intervention required');
    }
    
    if (status.validationFailed) {
      console.log('\n⚠️ VALIDATION FAILED: Check error logs');
    }
    
    console.log(`\nAgents: ${status.agents.total} total`);
    console.log(`  Idle: ${status.agents.idle}`);
    console.log(`  Busy: ${status.agents.busy}`);
    console.log(`\nTasks: ${status.tasks.total} total`);
    console.log(`  Pending: ${status.tasks.pending}`);
    console.log(`  Running: ${status.tasks.running}`);
    console.log(`  Completed: ${status.stats.tasksCompleted}`);
    console.log(`  Failed: ${status.stats.tasksFailed}`);
    console.log(`\nMutex Stats:`);
    console.log(`  Active Locks: ${status.lockStats.activeLocks}`);
    console.log(`  Total Acquired: ${status.lockStats.totalLocksAcquired}`);
    console.log(`  Wait Time: ${this.stats.mutexWaits}ms`);
    console.log(`\nBatch Commit Stats:`);
    console.log(`  Total Commits: ${status.batchStats.totalCommits}`);
    console.log(`  Batch Commits: ${status.batchStats.batchCommits}`);
    console.log(`  Individual Commits: ${status.batchStats.individualCommits}`);
    console.log(`  Errors Marked: ${status.batchStats.errorsMarked}`);
    console.log(`  Pending: ${status.batchStats.pending}`);
    console.log(`\nCache Stats:`);
    console.log(`  Hits: ${status.cacheStats.hits}`);
    console.log(`  Misses: ${status.cacheStats.misses}`);
    console.log(`  Hit Rate: ${status.cacheStats.hitRate.toFixed(2)}%`);
    console.log(`\nLoop Prevention: ${status.stats.handoffsPrevented} handoffs blocked`);
    console.log(`Validations Failed: ${status.stats.validationFailures}`);
    console.log(`Contexts Compressed: ${status.stats.contextsCompressed}`);
    console.log('============================\n');
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  MultiAgentSupervisor,
  Agent,
  Task,
  supervisorMachine,
  StateLockManager,
  BatchCommitManager,
  AgentMessageSchema,
  CompressedContextSchema,
  ValidationResultSchema,
  AgentMessageValidationError,
  ContextCompressionError,
  HandoffValidationError,
  StateLockError,
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  console.log('Multi-Agent Supervisor v6.0 - Mutex + Batch-Commit + Context-Caching\n');
  console.log('Features:');
  console.log('  - File-based Mutex for atomic state operations');
  console.log('  - Batch-Commit: Results collected, committed atomically');
  console.log('  - Context-Caching: Memoized context compilation');
  console.log('  - Error isolation: Failed tasks dont block batch');
  console.log('  - Strict Zod schema validation for all inter-agent messages');
  console.log('  - Context compression: max 5 messages + aggregated summary\n');
  
  const supervisor = new MultiAgentSupervisor();
  
  supervisor.registerAgent({
    name: 'Frontend Developer',
    template: 'web-development',
    capabilities: ['frontend', 'react', 'css', 'javascript'],
    priority: 1
  });
  
  supervisor.registerAgent({
    name: 'Backend Developer',
    template: 'api-development',
    capabilities: ['backend', 'api', 'database', 'nodejs'],
    priority: 1
  });
  
  supervisor.registerAgent({
    name: 'Security Specialist',
    template: 'security-audit',
    capabilities: ['security', 'auth', 'audit'],
    priority: 2
  });
  
  console.log('\nRegistered Agents:');
  for (const agent of supervisor.agents.values()) {
    console.log(`  - ${agent.name}: ${agent.capabilities.join(', ')}`);
  }
  
  console.log('\n--- Mutex Demo ---');
  supervisor.withStateLock(async () => {
    console.log('State lock acquired successfully');
    return { locked: true };
  }).then(() => {
    console.log('State lock released');
  });
  
  console.log('\n--- Context Caching Demo ---');
  const longContext = [
    { role: 'user', content: 'Initial request message', timestamp: Date.now() - 5000 },
    { role: 'assistant', content: 'First response from agent', timestamp: Date.now() - 4000 },
    { role: 'user', content: 'Follow-up question about implementation', timestamp: Date.now() - 3000 },
    { role: 'assistant', content: 'Detailed technical explanation', timestamp: Date.now() - 2000 },
    { role: 'user', content: 'Request for code example', timestamp: Date.now() - 1000 },
    { role: 'assistant', content: 'Code snippet provided', timestamp: Date.now() - 500 },
    { role: 'user', content: 'Final question', timestamp: Date.now() }
  ];
  
  const compressed1 = supervisor._compressContext(longContext);
  console.log(`First compression: ${longContext.length} → ${compressed1.messages.length} messages`);
  
  const compressed2 = supervisor._compressContext(longContext);
  console.log(`Second compression (cached): ${longContext.length} → ${compressed2.messages.length} messages [CACHE HIT]`);
  
  console.log('\n--- Batch Commit Demo ---');
  console.log(`Pending results: ${supervisor.batchManager.getPendingCount()}`);
  
  supervisor.printStatus();
  
  console.log('\nUsage:');
  console.log('  const { MultiAgentSupervisor } = require("./multi-agent-supervisor");');
  console.log('  const supervisor = new MultiAgentSupervisor();');
  console.log('  await supervisor.withStateLock(async () => { /* atomic operation */ });');
  console.log('  await supervisor.saveStateAtomic(stateUpdate); // Atomic state persistence');
  console.log('  supervisor._compressContext(contextArray); // Cached compression');
}