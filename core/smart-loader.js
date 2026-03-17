/**
 * Smart Loading System
 * 
 * Intelligent template loading with relevance scoring
 * Minimizes token usage by loading only what's needed
 */

const { TemplateLoader } = require('./template-loader');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_CONTEXT_TOKENS: 12000,
  TARGET_CONTEXT_TOKENS: 8000,
  TEMPLATE_RELEVANCE_THRESHOLD: 0.3,
  SECTION_RELEVANCE_THRESHOLD: 0.5,
  KEYWORD_MATCH_WEIGHT: 0.6,
  SEMANTIC_MATCH_WEIGHT: 0.4,
  MAX_TEMPLATES_PER_LOAD: 3,
  CACHE_SIZE_LIMIT: 50
};

// ============================================================================
// Keyword Database for Matching
// ============================================================================

const KEYWORD_DATABASE = {
  // Technologies
  'javascript': ['js', 'node', 'nodejs', 'react', 'vue', 'angular', 'frontend'],
  'typescript': ['ts', 'node', 'react', 'angular', 'typed'],
  'python': ['py', 'django', 'flask', 'fastapi', 'data science', 'ml'],
  'react': ['reactjs', 'frontend', 'spa', 'component', 'hooks'],
  'database': ['sql', 'nosql', 'postgres', 'mysql', 'mongodb', 'redis'],
  'api': ['rest', 'graphql', 'endpoint', 'backend', 'microservice'],
  'cloud': ['aws', 'azure', 'gcp', 'serverless', 'lambda', 'docker', 'k8s'],
  'security': ['auth', 'authentication', 'oauth', 'jwt', 'encryption'],
  'testing': ['test', 'jest', 'cypress', 'unit test', 'e2e', 'tdd'],
  
  // Tasks
  'frontend': ['ui', 'ux', 'html', 'css', 'web', 'browser', 'spa'],
  'backend': ['api', 'server', 'database', 'microservice', 'rest'],
  'fullstack': ['frontend', 'backend', 'web', 'mern', 'mean'],
  'mobile': ['ios', 'android', 'react native', 'flutter', 'app'],
  'devops': ['ci/cd', 'pipeline', 'docker', 'kubernetes', 'deploy'],
  
  // Content
  'writing': ['blog', 'article', 'content', 'copy', 'seo'],
  'research': ['analysis', 'study', 'investigate', 'report', 'data'],
  'design': ['ui', 'ux', 'figma', 'mockup', 'prototype', 'wireframe']
};

// ============================================================================
// SmartLoader Class
// ============================================================================

