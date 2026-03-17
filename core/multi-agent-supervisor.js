/**
 * Multi-Agent Supervisor
 * 
 * Orchestrates multiple specialist agents for parallel task execution
 * Implements delegation, coordination, and result aggregation
 */

const { SmartLoader } = require('./smart-loader');
const { ErrorRecoveryManager } = require('./enhanced-error-recovery');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_PARALLEL_AGENTS: 5,
  AGENT_TIMEOUT_MS: 30000,
  COORDINATION_INTERVAL_MS: 5000,
  CONFLICT_RESOLUTION: 'hierarchy' // 'hierarchy', 'voting', 'consensus'
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
    this.status = 'idle'; // idle, busy, error
    this.currentTask = null;
    this.history = [];
    
    // Load agent template
    this.loader = new SmartLoader();
    this.context = null;
  }

  /**
   * Initialize agent with task context
   */
  async initialize(taskDescription) {
    this.context = this.loader.loadOptimalContext(taskDescription);
    this.status = 'ready';
    return this;
  }

  /**
   * Execute task
   */
  async execute(task) {
    this.status = 'busy';
    this.currentTask = task;
    
    const startTime = Date.now();
    
    try {
      // Task execution simulation
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

  /**
   * Check if agent can handle task
   */
  canHandle(task) {
    return task.requiredCapabilities.every(cap => 
      this.capabilities.includes(cap)
    );
  }

  _generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  async _performTask(task) {
    // This would be the actual task execution
    // For now, just return a placeholder
    return {
      taskId: task.id,
      agent: this.name,
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
    this.status = 'pending'; // pending, assigned, running, completed, failed
    this.result = null;
    this.assignedTo = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
  }

  _generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }
}

// ============================================================================
// Multi-Agent Supervisor
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
      totalExecutionTime: 0
    };
  }

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

  /**
   * Register an agent
   */
  registerAgent(agentConfig) {
    const agent = new Agent(agentConfig);
    this.agents.set(agent.id, agent);
    console.log(`[Supervisor] Agent registered: ${agent.name} (${agent.id})`);
    return agent;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      console.log(`[Supervisor] Agent unregistered: ${agent.name}`);
    }
  }

  /**
   * Get available agents
   */
  getAvailableAgents() {
    return [...this.agents.values()].filter(a => a.status === 'idle');
  }

  /**
   * Find best agent for task
   */
  findBestAgent(task) {
    const candidates = [...this.agents.values()].filter(agent => 
      agent.status === 'idle' && agent.canHandle(task)
    );
    
    if (candidates.length === 0) return null;
    
    // Sort by priority (higher is better) and capability match
    candidates.sort((a, b) => {
      const aMatch = a.capabilities.filter(c => task.requiredCapabilities.includes(c)).length;
      const bMatch = b.capabilities.filter(c => task.requiredCapabilities.includes(c)).length;
      
      if (bMatch !== aMatch) return bMatch - aMatch;
      return b.priority - a.priority;
    });
    
    return candidates[0];
  }

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  /**
   * Create and queue a task
   */
  createTask(config) {
    const task = new Task(config);
    this.tasks.set(task.id, task);
    this.taskQueue.push(task);
    this.stats.tasksCreated++;
    
    console.log(`[Supervisor] Task created: ${task.id} (${task.type})`);
    
    // Try to assign immediately if possible
    this._processQueue();
    
    return task;
  }

  /**
   * Create multiple tasks
   */
  createTasks(configs) {
    return configs.map(config => this.createTask(config));
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    return task ? {
      id: task.id,
      status: task.status,
      assignedTo: task.assignedTo,
      result: task.result
    } : null;
  }

  // -------------------------------------------------------------------------
  // Task Execution
  // -------------------------------------------------------------------------

  /**
   * Start the supervisor
   */
  start() {
    if (this.running) return;
    
    this.running = true;
    console.log('[Supervisor] Started');
    
    // Start coordination loop
    this.coordinationInterval = setInterval(() => {
      this._coordinate();
    }, this.config.COORDINATION_INTERVAL_MS);
  }

  /**
   * Stop the supervisor
   */
  stop() {
    this.running = false;
    
    if (this.coordinationInterval) {
      clearInterval(this.coordinationInterval);
    }
    
    console.log('[Supervisor] Stopped');
  }

  /**
   * Process task queue
   */
  _processQueue() {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      
      // Check dependencies
      const depsSatisfied = task.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });
      
      if (!depsSatisfied) break;
      
      // Find agent
      const agent = this.findBestAgent(task);
      
      if (!agent) break; // No available agent
      
      // Assign task
      this.taskQueue.shift();
      this._assignTask(task, agent);
    }
  }

  /**
   * Assign task to agent
   */
  async _assignTask(task, agent) {
    task.status = 'assigned';
    task.assignedTo = agent.id;
    
    console.log(`[Supervisor] Task ${task.id} assigned to ${agent.name}`);
    
    try {
      // Initialize agent with task context
      await agent.initialize(task.description);
      
      // Execute with error recovery
      task.status = 'running';
      task.startedAt = Date.now();
      
      const result = await this.errorRecovery.execute(
        `task_${task.id}`,
        () => agent.execute(task),
        {
          retry: { MAX_ATTEMPTS: 2 },
          timeout: this.config.AGENT_TIMEOUT_MS
        }
      );
      
      // Success
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      
      this.stats.tasksCompleted++;
      this.stats.totalExecutionTime += (task.completedAt - task.startedAt);
      
      console.log(`[Supervisor] Task ${task.id} completed by ${agent.name}`);
      
    } catch (error) {
      // Failure
      task.status = 'failed';
      task.result = { error: error.message };
      task.completedAt = Date.now();
      
      this.stats.tasksFailed++;
      
      console.log(`[Supervisor] Task ${task.id} failed: ${error.message}`);
    }
    
    // Process more tasks
    this._processQueue();
  }

  /**
   * Coordination loop
   */
  _coordinate() {
    // Check for stuck tasks
    for (const task of this.tasks.values()) {
      if (task.status === 'running') {
        const elapsed = Date.now() - task.startedAt;
        
        if (elapsed > this.config.AGENT_TIMEOUT_MS * 2) {
          console.log(`[Supervisor] Task ${task.id} appears stuck, considering reassignment`);
          // Could implement reassignment logic here
        }
      }
    }
    
    // Try to process queue
    this._processQueue();
  }

  // -------------------------------------------------------------------------
  // Result Aggregation
  // -------------------------------------------------------------------------

  /**
   * Aggregate results from multiple tasks
   */
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
    // Simple voting - return most common result
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

  /**
   * Get supervisor status
   */
  getStatus() {
    return {
      running: this.running,
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
      stats: this.stats
    };
  }

  /**
   * Print status report
   */
  printStatus() {
    const status = this.getStatus();
    
    console.log('\n============================');
    console.log('SUPERVISOR STATUS');
    console.log('============================');
    console.log(`Running: ${status.running}`);
    console.log(`\nAgents: ${status.agents.total} total`);
    console.log(`  Idle: ${status.agents.idle}`);
    console.log(`  Busy: ${status.agents.busy}`);
    console.log(`\nTasks: ${status.tasks.total} total`);
    console.log(`  Pending: ${status.tasks.pending}`);
    console.log(`  Running: ${status.tasks.running}`);
    console.log(`  Completed: ${status.tasks.completed}`);
    console.log(`  Failed: ${status.tasks.failed}`);
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
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  console.log('Multi-Agent Supervisor v1.0\n');
  
  // Example usage
  const supervisor = new MultiAgentSupervisor();
  
  // Register agents
  const frontendAgent = supervisor.registerAgent({
    name: 'Frontend Developer',
    template: 'web-development',
    capabilities: ['frontend', 'react', 'css', 'javascript'],
    priority: 1
  });
  
  const backendAgent = supervisor.registerAgent({
    name: 'Backend Developer',
    template: 'api-development',
    capabilities: ['backend', 'api', 'database', 'nodejs'],
    priority: 1
  });
  
  const securityAgent = supervisor.registerAgent({
    name: 'Security Specialist',
    template: 'security-audit',
    capabilities: ['security', 'auth', 'audit'],
    priority: 2
  });
  
  console.log('\nRegistered Agents:');
  for (const agent of supervisor.agents.values()) {
    console.log(`  - ${agent.name}: ${agent.capabilities.join(', ')}`);
  }
  
  // Example: Create parallel tasks
  console.log('\nExample: Creating tasks...');
  
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
  
  // Print status
  setTimeout(() => {
    supervisor.printStatus();
    supervisor.stop();
  }, 100);
  
  console.log('\nUsage:');
  console.log('  const { MultiAgentSupervisor } = require("./multi-agent-supervisor");');
  console.log('  const supervisor = new MultiAgentSupervisor();');
  console.log('  supervisor.registerAgent({ name: "Dev", capabilities: ["code"] });');
  console.log('  supervisor.createTask({ type: "code", requiredCapabilities: ["code"] });');
  console.log('  supervisor.start();');
}
