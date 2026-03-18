/**
 * Auto-Transition Detection
 * 
 * Automatically detects when a phase should transition to the next
 * based on message patterns, content analysis, and natural conversation pauses
 * 
 * @module auto-transition
 * @version 2.0.0
 */

const { StateManager } = require('./state-persistence');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Check every N messages
  CHECK_INTERVAL: 3,
  
  // Minimum messages before transition can be suggested
  MIN_MESSAGES: 3,
  
  // Maximum messages before forced transition warning
  MAX_MESSAGES: 15,
  
  // Confidence threshold for auto-transition
  CONFIDENCE_THRESHOLD: 0.7,
  
  // Keywords indicating phase completion
  COMPLETION_KEYWORDS: {
    discovery: [
      'verstanden', 'understood', 'klar', 'clear', 'anforderungen',
      'requirements', 'scope', 'umfang', 'ziel', 'goal',
      'fertig', 'done', 'complete', 'abgeschlossen'
    ],
    planning: [
      'plan', 'design', 'architektur', 'architecture', 'struktur',
      'structure', 'konzept', 'concept', 'approach', 'strategie',
      'fertig', 'done', 'complete', 'abgeschlossen', 'ready'
    ],
    execution: [
      'implementiert', 'implemented', 'gebaut', 'built', 'fertiggestellt',
      'completed', 'deployed', 'live', 'funktioniert', 'working',
      'fertig', 'done', 'complete', 'abgeschlossen'
    ],
    review: [
      'getestet', 'tested', 'überprüft', 'reviewed', 'validiert',
      'validated', 'approved', 'genehmigt', 'akzeptiert', 'accepted',
      'fertig', 'done', 'complete', 'abgeschlossen'
    ]
  },
  
  // Keywords indicating questions or continuation
  CONTINUATION_KEYWORDS: [
    'frage', 'question', 'wie', 'how', 'was', 'what', 'warum', 'why',
    'kannst du', 'can you', 'bitte', 'please', 'erklär', 'explain',
    'mehr', 'more', 'weiter', 'continue', 'next'
  ]
};

// ============================================================================
// AutoTransition Class
// ============================================================================

/**
 * Automatic phase transition detection and recommendation
 * Analyzes conversation patterns to suggest optimal transition timing
 */
class AutoTransition {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.stateManager = new StateManager();
    
