/**
 * Central Orchestrator
 * 
 * Coordinates all Agents Hub components and manages the complete
 * session lifecycle from initialization to completion
 * 
 * @module orchestrator
 * @version 2.0.0
 */

const { StateManager } = require('./state-persistence');
const { TemplateLoader } = require('./template-loader');
const { AutoTransition } = require('./auto-transition');

// ============================================================================
// Orchestrator Class
// ============================================================================

/**
 * Central orchestration controller for Agents Hub
 * Manages session lifecycle, coordinates components, and handles
 * multi-agent scenarios
 */
class Orchestrator {
  constructor(config = {}) {
    this.config = {
      enableAutoTransition: false,
      enableLearning: true,
      maxConcurrentAgents: 5,
      defaultWorkflow: 'software-dev',
      ...config
    };
    
    // Initialize core components
    this.stateManager = new StateManager(config.state);
    this.templateLoader = new TemplateLoader(config.template);
    this.autoTransition = new AutoTransition(config.autoTransition);
    
    // Active agents registry
    this.activeAgents = new Map();
    
    // Message counter for auto-transition detection
    this.messageCounters = new Map();
  }

  // -------------------------------------------------------------------------
  // Session Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a new session with full initialization
   * @param {string} intent - User intent or task description
   * @param {Object} options - Session options
   * @returns {Promise<string>} Session ID
   */
  async startSession(intent, options = {}) {
    try {
      // Initialize session state
      const sessionId = this.stateManager.initSession(
        intent,
        options.workflowType || this.config.defaultWorkflow
      );
      
      // Initialize message counter for auto-transition
      this.messageCounters.set(sessionId, 0);
      
      // Load relevant templates
      const templates = this.templateLoader.loadRelevantTemplates(intent, 3);
      
      this.stateManager.trackTemplates(
        templates.map(t => t.name),
        templates.flatMap(t => Object.keys(t.content || {}))
      );
      
      // Record session start in metrics
      this.stateManager.updateMetrics({
        session_started: new Date().toISOString(),
        templates_loaded: templates.length
      });
      
      console.log(`[Orchestrator] Session started: ${sessionId}`);
      console.log(`[Orchestrator] Loaded ${templates.length} template(s)`);
      
      return sessionId;
      
    } catch (error) {
      console.error('[Orchestrator] Failed to start session:', error);
      throw error;
    }
  }

  /**
   * Resume an existing session
   * @param {string} sessionId - Session to resume
   * @returns {Object} Session state
   */
  async resumeSession(sessionId) {
    try {
      const state = this.stateManager.loadSession(sessionId);
      
      // Reinitialize message counter
      this.messageCounters.set(sessionId, 0);
      
      console.log(`[Orchestrator] Session resumed: ${sessionId}`);
      console.log(`[Orchestrator] Current phase: ${state.context.current_phase}`);
      
      return state;
      
    } catch (error) {
      console.error('[Orchestrator] Failed to resume session:', error);
      throw error;
    }
  }

  /**
   * Process a message within a session
   * @param {string} sessionId - Session identifier
   * @param {Object} message - Message data
   * @returns {Object} Processing result with transition recommendation
   */
  async processMessage(sessionId, message) {
    try {
      // Load session state
      const state = this.stateManager.loadSession(sessionId);
      
      // Increment message counter
      const count = (this.messageCounters.get(sessionId) || 0) + 1;
      this.messageCounters.set(sessionId, count);
      
      // Check for auto-transition (every 3-5 messages)
      let transitionCheck = null;
      if (this.config.enableAutoTransition && count >= 3) {
        if (count % 3 === 0 || this._detectNaturalPause(message)) {
          transitionCheck = await this.autoTransition.analyze(sessionId, {
            currentPhase: state.context.current_phase,
            messages: count,
            lastMessage: message,
            phaseData: state.phases[state.context.current_phase]
          });
          
          if (transitionCheck.shouldTransition) {
            console.log(`[Orchestrator] Auto-transition recommended: ${transitionCheck.reason}`);
          }
        }
      }
      
      // Update session metrics
      this.stateManager.updateMetrics({
        total_messages: count,
        last_message_at: new Date().toISOString()
      });
      
      return {
        sessionId,
        currentPhase: state.context.current_phase,
        transitionRecommendation: transitionCheck,
        context: this.stateManager.getPrunedContext()
      };
      
    } catch (error) {
      console.error('[Orchestrator] Failed to process message:', error);
      throw error;
    }
  }

