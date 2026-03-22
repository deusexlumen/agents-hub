/**
 * Multi-Agent Supervisor v4.0
 * 
 * Refactored: XState FSM v5 mit striktem Handoff-Budget
 * Verhindert unendliche Handoff-Schleifen durch State-Machine-Guards
 * 
 * @module multi-agent-supervisor
 * @version 4.0.0
 */

const { createMachine, interpret, assign } = require('xstate');
const { SmartLoader } = require('./smart-loader');
const { ErrorRecoveryManager } = require('./enhanced-error-recovery');

// ============================================================================
// XState Finite State Machine für Handoff-Kontrolle (v5 API)
// ============================================================================

/**
 * Supervisor State Machine
 * 
 * Jeder Agent ist ein State-Node.
 * Handoff-Transitions inkrementieren handoffCount.
 * Guard verhindert Transition wenn Budget erschöpft.
 */
const supervisorMachine = createMachine({
  id: 'multiAgentSupervisor',
  
  initial: 'idle',
  
  context: {
    handoffCount: 0,
    maxHandoffs: 5,
    currentAgent: null,
    previousAgent: null,
    taskHistory: [],
    errorContext: null
  },
  
  states: {
    // Idle: Wartet auf Initialisierung
    idle: {
      on: {
        INITIALIZE: {
          target: 'ready',
          actions: assign({}) // No-op, just transition
        }
      }
    },
    
    // Ready: Bereit für Task-Zuweisung
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
    
    // Assigning: Task wird zugewiesen
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
    
    // Executing: Agent führt Task aus
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
    
    // Handoff: Wechsel zu anderem Agent
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
    
    // Error: Fehlerzustand
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
    
    // Escalation: Menschliche Intervention erforderlich
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
    
    // Terminated: Supervisor beendet
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
  MAX_HANDOFFS: 5 // Sync with FSM default
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
  }

  _generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }
}

// ============================================================================
// Multi-Agent Supervisor mit XState Integration
// ============================================================================