    // Track analysis history per session
    this.analysisHistory = new Map();
  }

  // -------------------------------------------------------------------------
  // Main Analysis
  // -------------------------------------------------------------------------

  /**
   * Analyze session state and recommend transition
   * @param {string} sessionId - Session identifier
   * @param {Object} context - Current conversation context
   * @returns {Object} Transition recommendation
   */
  async analyze(sessionId, context = {}) {
    try {
      // Load session state
      const state = this.stateManager.loadSession(sessionId);
      const currentPhase = state.context.current_phase;
      const messageCount = context.messages || 0;
      
      // Get or initialize analysis history
      const history = this._getHistory(sessionId);
      
      // Build analysis result
      const analysis = {
        sessionId,
        currentPhase,
        messageCount,
        shouldTransition: false,
        confidence: 0,
        reason: null,
        indicators: [],
        warnings: []
      };
      
      // Check minimum messages
      if (messageCount < this.config.MIN_MESSAGES) {
        analysis.reason = 'Not enough messages for transition analysis';
        return analysis;
      }
      
      // Analyze completion indicators
      const completionScore = this._analyzeCompletionIndicators(
        currentPhase,
        context.lastMessage,
        state.phases[currentPhase]
      );
      
      // Analyze natural pause
      const pauseScore = this._analyzeNaturalPause(
        context.lastMessage,
        history
      );
      
      // Analyze phase-specific criteria
      const phaseScore = this._analyzePhaseCriteria(
        currentPhase,
        state.phases[currentPhase]
      );
      
      // Calculate overall confidence
      analysis.confidence = this._calculateConfidence(
        completionScore,
        pauseScore,
        phaseScore,
        messageCount
      );
      
      // Determine if transition should occur
      analysis.shouldTransition = analysis.confidence >= this.config.CONFIDENCE_THRESHOLD;
      
      // Build reason string
      if (analysis.shouldTransition) {
        analysis.reason = this._buildTransitionReason(
          completionScore,
          pauseScore,
          phaseScore
        );
      }
      
      // Check for warnings
      if (messageCount > this.config.MAX_MESSAGES) {
        analysis.warnings.push({
          type: 'excessive_messages',
          message: `${messageCount} messages in phase, consider transitioning`
        });
      }
      
      // Update history
      this._updateHistory(sessionId, analysis);
      
      return analysis;
      
    } catch (error) {
      console.error('[AutoTransition] Analysis failed:', error);
      return {
        sessionId,
        shouldTransition: false,
        confidence: 0,
        reason: `Analysis error: ${error.message}`,
        error: true
      };
    }
  }

  /**
   * Quick check if transition should be considered
   * @param {string} sessionId - Session identifier
   * @param {number} messageCount - Current message count
   * @returns {boolean} Whether to check for transition
   */
  shouldCheckTransition(sessionId, messageCount) {
    // Check every N messages
    return messageCount % this.config.CHECK_INTERVAL === 0;
  }

  /**
   * Force a transition check regardless of interval
   * @param {string} sessionId - Session identifier
   * @param {Object} context - Conversation context
   * @returns {Object} Transition recommendation
   */
  async forceCheck(sessionId, context = {}) {
    return this.analyze(sessionId, context);
  }

  // -------------------------------------------------------------------------
  // Analysis Methods
  // -------------------------------------------------------------------------

  /**
   * Analyze completion indicators in message
   * @param {string} phase - Current phase
   * @param {Object} lastMessage - Last message data
   * @param {Object} phaseData - Current phase data
   * @returns {Object} Completion analysis
   */
  _analyzeCompletionIndicators(phase, lastMessage, phaseData) {
    const indicators = {
      score: 0,
      matches: [],
      hasExplicitCompletion: false,
      hasArtifacts: false
    };
    
    if (!lastMessage || !lastMessage.content) {
      return indicators;
    }
    
    const content = lastMessage.content.toLowerCase();
    const keywords = this.config.COMPLETION_KEYWORDS[phase] || [];
    
    // Check for completion keywords
    keywords.forEach(keyword => {
      if (content.includes(keyword.toLowerCase())) {
        indicators.matches.push(keyword);
        indicators.score += 0.2;
      }
    });
    
    // Check for explicit completion statements
    const completionPatterns = [
      /fertig|done|complete|abgeschlossen/i,
      /zusammenfassung|summary|recap/i,
      /nächste phase|next phase|weiter/i,
      /bereit für|ready for/i
    ];
    
    completionPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        indicators.hasExplicitCompletion = true;
        indicators.score += 0.3;
      }
    });
    
    // Check for phase artifacts
    if (phaseData.data && phaseData.data.artifacts) {
      indicators.hasArtifacts = phaseData.data.artifacts.length > 0;
      if (indicators.hasArtifacts) {
        indicators.score += 0.2;
      }
    }
    
    // Check for key decisions
    if (phaseData.key_decisions && phaseData.key_decisions.length > 0) {
      indicators.score += 0.15;
    }
    
    // Cap score at 1.0
    indicators.score = Math.min(indicators.score, 1.0);
    
    return indicators;
  }

  /**
   * Analyze natural conversation pause
   * @param {Object} lastMessage - Last message data
   * @param {Array} history - Analysis history
   * @returns {Object} Pause analysis
   */
  _analyzeNaturalPause(lastMessage, history) {
    const analysis = {
      score: 0,
      isQuestion: false,
      requestsContinuation: false,
      timeSinceLastAnalysis: 0
    };
    
    if (!lastMessage || !lastMessage.content) {
      return analysis;
    }
    
    const content = lastMessage.content.toLowerCase();
    
    // Check if last message is a question
    const questionPatterns = [
      /\?$/,
      /^(was|wie|warum|wo|wann|wer|welche|can|how|what|why|where|when|who|which)/i,
      /\?(\s|$)/
    ];
    
    questionPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        analysis.isQuestion = true;
        analysis.score -= 0.2; // Questions suggest continuation
      }
    });
    
    // Check for continuation requests
    const continuationKeywords = this.config.CONTINUATION_KEYWORDS;
    continuationKeywords.forEach(keyword => {
      if (content.includes(keyword.toLowerCase())) {
        analysis.requestsContinuation = true;
        analysis.score -= 0.15;
      }
    });
    
    // Check if message is short (potential signal)
    if (content.length < 50 && !analysis.isQuestion) {
      analysis.score += 0.1;
    }
    
    // Analyze history for pattern
    if (history.length >= 2) {
      const lastTwo = history.slice(-2);
      const bothSuggestTransition = lastTwo.every(h => h.confidence > 0.5);
      
      if (bothSuggestTransition) {
        analysis.score += 0.2;
      }
    }
    
    // Ensure score is within bounds
    analysis.score = Math.max(-0.5, Math.min(0.5, analysis.score));
    
    return analysis;
  }

  /**
   * Analyze phase-specific criteria
   * @param {string} phase - Current phase
   * @param {Object} phaseData - Phase data
   * @returns {Object} Phase criteria analysis
   */
  _analyzePhaseCriteria(phase, phaseData) {
    const criteria = {
      score: 0,
      phase: phase,
      checks: {}
    };
    
    switch (phase) {
      case 'discovery':
        // Check for requirements gathering
        criteria.checks.hasRequirements = !!(
          phaseData.data && phaseData.data.requirements
        );
        criteria.checks.hasScope = !!(
          phaseData.data && phaseData.data.scope
        );
        criteria.checks.hasGoals = !!(
          phaseData.data && phaseData.data.goals
        );
        break;
        
      case 'planning':
        // Check for planning artifacts
        criteria.checks.hasDesign = !!(
          phaseData.data && phaseData.data.design
        );
        criteria.checks.hasArchitecture = !!(
          phaseData.data && phaseData.data.architecture
        );
        criteria.checks.hasTimeline = !!(
          phaseData.data && phaseData.data.timeline
        );
        break;
        
      case 'execution':
        // Check for implementation progress
        criteria.checks.hasImplementation = !!(
          phaseData.data && phaseData.data.implementation
        );
        criteria.checks.hasTests = !!(
          phaseData.data && phaseData.data.tests
        );
        criteria.checks.isComplete = phaseData.status === 'completed';
        break;
        
      case 'review':
        // Check for review completion
        criteria.checks.hasReview = !!(
          phaseData.data && phaseData.data.review
        );
        criteria.checks.hasApproval = !!(
          phaseData.data && phaseData.data.approved
        );
        criteria.checks.allTestsPass = !!(
          phaseData.data && phaseData.data.tests_passing
        );
        break;
    }
    
    // Calculate score based on checks
    const checkValues = Object.values(criteria.checks);
    if (checkValues.length > 0) {
      const passedChecks = checkValues.filter(v => v).length;
      criteria.score = passedChecks / checkValues.length;
    }
    
    return criteria;
  }

  /**
   * Calculate overall confidence score
   * @param {Object} completionScore - Completion analysis
   * @param {Object} pauseScore - Pause analysis
   * @param {Object} phaseScore - Phase criteria analysis
   * @param {number} messageCount - Number of messages
   * @returns {number} Confidence score (0-1)
   */
  _calculateConfidence(completionScore, pauseScore, phaseScore, messageCount) {
    // Weight factors
    const weights = {
      completion: 0.4,
      pause: 0.2,
      phase: 0.3,
      messageCount: 0.1
    };
    
    // Calculate weighted score
    let confidence = (
      completionScore.score * weights.completion +
      (pauseScore.score + 0.5) * weights.pause + // Normalize pause score
      phaseScore.score * weights.phase
    );
    
    // Adjust based on message count (more messages = higher confidence)
    const messageFactor = Math.min(messageCount / 10, 1) * weights.messageCount;
    confidence += messageFactor;
    
    // Ensure within bounds
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Build transition reason string
   * @param {Object} completionScore - Completion analysis
   * @param {Object} pauseScore - Pause analysis
   * @param {Object} phaseScore - Phase criteria analysis
   * @returns {string} Human-readable reason
   */
  _buildTransitionReason(completionScore, pauseScore, phaseScore) {
    const reasons = [];
    
    if (completionScore.hasExplicitCompletion) {
      reasons.push('explicit completion indicated');
    }
    
    if (completionScore.matches.length > 0) {
      reasons.push(`completion keywords detected (${completionScore.matches.length})`);
    }
    
    if (phaseScore.score > 0.7) {
      reasons.push('phase criteria satisfied');
    }
    
    if (pauseScore.score > 0) {
      reasons.push('natural conversation pause');
    }
    
    if (reasons.length === 0) {
      return 'transition criteria met';
    }
    
    return reasons.join(', ');
  }

  // -------------------------------------------------------------------------
  // History Management
  // -------------------------------------------------------------------------

  /**
   * Get analysis history for session
   * @param {string} sessionId - Session identifier
   * @returns {Array} Analysis history
   */
  _getHistory(sessionId) {
    return this.analysisHistory.get(sessionId) || [];
  }

  /**
   * Update analysis history
   * @param {string} sessionId - Session identifier
   * @param {Object} analysis - Analysis result
   */
  _updateHistory(sessionId, analysis) {
    const history = this._getHistory(sessionId);
    history.push({
      timestamp: new Date().toISOString(),
      confidence: analysis.confidence,
      shouldTransition: analysis.shouldTransition,
      phase: analysis.currentPhase
    });
    
    // Keep last 10 analyses
    if (history.length > 10) {
      history.shift();
    }
    
    this.analysisHistory.set(sessionId, history);
  }

  /**
   * Clear history for a session
   * @param {string} sessionId - Session identifier
   */
  clearHistory(sessionId) {
    this.analysisHistory.delete(sessionId);
  }

  /**
   * Get transition statistics
   * @param {string} sessionId - Session identifier
   * @returns {Object} Statistics
   */
  getStatistics(sessionId) {
    const history = this._getHistory(sessionId);
    
    if (history.length === 0) {
      return { analyses: 0, avgConfidence: 0, suggestedTransitions: 0 };
    }
    
    const totalConfidence = history.reduce((sum, h) => sum + h.confidence, 0);
    const suggestedTransitions = history.filter(h => h.shouldTransition).length;
    
    return {
      analyses: history.length,
      avgConfidence: totalConfidence / history.length,
      suggestedTransitions
    };
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  AutoTransition,
  CONFIG
};
