/**
 * Learning Engine
 * 
 * Records successful patterns, learns user preferences,
 * and provides template recommendations based on history
 * 
 * @module learning-engine
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Storage paths
  DATA_DIR: './learning_data',
  PATTERNS_FILE: 'patterns.json',
  PREFERENCES_FILE: 'preferences.json',
  HISTORY_FILE: 'history.json',
  
  // Learning parameters
  MIN_OCCURRENCES: 2,
  SUCCESS_THRESHOLD: 0.7,
  FORGET_AFTER_DAYS: 90,
  
  // Recommendation settings
  MAX_RECOMMENDATIONS: 5,
  CONFIDENCE_DECAY: 0.95,
  
  // Template similarity weights
  WEIGHTS: {
    taskSimilarity: 0.4,
    historicalSuccess: 0.3,
    userPreference: 0.2,
    recency: 0.1
  }
};

// ============================================================================
// LearningEngine Class
// ============================================================================

/**
 * Pattern learning and recommendation engine
 * Learns from successful workflows and provides personalized recommendations
 */
class LearningEngine {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.dataDir = path.resolve(__dirname, '..', this.config.DATA_DIR);
    
    // In-memory cache
    this.patterns = [];
    this.preferences = {};
    this.history = [];
    
    // Ensure data directory exists
    this._ensureDataDir();
    