  /**
   * Transition between phases
   * @param {string} sessionId - Session identifier
   * @param {string} fromPhase - Current phase
   * @param {string} toPhase - Target phase
   * @param {Object} options - Transition options
   */
  async transitionPhase(sessionId, fromPhase, toPhase, options = {}) {
    try {
      console.log(`[Orchestrator] Phase transition: ${fromPhase} → ${toPhase}`);
      
      // Perform transition
      this.stateManager.transitionPhase(fromPhase, toPhase);
      
      // Record transition details
      this.stateManager.addToMemory('phase_transitions', {
        from: fromPhase,
        to: toPhase,
        reason: options.reason || 'Manual transition',
        timestamp: new Date().toISOString()
      });
      
      // Reset message counter for new phase
      this.messageCounters.set(sessionId, 0);
      
      // Create checkpoint
      this.stateManager.createCheckpoint(`transition_${fromPhase}_to_${toPhase}`);
      
      return {
        success: true,
        sessionId,
        newPhase: toPhase,
        previousPhase: fromPhase
      };
      
    } catch (error) {
      console.error('[Orchestrator] Phase transition failed:', error);
      throw error;
    }
  }

  /**
   * Close a session
   * @param {string} sessionId - Session to close
   * @param {string} finalStatus - Final status
   * @returns {Object} Session summary
   */
  async closeSession(sessionId, finalStatus = 'completed') {
    try {
      // Load session
      this.stateManager.loadSession(sessionId);
      
      // Cleanup
      this.messageCounters.delete(sessionId);
      this.activeAgents.delete(sessionId);
      
      // Close session
      const summary = this.stateManager.closeSession(finalStatus);
      
      console.log(`[Orchestrator] Session closed: ${sessionId}`);
      console.log(`[Orchestrator] Duration: ${summary.duration_minutes} minutes`);
      
      return summary;
      
    } catch (error) {
      console.error('[Orchestrator] Failed to close session:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Multi-Agent Coordination
  // -------------------------------------------------------------------------

  /**
   * Spawn a specialist agent
   * @param {string} sessionId - Parent session
   * @param {string} agentType - Type of agent to spawn
   * @param {Object} context - Agent context
   * @returns {Object} Agent handle
   */
  async spawnAgent(sessionId, agentType, context = {}) {
    try {
      // Check concurrent agent limit
      const currentAgents = this.activeAgents.get(sessionId) || [];
      if (currentAgents.length >= this.config.maxConcurrentAgents) {
        throw new Error(`Maximum concurrent agents (${this.config.maxConcurrentAgents}) reached`);
      }
      
      // Load template for agent type
      const template = this.templateLoader.loadTemplate(agentType);
      
      // Create agent
      const agent = {
        id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: agentType,
        sessionId,
        template,
        context,
        createdAt: new Date().toISOString()
      };
      
      // Register agent
      currentAgents.push(agent);
      this.activeAgents.set(sessionId, currentAgents);
      
      console.log(`[Orchestrator] Spawned agent: ${agent.id} (${agentType})`);
      
      return agent;
      
    } catch (error) {
      console.error('[Orchestrator] Failed to spawn agent:', error);
      throw error;
    }
  }

  /**
   * Coordinate multiple agents
   * @param {string} sessionId - Session identifier
   * @param {Array} tasks - Tasks to distribute
   * @returns {Object} Coordination result
   */
  async coordinateAgents(sessionId, tasks) {
    try {
      const agents = this.activeAgents.get(sessionId) || [];
      
      if (agents.length === 0) {
        console.log('[Orchestrator] No active agents to coordinate');
        return { success: false, reason: 'no_agents' };
      }
      
      // Distribute tasks among agents
      const assignments = this._distributeTasks(agents, tasks);
      
      console.log(`[Orchestrator] Coordinated ${tasks.length} tasks among ${agents.length} agents`);
      
      return {
        success: true,
        assignments,
        agentCount: agents.length,
        taskCount: tasks.length
      };
      
    } catch (error) {
      console.error('[Orchestrator] Coordination failed:', error);
      throw error;
    }
  }

  /**
   * Release an agent
   * @param {string} sessionId - Session identifier
   * @param {string} agentId - Agent to release
   */
  async releaseAgent(sessionId, agentId) {
    try {
      const agents = this.activeAgents.get(sessionId) || [];
      const filtered = agents.filter(a => a.id !== agentId);
      this.activeAgents.set(sessionId, filtered);
      
      console.log(`[Orchestrator] Released agent: ${agentId}`);
      
    } catch (error) {
      console.error('[Orchestrator] Failed to release agent:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // State Recovery
  // -------------------------------------------------------------------------

  /**
   * Check for recoverable sessions
   * @returns {Array} Recoverable sessions
   */
  getRecoverableSessions() {
    return this.stateManager.getRecoveryOptions();
  }

  /**
   * Recover from crash
   * @param {string} sessionId - Session to recover
   * @returns {Object} Recovered state
   */
  async recoverFromCrash(sessionId) {
    try {
      console.log(`[Orchestrator] Recovering session: ${sessionId}`);
      
      const state = this.stateManager.loadSession(sessionId);
      
      // Check for checkpoints
      const checkpoints = this._listCheckpoints(sessionId);
      
      console.log(`[Orchestrator] Found ${checkpoints.length} checkpoint(s)`);
      
      return {
        success: true,
        sessionId,
        currentPhase: state.context.current_phase,
        checkpoints,
        state
      };
      
    } catch (error) {
      console.error('[Orchestrator] Recovery failed:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Detect natural pause in conversation
   * @param {Object} message - Message data
   * @returns {boolean} Whether a pause is detected
   */
  _detectNaturalPause(message) {
    // Detect if message indicates completion or pause
    const pauseIndicators = [
      'fertig', 'done', 'complete', 'abgeschlossen',
      'zusammenfassung', 'summary', 'review',
      'nächste phase', 'next phase', 'weiter'
    ];
    
    const content = (message.content || '').toLowerCase();
    return pauseIndicators.some(indicator => content.includes(indicator));
  }

  /**
   * Distribute tasks among agents
   * @param {Array} agents - Available agents
   * @param {Array} tasks - Tasks to distribute
   * @returns {Array} Task assignments
   */
  _distributeTasks(agents, tasks) {
    const assignments = [];
    
    tasks.forEach((task, index) => {
      const agent = agents[index % agents.length];
      assignments.push({
        task,
        agentId: agent.id,
        agentType: agent.type
      });
    });
    
    return assignments;
  }

  /**
   * List checkpoints for a session
   * @param {string} sessionId - Session identifier
   * @returns {Array} Checkpoints
   */
  _listCheckpoints(sessionId) {
    const fs = require('fs');
    const path = require('path');
    
    const recoveryDir = path.join('./session_state', 'recovery');
    
    if (!fs.existsSync(recoveryDir)) {
      return [];
    }
    
    return fs.readdirSync(recoveryDir)
      .filter(f => f.includes(sessionId))
      .map(f => ({
        id: f.replace('.json', ''),
        path: path.join(recoveryDir, f)
      }));
  }

  /**
   * End session (alias for closeSession)
   * @param {string} finalStatus - Final status
   * @returns {Object} Session summary
   */
  async endSession(finalStatus = 'completed') {
    const sessionId = this.stateManager.sessionId;
    return this.closeSession(sessionId, finalStatus);
  }

  /**
   * Get current session status
   * @returns {Object} Session status
   */
  getStatus() {
    const state = this.stateManager.getState();
    if (!state) {
      return { active: false };
    }
    
    return {
      active: true,
      sessionId: state.metadata.session_id,
      phase: state.context.current_phase,
      workflow: state.context.workflow_type,
      progress: this._calculateProgress(state),
      duration: state.context.session_duration_minutes
    };
  }

  /**
   * Move to next phase (alias for transitionPhase)
   * @returns {Promise<Object>} Transition result
   */
  async nextPhase() {
    const state = this.stateManager.getState();
    const phaseOrder = ['discovery', 'planning', 'execution', 'review', 'delivery'];
    const currentIndex = phaseOrder.indexOf(state.context.current_phase);
    
    if (currentIndex === -1 || currentIndex >= phaseOrder.length - 1) {
      throw new Error('No next phase available');
    }
    
    return this.transitionPhase(
      state.metadata.session_id,
      phaseOrder[currentIndex],
      phaseOrder[currentIndex + 1]
    );
  }

  /**
   * Calculate session progress percentage
   * @param {Object} state - Session state
   * @returns {number} Progress percentage (0-100)
   */
  _calculateProgress(state) {
    const phaseOrder = ['discovery', 'planning', 'execution', 'review', 'delivery'];
    const completedCount = state.context.completed_phases.length;
    
    return Math.round((completedCount / phaseOrder.length) * 100);
  }
}

// ============================================================================
// AgentsHub Class - High-level API
// ============================================================================

/**
 * AgentsHub - Main API class for the Agents Hub system
 * Provides a simplified interface for common operations
 */
class AgentsHub extends Orchestrator {
  constructor(config = {}) {
    super(config);
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  Orchestrator,
  AgentsHub
};