class MultiAgentSupervisor {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.agents = new Map();
    this.tasks = new Map();
    this.taskQueue = [];
    this.errorRecovery = new ErrorRecoveryManager();
    this.running = false;
    this.stats = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
      handoffsPrevented: 0
    };
    
    // XState Service initialisieren (v5 API)
    this.stateService = interpret(supervisorMachine);
    
    // Subscribe to state changes
    this.stateService.subscribe((state) => {
      this.currentState = state;
      const ctx = state.context;
      console.log(`[Supervisor] State: ${state.value} | Handoffs: ${ctx.handoffCount}/${ctx.maxHandoffs}`);
    });
    
    this.stateService.start();
    
    this.currentState = this.stateService.getSnapshot();
  }

  // -------------------------------------------------------------------------
  // FSM-Controlled Handoff Logic
  // -------------------------------------------------------------------------

  /**
   * Initiiert einen Handoff zu einem anderen Agent
   * Wird durch FSM-Guards blockiert wenn Budget erschöpft
   */
  async initiateHandoff(fromAgentId, toAgentId, task) {
    const currentState = this.stateService.getSnapshot();
    
    // Prüfe ob Handoff erlaubt (via FSM Guard)
    if (currentState.context.handoffCount >= currentState.context.maxHandoffs) {
      console.error(`[Supervisor] HANDOFF BLOCKED: Budget exhausted (${currentState.context.handoffCount}/${currentState.context.maxHandoffs})`);
      this.stats.handoffsPrevented++;
      
      // Transition zu Escalation
      this.stateService.send({ type: 'ESCALATE' });
      
      throw new Error(
        `Infinite loop prevention: Maximum handoffs (${this.config.MAX_HANDOFFS}) exceeded. ` +
        `Task ${task.id} requires escalation.`
      );
    }
    
    // Handoff durchführen
    console.log(`[Supervisor] Initiating handoff: ${fromAgentId} → ${toAgentId}`);
    
    this.stateService.send({
      type: 'HANDOFF',
      targetAgent: toAgentId
    });
    
    // Neue Zuweisung
    this.stateService.send({
      type: 'ASSIGN_TASK',
      agentId: toAgentId
    });
    
    // Update Task
    task.handoffCount = (task.handoffCount || 0) + 1;
    
    return {
      success: true,
      from: fromAgentId,
      to: toAgentId,
      handoffNumber: currentState.context.handoffCount + 1
    };
  }

  /**
   * Prüft ob Handoffs noch erlaubt sind
   */
  canHandoff() {
    const state = this.stateService.getSnapshot();
    return state.context.handoffCount < state.context.maxHandoffs;
  }

  /**
   * Gibt aktuelles Handoff-Budget zurück
   */
  getHandoffBudget() {
    const state = this.stateService.getSnapshot();
    return {
      used: state.context.handoffCount,
      max: state.context.maxHandoffs,
      remaining: state.context.maxHandoffs - state.context.handoffCount
    };
  }

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Task Management mit FSM-Integration
  // -------------------------------------------------------------------------

  createTask(config) {
    const task = new Task(config);
    this.tasks.set(task.id, task);
    this.taskQueue.push(task);
    this.stats.tasksCreated++;
    
    console.log(`[Supervisor] Task created: ${task.id} (${task.type})`);
    
    // FSM: Initialisiere wenn nötig
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
      handoffCount: task.handoffCount
    } : null;
  }

  // -------------------------------------------------------------------------
  // Task Execution mit FSM-State-Tracking
  // -------------------------------------------------------------------------

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
    
    // FSM: Zuweisung
    this.stateService.send({
      type: 'ASSIGN_TASK',
      agentId: agent.id
    });
    
    console.log(`[Supervisor] Task ${task.id} assigned to ${agent.name}`);
    
    try {
      await agent.initialize(task.description);
      
      task.status = 'running';
      task.startedAt = Date.now();
      
      // FSM: Ausführung
      this.stateService.send({ type: 'EXECUTE' });
      
      const result = await this.errorRecovery.execute(
        `task_${task.id}`,
        () => agent.execute(task),
        {
          retry: { MAX_ATTEMPTS: 2 },
          timeout: this.config.AGENT_TIMEOUT_MS
        }
      );
      
      // FSM: Abschluss
      this.stateService.send({
        type: 'COMPLETE',
        result
      });
      
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      
      this.stats.tasksCompleted++;
      this.stats.totalExecutionTime += (task.completedAt - task.startedAt);
      
      console.log(`[Supervisor] Task ${task.id} completed by ${agent.name}`);
      
    } catch (error) {
      // FSM: Fehler
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

  _coordinate() {
    // FSM-State prüfen
    const state = this.stateService.getSnapshot();
    
    if (state.value === 'escalation') {
      console.warn('[Supervisor] Currently in escalation state - manual intervention required');
      return;
    }
    
    // Stuck tasks checken
    for (const task of this.tasks.values()) {
      if (task.status === 'running') {
        const elapsed = Date.now() - task.startedAt;
        
        if (elapsed > this.config.AGENT_TIMEOUT_MS * 2) {
          console.log(`[Supervisor] Task ${task.id} appears stuck`);
        }
      }
    }
    
    this._processQueue();
  }

  // -------------------------------------------------------------------------
  // Result Aggregation
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

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
      escalation: fsmState.value === 'escalation'
    };
  }

  printStatus() {
    const status = this.getStatus();
    
    console.log('\n============================');
    console.log('SUPERVISOR STATUS (v4.0 XState)');
    console.log('============================');
    console.log(`FSM State: ${status.fsmState}`);
    console.log(`Running: ${status.running}`);
    console.log(`\nHandoff Budget: ${status.handoffBudget.used}/${status.handoffBudget.max} ` +
      `(remaining: ${status.handoffBudget.remaining})`);
    
    if (status.escalation) {
      console.log('\n🚨 ESCALATION STATE: Manual intervention required');
    }
    
    console.log(`\nAgents: ${status.agents.total} total`);
    console.log(`  Idle: ${status.agents.idle}`);
    console.log(`  Busy: ${status.agents.busy}`);
    console.log(`\nTasks: ${status.tasks.total} total`);
    console.log(`  Pending: ${status.tasks.pending}`);
    console.log(`  Running: ${status.tasks.running}`);
    console.log(`  Completed: ${status.tasks.completed}`);
    console.log(`  Failed: ${status.tasks.failed}`);
    console.log(`\nLoop Prevention: ${status.stats.handoffsPrevented} handoffs blocked`);
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
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  console.log('Multi-Agent Supervisor v4.0 - XState FSM Edition\n');
  console.log('Features:');
  console.log('  - Finite State Machine for deterministic state tracking');
  console.log('  - Strict handoff budget (max 5) prevents infinite loops');
  console.log('  - Automatic escalation on budget exhaustion');
  console.log('  - Guard conditions block transitions when unsafe\n');
  
  const supervisor = new MultiAgentSupervisor();
  
  // Register agents
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
  
  // Test: Create tasks
  console.log('\nCreating tasks...');
  
  const tasks = supervisor.createTasks([
    {
      type: 'frontend',
      description: 'Build login form UI',
      requiredCapabilities: ['frontend', 'react']
    },
    {
      type: 'backend',
      description: 'Implement auth API',
      requiredCapabilities: ['backend', 'api']
    },
    {
      type: 'security',
      description: 'Review authentication flow',
      requiredCapabilities: ['security', 'auth']
    }
  ]);
  
  console.log(`Created ${tasks.length} tasks`);
  
  // Start supervisor
  supervisor.start();
  
  // Demo: Handoff budget
  console.log('\n--- Handoff Budget Demo ---');
  const budget = supervisor.getHandoffBudget();
  console.log(`Initial budget: ${budget.used}/${budget.max} used`);
  console.log(`Can handoff: ${supervisor.canHandoff()}`);
  
  // Print status
  setTimeout(() => {
    supervisor.printStatus();
    supervisor.stop();
  }, 100);
  
  console.log('\nUsage:');
  console.log('  const { MultiAgentSupervisor } = require("./multi-agent-supervisor");');
  console.log('  const supervisor = new MultiAgentSupervisor();');
  console.log('  supervisor.initiateHandoff(fromId, toId, task); // Budget-checked');
  console.log('  supervisor.getHandoffBudget(); // {used, max, remaining}');
}