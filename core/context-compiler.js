/**
 * Context Compiler
 * 
 * Kompiliert vor jedem LLM-Aufruf:
 * 1. Basis-Philosophie (AGENTS-AUTONOMOUS.md)
 * 2. Aktuelles Gedächtnis (learning_data/history.json)
 * 3. User-Input
 * 
 * Zu einem einzigen Master-Prompt.
 * 
 * @module context-compiler
 * @version 3.0.0
 */

const fs = require('fs');
const path = require('path');

class ContextCompiler {
  constructor(config = {}) {
    this.config = {
      basePhilosophyPath: config.basePhilosophyPath || './AGENTS-AUTONOMOUS.md',
      learningDataPath: config.learningDataPath || './learning_data/history.json',
      maxHistoryEntries: config.maxHistoryEntries || 50,
      cacheEnabled: config.cacheEnabled !== false
    };
    
    this.cache = {
      philosophy: null,
      philosophyMtime: null,
      learningData: null,
      learningDataMtime: null
    };
  }

  /**
   * Kompiliert den Master-Prompt aus allen Kontextquellen
   * @param {Object} params - Kompilierungs-Parameter
   * @param {string} params.sessionId - Aktuelle Session-ID
   * @param {string} params.userInput - User-Input
   * @param {Object} params.currentState - Aktueller Session-State
   * @returns {string} Der komplette Master-Prompt
   */
  async compile(params) {
    const { sessionId, userInput, currentState } = params;
    
    // Lade alle Kontextkomponenten
    const philosophy = await this.loadBasePhilosophy();
    const learningData = await this.loadLearningData();
    const stateContext = this.formatStateContext(currentState);
    
    // Kompiliere Master-Prompt
    const masterPrompt = this.buildMasterPrompt({
      philosophy,
      learningData,
      stateContext,
      sessionId,
      userInput
    });
    
    return masterPrompt;
  }

  /**
   * Lädt die Basis-Philosophie mit Caching
   */
  async loadBasePhilosophy() {
    const filePath = this.config.basePhilosophyPath;
    
    // Fallback wenn Datei nicht existiert
    if (!fs.existsSync(filePath)) {
      console.log(`[ContextCompiler] Philosophy file not found: ${filePath}`);
      return this.getDefaultPhilosophy();
    }
    
    // Check cache
    const stats = fs.statSync(filePath);
    if (this.config.cacheEnabled && 
        this.cache.philosophy && 
        this.cache.philosophyMtime?.getTime() === stats.mtime.getTime()) {
      return this.cache.philosophy;
    }
    
    // Load and cache
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (this.config.cacheEnabled) {
      this.cache.philosophy = content;
      this.cache.philosophyMtime = stats.mtime;
    }
    
    return content;
  }

