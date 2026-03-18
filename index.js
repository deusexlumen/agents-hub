/**
 * Agents Hub - Main Export
 * 
 * Central entry point for the Agents Hub orchestration system.
 * 
 * @example
 * const { AgentsHub } = require('agents-hub');
 * 
 * const hub = new AgentsHub();
 * const sessionId = await hub.startSession('Build a REST API');
 * 
 * // Work through phases
 * await hub.nextPhase();
 * 
 * // Get recommendations
 * const templates = await hub.recommendTemplates('authentication system');
 * 
 * // Decompose large tasks
 * const subTasks = await hub.decomposeTask('Build e-commerce platform', { 
 *   estimatedEffort: 40 
 * });
 */

// ============================================================================
// Core Components
// ============================================================================

const { AgentsHub, CONFIG: OrchestratorConfig } = require('./core/orchestrator');
const { StateManager, CONFIG: StateConfig } = require('./core/state-persistence');
const { SmartLoader, CONFIG: LoaderConfig } = require('./core/smart-loader');
const { TemplateLoader, CONFIG: TemplateConfig } = require('./core/template-loader');
const { AutoTransition, CONFIG: TransitionConfig } = require('./core/auto-transition');
const { TaskDecomposer, CONFIG: DecomposerConfig } = require('./core/task-decomposer');
const { LearningEngine, CONFIG: LearningConfig } = require('./core/learning-engine');

// ============================================================================
// Workflow Validator
// ============================================================================

class WorkflowValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  async validateAll() {
    return {
      workflows: await this.validateWorkflows(),
      templates: await this.validateTemplates(),
      phases: await this.validatePhases(),
      core: await this.validateCore()
    };
  }

  async validateWorkflows() {
    const fs = require('fs');
    const path = require('path');
    
    const workflowsDir = path.join(__dirname, 'workflows');
    const results = { valid: true, errors: [], checked: 0 };

    try {
      const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yaml'));
      results.checked = files.length;

      for (const file of files) {
        const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
        
        // Basic structure checks
        if (!content.includes('workflow:')) {
          results.errors.push(`${file}: Missing 'workflow' root`);
        }
        if (!content.includes('phases:')) {
          results.errors.push(`${file}: Missing 'phases' section`);
        }
      }

      results.valid = results.errors.length === 0;
    } catch (error) {
      results.valid = false;
      results.errors.push(`Failed to validate workflows: ${error.message}`);
    }

    return results;
  }

  async validateTemplates() {
    const fs = require('fs');
    const path = require('path');
    
    const templatesDir = path.join(__dirname, 'templates');
    const results = { valid: true, errors: [], checked: 0 };

    try {
      const files = fs.readdirSync(templatesDir).filter(f => f.startsWith('AGENTS-') && f.endsWith('.md'));
      results.checked = files.length;

      for (const file of files) {
        const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
        
        // Check for frontmatter
        if (!content.startsWith('---')) {
          results.errors.push(`${file}: Missing YAML frontmatter`);
        }
        
        // Check for key sections
        if (!content.includes('persona') && !content.includes('# Persona')) {
          results.warnings.push(`${file}: Missing 'persona' section`);
        }
      }

      results.valid = results.errors.length === 0;
    } catch (error) {
      results.valid = false;
      results.errors.push(`Failed to validate templates: ${error.message}`);
    }

    return results;
  }

  async validatePhases() {
    const fs = require('fs');
    const path = require('path');
    
    const phasesDir = path.join(__dirname, 'phases');
    const results = { valid: true, errors: [], checked: 0 };

    try {
      const files = fs.readdirSync(phasesDir).filter(f => f.endsWith('.md'));
      results.checked = files.length;

      const requiredPhases = ['discovery.md', 'planning.md', 'execution.md', 'review.md', 'delivery.md'];
      
      for (const phase of requiredPhases) {
        if (!files.includes(phase)) {
          results.errors.push(`Missing required phase: ${phase}`);
        }
      }

      results.valid = results.errors.length === 0;
    } catch (error) {
      results.valid = false;
      results.errors.push(`Failed to validate phases: ${error.message}`);
    }

    return results;
  }

  async validateCore() {
    const results = { valid: true, errors: [], checked: 0 };

    const requiredModules = [
      'orchestrator.js',
      'state-persistence.js',
      'smart-loader.js',
      'template-loader.js',
      'auto-transition.js',
      'task-decomposer.js',
      'learning-engine.js'
    ];

    const fs = require('fs');
    const path = require('path');
    const coreDir = path.join(__dirname, 'core');

    try {
      for (const module of requiredModules) {
        results.checked++;
        if (!fs.existsSync(path.join(coreDir, module))) {
          results.errors.push(`Missing core module: ${module}`);
        }
      }

      results.valid = results.errors.length === 0;
    } catch (error) {
      results.valid = false;
      results.errors.push(`Failed to validate core: ${error.message}`);
    }

    return results;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick start helper - creates a new session with sensible defaults
 * @param {string} intent - User intent
 * @param {Object} options - Optional configuration
 * @returns {Promise<AgentsHub>} configured hub instance
 */
async function quickStart(intent, options = {}) {
  const hub = new AgentsHub(options);
  await hub.startSession(intent, options);
  return hub;
}

/**
 * Resume a previous session
 * @param {string} sessionId - Session ID to resume
 * @returns {Promise<AgentsHub>} hub instance with restored state
 */
async function resume(sessionId) {
  const hub = new AgentsHub();
  await hub.resumeSession(sessionId);
  return hub;
}

/**
 * Get system status and health
 * @returns {Object} system status
 */
function getSystemStatus() {
  const fs = require('fs');
  const path = require('path');

  return {
    version: require('./package.json').version,
    components: {
      core: fs.existsSync(path.join(__dirname, 'core')),
      workflows: fs.existsSync(path.join(__dirname, 'workflows')),
      templates: fs.existsSync(path.join(__dirname, 'templates')),
      phases: fs.existsSync(path.join(__dirname, 'phases'))
    },
    ready: true
  };
}

// ============================================================================
// Version Info
// ============================================================================

const VERSION = '2.0.0';

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main Classes
  AgentsHub,
  StateManager,
  SmartLoader,
  TemplateLoader,
  AutoTransition,
  TaskDecomposer,
  LearningEngine,
  WorkflowValidator,

  // Utility Functions
  quickStart,
  resume,
  getSystemStatus,

  // Configuration
  CONFIG: {
    orchestrator: OrchestratorConfig,
    state: StateConfig,
    loader: LoaderConfig,
    template: TemplateConfig,
    transition: TransitionConfig,
    decomposer: DecomposerConfig,
    learning: LearningConfig
  },

  // Version
  VERSION
};

// ============================================================================
// ESM Compatibility (for future use)
// ============================================================================

module.exports.default = AgentsHub;