class SmartLoader {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.templateLoader = new TemplateLoader();
    this.contextHistory = [];
    this.loadedTemplates = new Set();
    this.sectionCache = new Map();
  }

  // -------------------------------------------------------------------------
  // Core Smart Loading
  // -------------------------------------------------------------------------

  /**
   * Load optimal context for a task
   */
  loadOptimalContext(taskDescription, currentContext = {}) {
    const startTime = Date.now();
    
    // 1. Analyze task for keywords
    const taskKeywords = this._extractKeywords(taskDescription);
    
    // 2. Find relevant templates
    const relevantTemplates = this._findRelevantTemplates(
      taskDescription,
      taskKeywords
    );
    
    // 3. Load and filter templates
    const loadedContent = this._loadFilteredTemplates(
      relevantTemplates,
      taskKeywords
    );
    
    // 4. Optimize context size
    const optimized = this._optimizeContextSize(loadedContent);
    
    // 5. Track what was loaded
    this._trackLoadedContent(optimized);
    
    const duration = Date.now() - startTime;
    
    return {
      content: optimized,
      metadata: {
        templates_loaded: optimized.map(t => t.template),
        total_sections: optimized.reduce((sum, t) => sum + t.sections.length, 0),
        estimated_tokens: this._estimateTokens(optimized),
        load_time_ms: duration,
        keywords_matched: taskKeywords
      }
    };
  }

  /**
   * Load context for specific phase
   */
  loadPhaseContext(phase, workflowType, taskDescription) {
    const phaseKeywords = this._getPhaseKeywords(phase, workflowType);
    const combinedKeywords = [...new Set([
      ...this._extractKeywords(taskDescription),
      ...phaseKeywords
    ])];
    
    // Load phase-specific context
    const phaseContext = this._loadPhaseSpecificContent(phase);
    
    // Load relevant templates
    const templateContext = this.loadOptimalContext(
      taskDescription + ' ' + phaseKeywords.join(' ')
    );
    
    return {
      phase: phaseContext,
      templates: templateContext.content,
      metadata: {
        phase: phase,
        workflow: workflowType,
        ...templateContext.metadata
      }
    };
  }

  /**
   * Prune existing context to fit size limit
   */
  pruneContext(context, maxTokens = this.config.TARGET_CONTEXT_TOKENS) {
    const currentTokens = this._estimateTokens(context);
    
    if (currentTokens <= maxTokens) {
      return { pruned: context, tokens_saved: 0 };
    }
    
    // Calculate how much to remove
    const targetReduction = currentTokens - maxTokens;
    let tokensSaved = 0;
    
    const pruned = context.map(template => {
      const templateCopy = { ...template };
      
      // Prune sections by relevance (keep high-relevance)
      if (templateCopy.sections) {
        const originalCount = templateCopy.sections.length;
        templateCopy.sections = templateCopy.sections.filter(section => {
          // Always keep critical sections
          if (section.critical) return true;
          
          // Remove low-relevance sections if we need space
          if (tokensSaved < targetReduction && section.relevance < 0.7) {
            tokensSaved += section.estimated_tokens || 500;
            return false;
          }
          
          return true;
        });
        
        templateCopy.pruned_sections = originalCount - templateCopy.sections.length;
      }
      
      // Summarize long content
      if (templateCopy.content && tokensSaved < targetReduction) {
        const contentTokens = this._estimateStringTokens(templateCopy.content);
        if (contentTokens > 1000) {
          const summary = this._summarizeContent(templateCopy.content);
          const summaryTokens = this._estimateStringTokens(summary);
          tokensSaved += contentTokens - summaryTokens;
          templateCopy.original_content = templateCopy.content;
          templateCopy.content = summary;
          templateCopy.was_summarized = true;
        }
      }
      
      return templateCopy;
    });
    
    return {
      pruned,
      tokens_saved: tokensSaved,
      original_tokens: currentTokens,
      final_tokens: currentTokens - tokensSaved
    };
  }

  // -------------------------------------------------------------------------
  // Relevance Calculation
  // -------------------------------------------------------------------------

  /**
   * Calculate relevance score for template
   */
  calculateTemplateRelevance(templateName, taskDescription) {
    const taskKeywords = this._extractKeywords(taskDescription);
    const templateKeywords = this._getTemplateKeywords(templateName);
    
    // Direct keyword match
    const keywordScore = this._calculateKeywordOverlap(
      taskKeywords,
      templateKeywords
    );
    
    // Semantic similarity (simplified)
    const semanticScore = this._calculateSemanticSimilarity(
      taskDescription,
      templateName
    );
    
    // Weighted combination
    return (
      keywordScore * this.config.KEYWORD_MATCH_WEIGHT +
      semanticScore * this.config.SEMANTIC_MATCH_WEIGHT
    );
  }

  /**
   * Calculate section relevance
   */
  calculateSectionRelevance(section, taskDescription) {
    const taskKeywords = this._extractKeywords(taskDescription);
    const sectionText = typeof section === 'string' 
      ? section 
      : JSON.stringify(section);
    const sectionKeywords = this._extractKeywords(sectionText);
    
    return this._calculateKeywordOverlap(taskKeywords, sectionKeywords);
  }

  // -------------------------------------------------------------------------
  // Template Analysis
  // -------------------------------------------------------------------------

  /**
   * Analyze template structure
   */
  analyzeTemplate(templateName) {
    const template = this.templateLoader.loadTemplate(templateName);
    
    const analysis = {
      name: templateName,
      metadata: template.metadata,
      sections: [],
      estimated_tokens: 0,
      keywords: []
    };
    
    for (const [key, value] of Object.entries(template)) {
      if (key === 'metadata') continue;
      
      const section = {
        name: key,
        type: typeof value,
        estimated_tokens: this._estimateStringTokens(
          typeof value === 'string' ? value : JSON.stringify(value)
        )
      };
      
      analysis.sections.push(section);
      analysis.estimated_tokens += section.estimated_tokens;
      
      // Extract keywords
      const content = typeof value === 'string' ? value : JSON.stringify(value);
      analysis.keywords.push(...this._extractKeywords(content));
    }
    
    analysis.keywords = [...new Set(analysis.keywords)];
    
    return analysis;
  }

  /**
   * Compare templates for overlap
   */
  compareTemplates(templateName1, templateName2) {
    const t1 = this.analyzeTemplate(templateName1);
    const t2 = this.analyzeTemplate(templateName2);
    
    // Find common keywords
    const commonKeywords = t1.keywords.filter(k => t2.keywords.includes(k));
    
    // Find common sections
    const sections1 = new Set(t1.sections.map(s => s.name));
    const sections2 = new Set(t2.sections.map(s => s.name));
    const commonSections = [...sections1].filter(s => sections2.has(s));
    
    return {
      template1: templateName1,
      template2: templateName2,
      similarity_score: commonKeywords.length / 
        Math.max(t1.keywords.length, t2.keywords.length),
      common_keywords: commonKeywords,
      common_sections: commonSections,
      recommendation: commonKeywords.length > 10 
        ? 'Consider merging or using shared skills'
        : 'Templates are sufficiently distinct'
    };
  }

  // -------------------------------------------------------------------------
  // Context Management
  // -------------------------------------------------------------------------

  /**
   * Get loading statistics
   */
  getStats() {
    return {
      templates_loaded_count: this.loadedTemplates.size,
      unique_templates: [...this.loadedTemplates],
      context_history_size: this.contextHistory.length,
      cache_entries: this.sectionCache.size,
      cache_hit_rate: this._calculateCacheHitRate(),
      average_load_time: this._calculateAverageLoadTime()
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.sectionCache.clear();
    this.contextHistory = [];
    this.loadedTemplates.clear();
    this.templateLoader.clearCache();
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  _extractKeywords(text) {
    const normalized = text.toLowerCase();
    const words = normalized.match(/\b\w+\b/g) || [];
    
    const keywords = new Set();
    
    // Add direct words
    words.forEach(word => {
      if (word.length > 2) keywords.add(word);
    });
    
    // Add related keywords from database
    words.forEach(word => {
      if (KEYWORD_DATABASE[word]) {
        KEYWORD_DATABASE[word].forEach(kw => keywords.add(kw));
      }
    });
    
    // Detect phrases
    for (const [phrase, related] of Object.entries(KEYWORD_DATABASE)) {
      if (normalized.includes(phrase)) {
        related.forEach(kw => keywords.add(kw));
        keywords.add(phrase);
      }
    }
    
    return [...keywords];
  }

  _getTemplateKeywords(templateName) {
    // Map template names to keywords
    const keywordMap = {
      'web-development': ['web', 'frontend', 'backend', 'html', 'css', 'javascript'],
      'api-development': ['api', 'rest', 'graphql', 'backend', 'endpoint'],
      'mobile-development': ['mobile', 'ios', 'android', 'app'],
      'database': ['database', 'sql', 'data', 'schema', 'query'],
      'content-creation': ['content', 'writing', 'blog', 'article'],
      'research': ['research', 'analysis', 'report', 'data']
    };
    
    return keywordMap[templateName] || templateName.split(/[-_]/);
  }

  _getPhaseKeywords(phase, workflowType) {
    const phaseKeywords = {
      'discovery': ['analyze', 'understand', 'requirements', 'research', 'scope'],
      'planning': ['design', 'architecture', 'plan', 'structure', 'organize'],
      'execution': ['implement', 'code', 'build', 'develop', 'create'],
      'review': ['test', 'verify', 'check', 'review', 'validate'],
      'delivery': ['deploy', 'release', 'deliver', 'ship', 'finalize']
    };
    
    return phaseKeywords[phase] || [];
  }

  _findRelevantTemplates(taskDescription, keywords) {
    const available = this.templateLoader.listAvailableTemplates();
    
    const scored = available.map(name => ({
      name,
      score: this.calculateTemplateRelevance(name, taskDescription)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored
      .filter(t => t.score >= this.config.TEMPLATE_RELEVANCE_THRESHOLD)
      .slice(0, this.config.MAX_TEMPLATES_PER_LOAD);
  }

  _loadFilteredTemplates(relevantTemplates, keywords) {
    return relevantTemplates.map(template => {
      const loaded = this.templateLoader.loadTemplate(template.name);
      
      const filtered = {
        template: template.name,
        relevance: template.score,
        metadata: loaded.metadata,
        sections: []
      };
      
      // Score and filter sections
      for (const [sectionName, content] of Object.entries(loaded)) {
        if (sectionName === 'metadata') continue;
        
        const relevance = this.calculateSectionRelevance(content, keywords.join(' '));
        
        if (relevance >= this.config.SECTION_RELEVANCE_THRESHOLD) {
          filtered.sections.push({
            name: sectionName,
            content: content,
            relevance: relevance,
            estimated_tokens: this._estimateStringTokens(
              typeof content === 'string' ? content : JSON.stringify(content)
            )
          });
        }
      }
      
      // Sort sections by relevance
      filtered.sections.sort((a, b) => b.relevance - a.relevance);
      
      return filtered;
    });
  }

  _loadPhaseSpecificContent(phase) {
    // Load phase instructions
    const phasePath = path.join(__dirname, '../phases', `${phase}.md`);
    
    if (!fs.existsSync(phasePath)) {
      return { phase, instructions: null };
    }
    
    return {
      phase,
      instructions: fs.readFileSync(phasePath, 'utf8'),
      estimated_tokens: this._estimateFileTokens(phasePath)
    };
  }

  _optimizeContextSize(loadedContent) {
    const totalTokens = loadedContent.reduce(
      (sum, t) => sum + t.sections.reduce((s, sec) => s + sec.estimated_tokens, 0),
      0
    );
    
    if (totalTokens <= this.config.TARGET_CONTEXT_TOKENS) {
      return loadedContent;
    }
    
    // Need to prune - remove lowest relevance sections first
    const targetReduction = totalTokens - this.config.TARGET_CONTEXT_TOKENS;
    let reduced = 0;
    
    return loadedContent.map(template => {
      const pruned = { ...template };
      
      pruned.sections = template.sections.filter(section => {
        // Always keep high-relevance sections
        if (section.relevance > 0.8) return true;
        
        // Remove sections until we hit target
        if (reduced < targetReduction) {
          reduced += section.estimated_tokens;
          return false;
        }
        
        return true;
      });
      
      return pruned;
    });
  }

  _trackLoadedContent(optimized) {
    optimized.forEach(t => {
      this.loadedTemplates.add(t.template);
    });
    
    this.contextHistory.push({
      timestamp: Date.now(),
      templates: optimized.map(t => t.template),
      total_sections: optimized.reduce((sum, t) => sum + t.sections.length, 0)
    });
  }

  _calculateKeywordOverlap(keywords1, keywords2) {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    
    const intersection = [...set1].filter(k => set2.has(k));
    const union = new Set([...set1, ...set2]);
    
    return intersection.length / union.size;
  }

  _calculateSemanticSimilarity(text1, text2) {
    // Simplified semantic similarity
    // In production, this would use embeddings
    const words1 = new Set(text1.toLowerCase().split(/\W+/));
    const words2 = new Set(text2.toLowerCase().split(/\W+/));
    
    const common = [...words1].filter(w => words2.has(w));
    return common.length / Math.sqrt(words1.size * words2.size);
  }

  _estimateTokens(content) {
    if (Array.isArray(content)) {
      return content.reduce(
        (sum, t) => sum + this._estimateTokens(t),
        0
      );
    }
    
    if (typeof content === 'string') {
      return this._estimateStringTokens(content);
    }
    
    if (typeof content === 'object') {
      return this._estimateStringTokens(JSON.stringify(content));
    }
    
    return 0;
  }

  _estimateStringTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }

  _estimateFileTokens(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    return this._estimateStringTokens(content);
  }

  _summarizeContent(content) {
    // Simple summarization - take first paragraph and last paragraph
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    
    if (paragraphs.length <= 2) {
      return content;
    }
    
    return `[Summary] ${paragraphs[0]}\n\n... [${paragraphs.length - 2} paragraphs summarized] ...\n\n${paragraphs[paragraphs.length - 1]}`;
  }

  _calculateCacheHitRate() {
    // Simplified - would track actual cache hits
    return this.sectionCache.size > 0 ? 0.75 : 0;
  }

  _calculateAverageLoadTime() {
    if (this.contextHistory.length === 0) return 0;
    
    // Would track actual load times
    return 50; // ms
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  SmartLoader,
  CONFIG,
  KEYWORD_DATABASE
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  const loader = new SmartLoader();
  
  console.log('Smart Loading System v1.0');
  console.log('=========================\n');
  
  // Example: Load optimal context
  console.log('Example: Loading context for "Build REST API with auth"');
  const result = loader.loadOptimalContext('Build REST API with authentication and testing');
  
  console.log('\nLoaded Templates:');
  result.content.forEach(t => {
    console.log(`  - ${t.template} (relevance: ${t.relevance.toFixed(2)})`);
    console.log(`    Sections: ${t.sections.length}`);
    t.sections.forEach(s => {
      console.log(`      - ${s.name} (relevance: ${s.relevance.toFixed(2)})`);
    });
  });
  
  console.log('\nMetadata:');
  console.log(`  Templates: ${result.metadata.templates_loaded.join(', ')}`);
  console.log(`  Total Sections: ${result.metadata.total_sections}`);
  console.log(`  Estimated Tokens: ${result.metadata.estimated_tokens}`);
  console.log(`  Load Time: ${result.metadata.load_time_ms}ms`);
  console.log(`  Keywords: ${result.metadata.keywords_matched.join(', ')}`);
  
  // Example: Pruning
  console.log('\n\nExample: Pruning context');
  const pruned = loader.pruneContext(result.content, 5000);
  console.log(`  Original: ${pruned.original_tokens} tokens`);
  console.log(`  Saved: ${pruned.tokens_saved} tokens`);
  console.log(`  Final: ${pruned.final_tokens} tokens`);
  
  console.log('\nUsage:');
  console.log('  const { SmartLoader } = require("./smart-loader");');
  console.log('  const loader = new SmartLoader();');
  console.log('  const context = loader.loadOptimalContext("Your task here");');
}
