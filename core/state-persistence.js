/**
 * State Persistence Layer
 * 
 * JSON/YAML-based state management with recovery
 * Compatible with Node.js and browser environments
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  STATE_DIR: './session_state',
  AUTOSAVE_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_CHECKPOINTS: 10,
  PRUNE_THRESHOLD_TOKENS: 8000,
  ARCHIVE_AFTER_DAYS: 30,
  FORMAT: 'json' // 'json' or 'yaml'
};

// ============================================================================
// State Structure Definitions
// ============================================================================

const DEFAULT_STATE = {
  metadata: {
    session_id: null,
    created_at: null,
    updated_at: null,
    version: '1.0',
    autosave_interval: CONFIG.AUTOSAVE_INTERVAL_MS / 1000
  },
  context: {
    workflow_type: null,
    current_phase: 'discovery',
    completed_phases: [],
    user_intent: null,
    session_duration_minutes: 0
  },
  phases: {
    discovery: { status: 'pending', data: {} },
    planning: { status: 'pending', data: {} },
    execution: { status: 'pending', data: {} },
    review: { status: 'pending', data: {} },
    delivery: { status: 'pending', data: {} }
  },
  memory: {
    key_decisions: [],
    user_preferences: {},
    technical_constraints: [],
    learned_patterns: [],
    phase_summaries: {}
  },
  templates: {
    loaded: [],
    relevant_sections: [],
    last_loaded: null
  },
  metrics: {
    total_tokens_used: 0,
    phases_completed: 0,
    context_pruning_events: 0,
    errors_encountered: 0
  }
};

// ============================================================================
// StateManager Class
// ============================================================================

class StateManager {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.currentState = null;
    this.sessionId = null;
    this.autosaveTimer = null;
    this.checkpointHistory = [];
    
    this._ensureDirectories();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Initialize a new session
   */
  initSession(userIntent, workflowType = null) {
    this.sessionId = this._generateSessionId();
    const now = new Date().toISOString();
    
    this.currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.currentState.metadata.session_id = this.sessionId;
    this.currentState.metadata.created_at = now;
    this.currentState.metadata.updated_at = now;
    this.currentState.context.user_intent = userIntent;
    this.currentState.context.workflow_type = workflowType || this._detectWorkflow(userIntent);
    
    this._persistState();
    this._startAutosave();
    
    console.log(`[StateManager] Session initialized: ${this.sessionId}`);
    return this.sessionId;
  }

  /**
   * Load existing session
   */
  loadSession(sessionId) {
    const statePath = path.join(this.config.STATE_DIR, 'active', `session_${sessionId}.json`);
    
    if (!fs.existsSync(statePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    this.currentState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    this.sessionId = sessionId;
    this._startAutosave();
    
    console.log(`[StateManager] Session loaded: ${sessionId}`);
    return this.currentState;
  }

  /**
   * Check for recoverable sessions
   */
  getRecoveryOptions() {
    const activeDir = path.join(this.config.STATE_DIR, 'active');
    
    if (!fs.existsSync(activeDir)) {
      return [];
    }
    
    const files = fs.readdirSync(activeDir)
      .filter(f => f.startsWith('session_') && f.endsWith('.json'));
    
    return files.map(file => {
      const state = JSON.parse(fs.readFileSync(path.join(activeDir, file), 'utf8'));
      return {
        session_id: state.metadata.session_id,
        created_at: state.metadata.created_at,
        updated_at: state.metadata.updated_at,
        current_phase: state.context.current_phase,
        user_intent: state.context.user_intent,
        duration_minutes: state.context.session_duration_minutes
      };
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  // -------------------------------------------------------------------------
  // State Updates
  // -------------------------------------------------------------------------

  /**
   * Update current phase
   */
  updatePhase(phase, data) {
    this._ensureSession();
    
    if (!this.currentState.phases[phase]) {
      throw new Error(`Unknown phase: ${phase}`);
    }
    
    this.currentState.phases[phase] = {
      ...this.currentState.phases[phase],
      ...data,
      updated_at: new Date().toISOString()
    };
    
    if (data.status === 'completed') {
      this.currentState.phases[phase].completed_at = new Date().toISOString();
      this.currentState.context.completed_phases.push(phase);
      this.currentState.metrics.phases_completed++;
      
      // Create checkpoint
      this.createCheckpoint(`phase_${phase}_completed`);
    }
    
    this._updateTimestamp();
    this._persistState();
  }

  /**
   * Transition to next phase
   */
  transitionPhase(fromPhase, toPhase) {
    this._ensureSession();
    
    // Mark current phase complete
    this.updatePhase(fromPhase, { status: 'completed' });
    
    // Create summary before moving on
    this._summarizePhase(fromPhase);
    
    // Update context
    this.currentState.context.current_phase = toPhase;
    this.currentState.phases[toPhase].status = 'active';
    this.currentState.phases[toPhase].started_at = new Date().toISOString();
    
    this._updateTimestamp();
    this._persistState();
    
    console.log(`[StateManager] Phase transition: ${fromPhase} → ${toPhase}`);
  }

  /**
   * Update context
   */
  updateContext(updates) {
    this._ensureSession();
    
    this.currentState.context = {
      ...this.currentState.context,
      ...updates
    };
    
    this._updateTimestamp();
    this._persistState();
  }

  /**
   * Add to memory
   */
  addToMemory(category, item) {
    this._ensureSession();
    
    if (this.currentState.memory[category]) {
      if (Array.isArray(this.currentState.memory[category])) {
        this.currentState.memory[category].push({
          ...item,
          timestamp: new Date().toISOString()
        });
      } else {
        this.currentState.memory[category] = {
          ...this.currentState.memory[category],
          ...item
        };
      }
    }
    
    this._updateTimestamp();
    this._persistState();
  }

  /**
   * Track loaded templates
   */
  trackTemplates(loadedTemplates, relevantSections) {
    this._ensureSession();
    
    this.currentState.templates.loaded = loadedTemplates;
    this.currentState.templates.relevant_sections = relevantSections;
    this.currentState.templates.last_loaded = new Date().toISOString();
    
    this._updateTimestamp();
    this._persistState();
  }

  /**
   * Update metrics
   */
  updateMetrics(metrics) {
    this._ensureSession();
    
    this.currentState.metrics = {
      ...this.currentState.metrics,
      ...metrics
    };
    
    this._updateTimestamp();
    this._persistState();
  }

  // -------------------------------------------------------------------------
  // Checkpoints
  // -------------------------------------------------------------------------

  /**
   * Create a checkpoint
   */
  createCheckpoint(reason) {
    this._ensureSession();
    
    const checkpoint = {
      session_id: this.sessionId,
      timestamp: new Date().toISOString(),
      reason: reason,
      state: JSON.parse(JSON.stringify(this.currentState))
    };
    
    const checkpointId = `checkpoint_${this.sessionId}_${Date.now()}`;
    const checkpointPath = path.join(
      this.config.STATE_DIR, 
      'recovery', 
      `${checkpointId}.json`
    );
    
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
    
    this.checkpointHistory.push({
      id: checkpointId,
      timestamp: checkpoint.timestamp,
      reason: reason
    });
    
    // Prune old checkpoints
    if (this.checkpointHistory.length > this.config.MAX_CHECKPOINTS) {
      const old = this.checkpointHistory.shift();
      const oldPath = path.join(
        this.config.STATE_DIR,
        'recovery',
        `${old.id}.json`
      );
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    console.log(`[StateManager] Checkpoint created: ${reason}`);
    return checkpointId;
  }

  /**
   * Restore from checkpoint
   */
  restoreCheckpoint(checkpointId) {
    const checkpointPath = path.join(
      this.config.STATE_DIR,
      'recovery',
      `${checkpointId}.json`
    );
    
    if (!fs.existsSync(checkpointPath)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    this.currentState = checkpoint.state;
    this.sessionId = checkpoint.session_id;
    
    this._updateTimestamp();
    this._persistState();
    
    console.log(`[StateManager] Restored from checkpoint: ${checkpointId}`);
    return this.currentState;
  }

  // -------------------------------------------------------------------------
  // Context Pruning
  // -------------------------------------------------------------------------

  /**
   * Get pruned context for AI consumption
   */
  getPrunedContext() {
    this._ensureSession();
    
    const pruned = {
      session_id: this.sessionId,
      current_phase: this.currentState.context.current_phase,
      user_intent: this.currentState.context.user_intent,
      workflow_type: this.currentState.context.workflow_type,
      current_phase_data: this.currentState.phases[this.currentState.context.current_phase],
      phase_summaries: {},
      key_decisions: this.currentState.memory.key_decisions.slice(-5),
      user_preferences: this.currentState.memory.user_preferences
    };
    
    // Include summaries of completed phases
    this.currentState.context.completed_phases.forEach(phase => {
      pruned.phase_summaries[phase] = this.currentState.memory.phase_summaries[phase] || 
        this._generateSummary(phase);
    });
    
    return pruned;
  }

  /**
   * Check if pruning is needed
   */
  shouldPrune(estimatedTokens) {
    return estimatedTokens > this.config.PRUNE_THRESHOLD_TOKENS;
  }

  // -------------------------------------------------------------------------
  // Session Management
  // -------------------------------------------------------------------------

  /**
   * Close session
   */
  closeSession(finalStatus = 'completed') {
    this._ensureSession();
    
    this._stopAutosave();
    
    // Final checkpoint
    this.createCheckpoint('session_closed');
    
    // Archive session
    this._archiveSession(finalStatus);
    
    console.log(`[StateManager] Session closed: ${this.sessionId}`);
    
    const summary = this._generateSessionSummary();
    this.currentState = null;
    this.sessionId = null;
    
    return summary;
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    this._ensureSession();
    return this._generateSessionSummary();
  }

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------

  /**
   * Clean up old sessions
   */
  cleanup(maxAgeDays = CONFIG.ARCHIVE_AFTER_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    
    const activeDir = path.join(this.config.STATE_DIR, 'active');
    
    if (!fs.existsSync(activeDir)) return;
    
    const files = fs.readdirSync(activeDir);
    let cleaned = 0;
    
    files.forEach(file => {
      const filePath = path.join(activeDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime < cutoff) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    });
    
    console.log(`[StateManager] Cleaned up ${cleaned} old sessions`);
    return cleaned;
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  _ensureSession() {
    if (!this.currentState || !this.sessionId) {
      throw new Error('No active session. Call initSession() or loadSession() first.');
    }
  }

  _ensureDirectories() {
    const dirs = [
      path.join(this.config.STATE_DIR, 'active'),
      path.join(this.config.STATE_DIR, 'archived'),
      path.join(this.config.STATE_DIR, 'recovery'),
      path.join(this.config.STATE_DIR, 'artifacts')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  _generateSessionId() {
    return crypto.randomUUID();
  }

  _detectWorkflow(intent) {
    const intent_lower = intent.toLowerCase();
    
    if (intent_lower.match(/\b(build|develop|code|program|app|software|api)\b/)) {
      return 'software-dev';
    }
    if (intent_lower.match(/\b(write|blog|article|content|copy|marketing)\b/)) {
      return 'content-creation';
    }
    if (intent_lower.match(/\b(research|analyze|study|investigate|report)\b/)) {
      return 'research-analysis';
    }
    if (intent_lower.match(/\b(strategy|business|plan|market|growth)\b/)) {
      return 'business-strategy';
    }
    
    return 'software-dev';
  }

  _updateTimestamp() {
    if (this.currentState) {
      this.currentState.metadata.updated_at = new Date().toISOString();
      
      const created = new Date(this.currentState.metadata.created_at);
      const now = new Date();
      this.currentState.context.session_duration_minutes = 
        Math.floor((now - created) / 60000);
    }
  }

  _persistState() {
    if (!this.currentState) return;
    
    const statePath = path.join(
      this.config.STATE_DIR,
      'active',
      `session_${this.sessionId}.json`
    );
    
    fs.writeFileSync(statePath, JSON.stringify(this.currentState, null, 2));
  }

  _startAutosave() {
    this._stopAutosave();
    this.autosaveTimer = setInterval(() => {
      this._persistState();
      console.log(`[StateManager] Autosaved: ${this.sessionId}`);
    }, this.config.AUTOSAVE_INTERVAL_MS);
  }

  _stopAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  _summarizePhase(phase) {
    const phaseData = this.currentState.phases[phase];
    
    // In real implementation, this would use AI to summarize
    // For now, use a placeholder
    const summary = {
      phase: phase,
      status: phaseData.status,
      completed_at: phaseData.completed_at,
      summary: `Phase ${phase} completed with key outcomes documented.`,
      artifacts: phaseData.artifacts || [],
      key_decisions: phaseData.key_decisions || []
    };
    
    this.currentState.memory.phase_summaries[phase] = summary;
    return summary;
  }

  _generateSummary(phase) {
    return this.currentState.memory.phase_summaries[phase] || {
      phase: phase,
      summary: 'Phase completed. Details available in archived state.'
    };
  }

  _archiveSession(finalStatus) {
    const archiveDir = path.join(
      this.config.STATE_DIR,
      'archived',
      new Date().toISOString().slice(0, 7) // YYYY-MM
    );
    
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    
    const archiveData = {
      ...this.currentState,
      metadata: {
        ...this.currentState.metadata,
        archived_at: new Date().toISOString(),
        final_status: finalStatus
      }
    };
    
    const archivePath = path.join(
      archiveDir,
      `session_${this.sessionId}.json`
    );
    
    fs.writeFileSync(archivePath, JSON.stringify(archiveData, null, 2));
    
    // Remove from active
    const activePath = path.join(
      this.config.STATE_DIR,
      'active',
      `session_${this.sessionId}.json`
    );
    
    if (fs.existsSync(activePath)) {
      fs.unlinkSync(activePath);
    }
  }

  _generateSessionSummary() {
    return {
      session_id: this.sessionId,
      duration_minutes: this.currentState.context.session_duration_minutes,
      phases_completed: this.currentState.context.completed_phases,
      current_phase: this.currentState.context.current_phase,
      metrics: this.currentState.metrics,
      key_decisions_count: this.currentState.memory.key_decisions.length
    };
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  StateManager,
  DEFAULT_STATE,
  CONFIG
};

// ============================================================================
// CLI Usage (if run directly)
// ============================================================================

if (require.main === module) {
  const manager = new StateManager();
  
  // Example usage
  console.log('State Persistence Layer v1.0');
  console.log('============================');
  
  // Check for recovery options
  const recovery = manager.getRecoveryOptions();
  if (recovery.length > 0) {
    console.log(`\nFound ${recovery.length} recoverable session(s):`);
    recovery.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt.user_intent} (${opt.current_phase}) - ${opt.duration_minutes}min`);
    });
  } else {
    console.log('\nNo recoverable sessions found.');
  }
  
  console.log('\nUsage:');
  console.log('  const { StateManager } = require("./state-persistence");');
  console.log('  const manager = new StateManager();');
  console.log('  const sessionId = manager.initSession("Build REST API");');
}