    // Load existing data
    this._loadData();
  }

  // -------------------------------------------------------------------------
  // Pattern Learning
  // -------------------------------------------------------------------------

  /**
   * Record a successful pattern
   * @param {Object} pattern - Pattern data
   * @returns {Object} Recorded pattern
   */
  recordPattern(pattern) {
    try {
      const record = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: pattern.name || 'Unnamed Pattern',
        description: pattern.description || '',
        category: pattern.category || 'general',
        taskType: pattern.taskType || 'generic',
        template: pattern.template || null,
        workflow: pattern.workflow || null,
        successRate: pattern.successRate || 1.0,
        usageCount: 1,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        context: pattern.context || {},
        keywords: pattern.keywords || [],
        outcomes: pattern.outcomes || []
      };
      
      // Check for similar existing pattern
      const existingIndex = this.patterns.findIndex(p => 
        p.name === record.name && p.template === record.template
      );
      
      if (existingIndex >= 0) {
        // Update existing pattern
        const existing = this.patterns[existingIndex];
        existing.usageCount++;
        existing.successRate = this._calculateUpdatedSuccessRate(
          existing,
          pattern.successRate || 1.0
        );
        existing.lastUsed = new Date().toISOString();
        
        if (pattern.outcomes) {
          existing.outcomes.push(...pattern.outcomes);
        }
        
        this._saveData();
        return existing;
      }
      
      // Add new pattern
      this.patterns.push(record);
      this._saveData();
      
      console.log(`[LearningEngine] Recorded pattern: ${record.name}`);
      return record;
      
    } catch (error) {
      console.error('[LearningEngine] Failed to record pattern:', error);
      throw error;
    }
  }

  /**
   * Get learned patterns
   * @param {Object} options - Query options
   * @returns {Array} Matching patterns
   */
  getPatterns(options = {}) {
    let patterns = [...this.patterns];
    
    // Filter by category
    if (options.category) {
      patterns = patterns.filter(p => p.category === options.category);
    }
    
    // Filter by task type
    if (options.taskType) {
      patterns = patterns.filter(p => p.taskType === options.taskType);
    }
    
    // Filter by template
    if (options.template) {
      patterns = patterns.filter(p => p.template === options.template);
    }
    
    // Filter by minimum usage
    if (options.minUsage) {
      patterns = patterns.filter(p => p.usageCount >= options.minUsage);
    }
    
    // Filter by minimum success rate
    if (options.minSuccessRate) {
      patterns = patterns.filter(p => 
        p.successRate >= options.minSuccessRate
      );
    }
    
    // Sort by relevance
    patterns.sort((a, b) => {
      const scoreA = this._calculatePatternScore(a);
      const scoreB = this._calculatePatternScore(b);
      return scoreB - scoreA;
    });
    
    // Apply limit
    if (options.limit) {
      patterns = patterns.slice(0, options.limit);
    }
    
    return patterns;
  }

  /**
   * Find patterns matching a task
   * @param {string} task - Task description
   * @param {Object} options - Query options
   * @returns {Array} Matching patterns
   */
  findPatternsForTask(task, options = {}) {
    const taskLower = task.toLowerCase();
    const taskKeywords = this._extractKeywords(task);
    
    let matches = this.patterns.map(pattern => {
      // Calculate similarity score
      const keywordMatch = pattern.keywords.filter(kw => 
        taskLower.includes(kw.toLowerCase())
      ).length;
      
      const keywordScore = pattern.keywords.length > 0 
        ? keywordMatch / pattern.keywords.length 
        : 0;
      
      const nameScore = taskLower.includes(pattern.name.toLowerCase()) ? 1 : 0;
      
      const similarity = (keywordScore * 0.7) + (nameScore * 0.3);
      
      return {
        pattern,
        similarity,
        matchedKeywords: pattern.keywords.filter(kw => 
          taskLower.includes(kw.toLowerCase())
        )
      };
    });
    
    // Filter by minimum similarity
    const threshold = options.threshold || 0.3;
    matches = matches.filter(m => m.similarity >= threshold);
    
    // Sort by combined score
    matches.sort((a, b) => {
      const scoreA = a.similarity * this._calculatePatternScore(a.pattern);
      const scoreB = b.similarity * this._calculatePatternScore(b.pattern);
      return scoreB - scoreA;
    });
    
    // Apply limit
    if (options.limit) {
      matches = matches.slice(0, options.limit);
    }
    
    return matches;
  }

  // -------------------------------------------------------------------------
  // User Preferences
  // -------------------------------------------------------------------------

  /**
   * Record user preference
   * @param {string} category - Preference category
   * @param {any} value - Preference value
   * @param {Object} context - Additional context
   */
  recordPreference(category, value, context = {}) {
    try {
      if (!this.preferences[category]) {
        this.preferences[category] = {
          values: [],
          createdAt: new Date().toISOString()
        };
      }
      
      const pref = this.preferences[category];
      
      // Check if value already exists
      const existing = pref.values.find(v => v.value === value);
      
      if (existing) {
        existing.frequency++;
        existing.lastUsed = new Date().toISOString();
        
        if (context.task) {
          existing.tasks = existing.tasks || [];
          existing.tasks.push(context.task);
        }
      } else {
        pref.values.push({
          value,
          frequency: 1,
          firstSeen: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          tasks: context.task ? [context.task] : []
        });
      }
      
      pref.lastUpdated = new Date().toISOString();
      
      this._saveData();
      
      console.log(`[LearningEngine] Recorded preference: ${category} = ${value}`);
      
    } catch (error) {
      console.error('[LearningEngine] Failed to record preference:', error);
      throw error;
    }
  }

  /**
   * Get user preferences for a category
   * @param {string} category - Preference category
   * @returns {Object} Preference data
   */
  getPreferences(category) {
    return this.preferences[category] || null;
  }

  /**
   * Get most preferred value for a category
   * @param {string} category - Preference category
   * @returns {any} Most preferred value
   */
  getPreferredValue(category) {
    const pref = this.preferences[category];
    
    if (!pref || !pref.values.length) {
      return null;
    }
    
    // Sort by frequency and recency
    pref.values.sort((a, b) => {
      const scoreA = a.frequency * 0.7 + 
        (new Date(a.lastUsed).getTime() / Date.now()) * 0.3;
      const scoreB = b.frequency * 0.7 + 
        (new Date(b.lastUsed).getTime() / Date.now()) * 0.3;
      return scoreB - scoreA;
    });
    
    return pref.values[0].value;
  }

  /**
   * Get all preference categories
   * @returns {Array} Category names
   */
  getPreferenceCategories() {
    return Object.keys(this.preferences);
  }

  // -------------------------------------------------------------------------
  // Template Recommendations
  // -------------------------------------------------------------------------

  /**
   * Get template recommendations for a task
   * @param {string} task - Task description
   * @param {Object} options - Recommendation options
   * @returns {Array} Recommended templates
   */
  recommendTemplates(task, options = {}) {
    try {
      const recommendations = [];
      const taskLower = task.toLowerCase();
      const taskKeywords = this._extractKeywords(task);
      
      // 1. Pattern-based recommendations
      const matchingPatterns = this.findPatternsForTask(task, {
        threshold: 0.2,
        limit: 10
      });
      
      matchingPatterns.forEach(match => {
        if (match.pattern.template) {
          recommendations.push({
            template: match.pattern.template,
            confidence: match.similarity * match.pattern.successRate,
            reason: `Based on pattern "${match.pattern.name}" (${match.pattern.usageCount} uses)`,
            source: 'pattern',
            pattern: match.pattern
          });
        }
      });
      
      // 2. Preference-based recommendations
      const preferredWorkflow = this.getPreferredValue('workflow');
      const preferredTemplate = this.getPreferredValue('template');
      
      if (preferredTemplate) {
        recommendations.push({
          template: preferredTemplate,
          confidence: 0.6,
          reason: 'Based on your preferences',
          source: 'preference'
        });
      }
      
      // 3. Keyword-matched default recommendations
      const defaultMatches = this._getDefaultTemplateMatches(task);
      defaultMatches.forEach(match => {
        recommendations.push({
          template: match.template,
          confidence: match.score * 0.5,
          reason: `Matches keywords: ${match.matched.join(', ')}`,
          source: 'keyword'
        });
      });
      
      // 4. History-based recommendations
      const historyRecommendations = this._getHistoryBasedRecommendations(task);
      recommendations.push(...historyRecommendations);
      
      // Merge and deduplicate
      const merged = this._mergeRecommendations(recommendations);
      
      // Sort by confidence
      merged.sort((a, b) => b.confidence - a.confidence);
      
      // Apply limit
      const limit = options.limit || this.config.MAX_RECOMMENDATIONS;
      return merged.slice(0, limit);
      
    } catch (error) {
      console.error('[LearningEngine] Recommendation failed:', error);
      return [];
    }
  }

  /**
   * Record template usage
   * @param {string} template - Template name
   * @param {string} task - Task description
   * @param {boolean} success - Whether usage was successful
   */
  recordTemplateUsage(template, task, success = true) {
    this.history.push({
      timestamp: new Date().toISOString(),
      template,
      task: task.substring(0, 200), // Truncate for storage
      success,
      taskKeywords: this._extractKeywords(task)
    });
    
    // Trim history if too large
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
    
    this._saveData();
    
    // Record as pattern if successful
    if (success) {
      this.recordPattern({
        name: `Template: ${template}`,
        category: 'template_usage',
        template,
        taskType: this._detectTaskType(task),
        keywords: this._extractKeywords(task),
        successRate: 1.0
      });
    }
  }

  // -------------------------------------------------------------------------
  // History Management
  // -------------------------------------------------------------------------

  /**
   * Get usage history
   * @param {Object} options - Query options
   * @returns {Array} History entries
   */
  getHistory(options = {}) {
    let history = [...this.history];
    
    // Filter by template
    if (options.template) {
      history = history.filter(h => h.template === options.template);
    }
    
    // Filter by success
    if (options.success !== undefined) {
      history = history.filter(h => h.success === options.success);
    }
    
    // Filter by time range
    if (options.since) {
      const sinceDate = new Date(options.since);
      history = history.filter(h => new Date(h.timestamp) >= sinceDate);
    }
    
    // Sort by recency
    history.sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Apply limit
    if (options.limit) {
      history = history.slice(0, options.limit);
    }
    
    return history;
  }

  /**
   * Clear old data
   * @param {number} maxAgeDays - Maximum age in days
   */
  cleanup(maxAgeDays = this.config.FORGET_AFTER_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    
    // Clean patterns
    const oldPatternsCount = this.patterns.length;
    this.patterns = this.patterns.filter(p => 
      new Date(p.lastUsed) >= cutoff || p.usageCount >= this.config.MIN_OCCURRENCES
    );
    
    // Clean history
    const oldHistoryCount = this.history.length;
    this.history = this.history.filter(h => new Date(h.timestamp) >= cutoff);
    
    this._saveData();
    
    console.log(`[LearningEngine] Cleanup complete: Removed ${oldPatternsCount - this.patterns.length} patterns, ${oldHistoryCount - this.history.length} history entries`);
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /**
   * Get learning statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const totalUses = this.patterns.reduce((sum, p) => sum + p.usageCount, 0);
    const avgSuccessRate = this.patterns.length > 0 
      ? this.patterns.reduce((sum, p) => sum + p.successRate, 0) / this.patterns.length 
      : 0;
    
    return {
      patternsLearned: this.patterns.length,
      totalPatternUses: totalUses,
      averageSuccessRate: avgSuccessRate,
      preferenceCategories: Object.keys(this.preferences).length,
      totalHistoryEntries: this.history.length,
      oldestEntry: this.history.length > 0 
        ? this.history[0].timestamp 
        : null
    };
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      // Load patterns
      const patternsPath = path.join(this.dataDir, this.config.PATTERNS_FILE);
      if (fs.existsSync(patternsPath)) {
        this.patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
      }
      
      // Load preferences
      const prefsPath = path.join(this.dataDir, this.config.PREFERENCES_FILE);
      if (fs.existsSync(prefsPath)) {
        this.preferences = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      }
      
      // Load history
      const historyPath = path.join(this.dataDir, this.config.HISTORY_FILE);
      if (fs.existsSync(historyPath)) {
        this.history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
      
    } catch (error) {
      console.error('[LearningEngine] Failed to load data:', error);
      // Start with empty data
      this.patterns = [];
      this.preferences = {};
      this.history = [];
    }
  }

  _saveData() {
    try {
      // Save patterns
      const patternsPath = path.join(this.dataDir, this.config.PATTERNS_FILE);
      fs.writeFileSync(patternsPath, JSON.stringify(this.patterns, null, 2));
      
      // Save preferences
      const prefsPath = path.join(this.dataDir, this.config.PREFERENCES_FILE);
      fs.writeFileSync(prefsPath, JSON.stringify(this.preferences, null, 2));
      
      // Save history
      const historyPath = path.join(this.dataDir, this.config.HISTORY_FILE);
      fs.writeFileSync(historyPath, JSON.stringify(this.history, null, 2));
      
    } catch (error) {
      console.error('[LearningEngine] Failed to save data:', error);
    }
  }

  _calculatePatternScore(pattern) {
    const recency = new Date(pattern.lastUsed).getTime() / Date.now();
    const usageScore = Math.min(pattern.usageCount / 10, 1);
    
    return (
      pattern.successRate * 0.4 +
      usageScore * 0.3 +
      recency * 0.3
    );
  }

  _calculateUpdatedSuccessRate(existing, newRate) {
    const total = existing.usageCount + 1;
    return (existing.successRate * existing.usageCount + newRate) / total;
  }

  _extractKeywords(text) {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must',
      'und', 'oder', 'aber', 'mit', 'für', 'die', 'der', 'das',
      'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  _detectTaskType(task) {
    const taskLower = task.toLowerCase();
    
    if (/bug|fix|issue|error|problem|fehler/.test(taskLower)) {
      return 'bugfix';
    }
    if (/test|spec|unittest|testing/.test(taskLower)) {
      return 'testing';
    }
    if (/document|doc|readme/.test(taskLower)) {
      return 'documentation';
    }
    if (/refactor|cleanup|optimize/.test(taskLower)) {
      return 'refactoring';
    }
    if (/research|analyze|investigate/.test(taskLower)) {
      return 'research';
    }
    if (/implement|build|create|develop/.test(taskLower)) {
      return 'development';
    }
    
    return 'generic';
  }

  _getDefaultTemplateMatches(task) {
    const matches = [];
    const taskLower = task.toLowerCase();
    
    // Template keyword mappings
    const templateKeywords = {
      'web-development': ['web', 'frontend', 'html', 'css', 'javascript', 'react', 'vue'],
      'api-development': ['api', 'rest', 'graphql', 'endpoint', 'backend'],
      'database': ['database', 'sql', 'postgres', 'mongodb', 'storage'],
      'mobile-development': ['mobile', 'ios', 'android', 'react native', 'flutter'],
      'content-creation': ['content', 'writing', 'blog', 'article', 'copywriting'],
      'research-analyst': ['research', 'analysis', 'study', 'investigate', 'report'],
      'devops-sre': ['deploy', 'ci/cd', 'infrastructure', 'docker', 'kubernetes'],
      'design-creative': ['design', 'ui', 'ux', 'creative', 'mockup', 'prototype']
    };
    
    Object.entries(templateKeywords).forEach(([template, keywords]) => {
      const matched = keywords.filter(kw => taskLower.includes(kw));
      if (matched.length > 0) {
        matches.push({
          template,
          score: matched.length / keywords.length,
          matched
        });
      }
    });
    
    return matches.sort((a, b) => b.score - a.score);
  }

  _getHistoryBasedRecommendations(task) {
    const taskKeywords = this._extractKeywords(task);
    const recommendations = [];
    
    // Group history by template
    const templateHistory = {};
    this.history.forEach(h => {
      if (!templateHistory[h.template]) {
        templateHistory[h.template] = [];
      }
      templateHistory[h.template].push(h);
    });
    
    // Find templates with similar tasks
    Object.entries(templateHistory).forEach(([template, entries]) => {
      let similarityScore = 0;
      
      entries.forEach(entry => {
        const matches = entry.taskKeywords.filter(tk => 
          taskKeywords.includes(tk)
        ).length;
        
        if (matches > 0) {
          similarityScore += matches / Math.max(taskKeywords.length, entry.taskKeywords.length);
        }
      });
      
      if (similarityScore > 0) {
        const successCount = entries.filter(e => e.success).length;
        const successRate = successCount / entries.length;
        
        recommendations.push({
          template,
          confidence: Math.min(similarityScore * successRate * 0.5, 0.8),
          reason: `Used ${entries.length} times for similar tasks`,
          source: 'history'
        });
      }
    });
    
    return recommendations;
  }

  _mergeRecommendations(recommendations) {
    const merged = new Map();
    
    recommendations.forEach(rec => {
      const existing = merged.get(rec.template);
      
      if (existing) {
        // Combine confidences with diminishing returns
        existing.confidence = Math.min(
          existing.confidence + rec.confidence * 0.5,
          0.95
        );
        existing.reasons = existing.reasons || [existing.reason];
        existing.reasons.push(rec.reason);
        existing.reason = existing.reasons.join('; ');
      } else {
        merged.set(rec.template, { ...rec });
      }
    });
    
    return Array.from(merged.values());
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  LearningEngine,
  CONFIG
};