  /**
   * Lädt die Learning-Daten mit Caching
   */
  async loadLearningData() {
    const filePath = this.config.learningDataPath;
    
    // Fallback wenn Datei nicht existiert
    if (!fs.existsSync(filePath)) {
      return this.getDefaultLearningData();
    }
    
    // Check cache
    const stats = fs.statSync(filePath);
    if (this.config.cacheEnabled && 
        this.cache.learningData && 
        this.cache.learningDataMtime?.getTime() === stats.mtime.getTime()) {
      return this.cache.learningData;
    }
    
    // Load and parse
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // Limit entries
      const limited = this.limitHistoryEntries(data);
      
      if (this.config.cacheEnabled) {
        this.cache.learningData = limited;
        this.cache.learningDataMtime = stats.mtime;
      }
      
      return limited;
    } catch (e) {
      console.error(`[ContextCompiler] Failed to parse learning data: ${e.message}`);
      return this.getDefaultLearningData();
    }
  }

  /**
   * Limitiert die Anzahl der History-Einträge
   */
  limitHistoryEntries(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const result = { ...data };
    
    // Limit history array if present
    if (Array.isArray(result.history)) {
      result.history = result.history.slice(-this.config.maxHistoryEntries);
    }
    
    // Limit interactions if present
    if (Array.isArray(result.interactions)) {
      result.interactions = result.interactions.slice(-this.config.maxHistoryEntries);
    }
    
    return result;
  }

  /**
   * Formatiert den Session-State als lesbaren Kontext
   */
  formatStateContext(state) {
    if (!state) {
      return 'No active session state.';
    }
    
    const parts = [];
    
    // Session metadata
    parts.push(`Session ID: ${state.metadata?.session_id || 'unknown'}`);
    parts.push(`Current Phase: ${state.context?.current_phase || 'discovery'}`);
    parts.push(`Workflow: ${state.context?.workflow_type || 'unknown'}`);
    parts.push(`Duration: ${state.context?.session_duration_minutes || 0} minutes`);
    parts.push(`Messages: ${state.metrics?.total_messages || 0}`);
    
    // Key decisions
    if (state.memory?.key_decisions?.length > 0) {
      parts.push('\nKey Decisions:');
      state.memory.key_decisions.slice(-5).forEach((dec, i) => {
        const text = typeof dec === 'string' ? dec : dec.description || JSON.stringify(dec);
        parts.push(`  ${i + 1}. ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      });
    }
    
    // Current phase data
    const currentPhase = state.context?.current_phase;
    if (currentPhase && state.phases?.[currentPhase]) {
      const phaseData = state.phases[currentPhase];
      parts.push(`\nCurrent Phase Status: ${phaseData.status}`);
      if (phaseData.data && Object.keys(phaseData.data).length > 0) {
        parts.push('Phase Data:');
        Object.entries(phaseData.data).forEach(([key, value]) => {
          const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
          parts.push(`  ${key}: ${valStr.substring(0, 200)}${valStr.length > 200 ? '...' : ''}`);
        });
      }
    }
    
    return parts.join('\n');
  }

  /**
   * Baut den finalen Master-Prompt
   */
  buildMasterPrompt(components) {
    const { philosophy, learningData, stateContext, sessionId, userInput } = components;
    
    const sections = [];
    
    // Header
    sections.push('╔══════════════════════════════════════════════════════════════════════╗');
    sections.push('║                    AGENTS HUB MASTER PROMPT v3.0                     ║');
    sections.push('╚══════════════════════════════════════════════════════════════════════╝');
    sections.push('');
    
    // Section 1: Base Philosophy
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push('SECTION 1: BASE PHILOSOPHY (AGENTS-AUTONOMOUS.md)');
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push(philosophy);
    sections.push('');
    
    // Section 2: Learning Data
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push('SECTION 2: LEARNING DATA & HISTORY');
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push(JSON.stringify(learningData, null, 2));
    sections.push('');
    
    // Section 3: Current State
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push('SECTION 3: CURRENT SESSION STATE');
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push(stateContext);
    sections.push('');
    
    // Section 4: Output Rules (wichtig für Parsing)
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push('SECTION 4: OUTPUT RULES (CRITICAL - MUST FOLLOW)');
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push(`
You MUST output structured updates using these XML-style tags:

1. To update MEMORY (key decisions, preferences, patterns):
<UPDATE_MEMORY>
{
  "key_decisions": ["decision 1", "decision 2"],
  "user_preferences": {"theme": "dark"},
  "learned_patterns": [{"name": "pattern1", "description": "..."}]
}
</UPDATE_MEMORY>

2. To update STATE (phase, metrics, context):
<UPDATE_STATE>
{
  "current_phase": "planning",
  "phase_data": {"planning": {"status": "active", "data": {...}}}
}
</UPDATE_STATE>

IMPORTANT:
- ALWAYS wrap updates in the specified tags
- Use valid JSON inside the tags
- Updates will be automatically parsed and persisted
- Output updates BEFORE or AFTER your main response
- The cleaned response (without tags) will be shown to the user
`);
    sections.push('');
    
    // Section 5: User Input
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push('SECTION 5: USER INPUT (Process This)');
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push(userInput);
    sections.push('');
    
    // Footer
    sections.push('═══════════════════════════════════════════════════════════════════════');
    sections.push('END OF MASTER PROMPT - Generate your response now');
    sections.push('═══════════════════════════════════════════════════════════════════════');
    
    return sections.join('\n');
  }

  /**
   * Default Philosophy wenn AGENTS-AUTONOMOUS.md nicht existiert
   */
  getDefaultPhilosophy() {
    return `# AGENTS-AUTONOMOUS.md (Default)

You are an autonomous AI agent operating within the Agents Hub system.

## Core Principles

1. **State Awareness**: You have access to the full session state including:
   - Current phase (discovery, planning, execution, review, delivery)
   - Previous decisions and their context
   - User preferences and patterns
   - Metrics and progress

2. **Structured Output**: You MUST use structured output tags for updates:
   - <UPDATE_MEMORY> for decisions, preferences, patterns
   - <UPDATE_STATE> for phase transitions, metrics

3. **Phase Awareness**: Respect the current phase:
   - discovery: Ask questions, understand requirements
   - planning: Create plans, define approaches
   - execution: Implement, code, write, create
   - review: Verify, test, improve
   - delivery: Finalize, document, hand over

4. **Continuous Learning**: Update learning data with new patterns and insights.

5. **Self-Preservation**: Create checkpoints before risky operations.
`;
  }

  /**
   * Default Learning Data wenn history.json nicht existiert
   */
  getDefaultLearningData() {
    return {
      version: '1.0',
      created_at: new Date().toISOString(),
      history: [],
      patterns: [],
      preferences: {}
    };
  }

  /**
   * Invalidiert den Cache (z.B. nach externen Änderungen)
   */
  invalidateCache() {
    this.cache.philosophy = null;
    this.cache.philosophyMtime = null;
    this.cache.learningData = null;
    this.cache.learningDataMtime = null;
  }
}

module.exports = {
  ContextCompiler
};
