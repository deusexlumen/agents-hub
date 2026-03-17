/**
 * Template Loader with Shared Skills
 * 
 * Modular template loading - includes shared skills
 * to eliminate redundancy across templates
 */

const fs = require('fs');
const path = require('path');
// Simple YAML parser for frontmatter
function parseYAML(yamlText) {
  const result = {};
  const lines = yamlText.split('\n');
  let currentKey = null;
  let currentArray = null;
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Array item
    if (trimmed.startsWith('- ')) {
      if (currentArray) {
        currentArray.push(trimmed.substring(2).trim());
      }
      continue;
    }
    
    // Key-value pair
    const match = trimmed.match(/^(\w+):\s*(.*)$/);
    if (match) {
      currentKey = match[1];
      const value = match[2].trim();
      
      if (value === '') {
        // Might be array or object starting
        currentArray = [];
        result[currentKey] = currentArray;
      } else {
        // Remove quotes if present
        result[currentKey] = value.replace(/^["']|["']$/g, '');
        currentArray = null;
      }
    }
  }
  
  return result;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  TEMPLATE_DIR: '../templates',
  SHARED_SKILLS_FILE: './shared-skills.json',
  CACHE_ENABLED: true,
  DEBUG: false
};

// ============================================================================
// TemplateLoader Class
// ============================================================================

class TemplateLoader {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.sharedSkills = this._loadSharedSkills();
    this.cache = new Map();
  }

  // -------------------------------------------------------------------------
  // Core Loading
  // -------------------------------------------------------------------------

  /**
   * Load template with shared skills merged
   */
  loadTemplate(templateName, options = {}) {
    const cacheKey = `${templateName}_${JSON.stringify(options)}`;
    
    if (this.config.CACHE_ENABLED && this.cache.has(cacheKey)) {
      this._log('Cache hit:', templateName);
      return this.cache.get(cacheKey);
    }

    const templatePath = path.join(
      this.config.TEMPLATE_DIR,
      `AGENTS-${templateName}.md`
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const rawContent = fs.readFileSync(templatePath, 'utf8');
    const template = this._parseTemplate(rawContent);
    
    // Merge with shared skills
    const merged = this._mergeWithSharedSkills(template, options);
    
    if (this.config.CACHE_ENABLED) {
      this.cache.set(cacheKey, merged);
    }
    
    this._log('Template loaded:', templateName);
    return merged;
  }

  /**
   * Load multiple templates
   */
  loadTemplates(templateNames, options = {}) {
    return templateNames.map(name => this.loadTemplate(name, options));
  }

  /**
   * Load template sections selectively
   */
  loadTemplateSections(templateName, sections, options = {}) {
    const fullTemplate = this.loadTemplate(templateName, options);
    
    const filtered = {};
    sections.forEach(section => {
      if (fullTemplate[section] !== undefined) {
        filtered[section] = fullTemplate[section];
      }
    });
    
    return filtered;
  }

  // -------------------------------------------------------------------------
  // Smart Loading
  // -------------------------------------------------------------------------

  /**
   * Load templates based on task relevance
   */
  loadRelevantTemplates(taskDescription, maxTemplates = 3) {
    const availableTemplates = this.listAvailableTemplates();
    
    // Score each template for relevance
    const scored = availableTemplates.map(template => ({
      name: template,
      score: this._calculateRelevance(taskDescription, template)
    }));
    
    // Sort by score and take top N
    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.slice(0, maxTemplates).filter(t => t.score > 0.3);
    
    // Load selected templates
    return relevant.map(t => ({
      name: t.name,
      score: t.score,
      content: this.loadTemplate(t.name)
    }));
  }

  /**
   * Load only relevant sections from template
   */
  loadSmartTemplate(templateName, taskDescription) {
    const template = this.loadTemplate(templateName);
    
    // Calculate relevance for each section
    const sectionScores = {};
    for (const [section, content] of Object.entries(template)) {
      if (typeof content === 'string') {
        sectionScores[section] = this._calculateSectionRelevance(
          taskDescription,
          content
        );
      } else if (typeof content === 'object') {
        sectionScores[section] = this._calculateObjectRelevance(
          taskDescription,
          content
        );
      }
    }
    
    // Filter sections with score > 0.5
    const smart = {
      metadata: template.metadata,
      persona: template.persona // Always include
    };
    
    for (const [section, score] of Object.entries(sectionScores)) {
      if (score > 0.5 || section === 'persona') {
        smart[section] = template[section];
      }
    }
    
    return smart;
  }

  // -------------------------------------------------------------------------
  // Template Composition
  // -------------------------------------------------------------------------

  /**
   * Compose multiple templates into one
   */
  composeTemplates(templateNames, compositionStrategy = 'merge') {
    const templates = this.loadTemplates(templateNames);
    
    switch (compositionStrategy) {
      case 'merge':
        return this._mergeTemplates(templates);
      case 'chain':
        return this._chainTemplates(templates);
      case 'priority':
        return this._priorityTemplates(templates);
      default:
        return this._mergeTemplates(templates);
    }
  }

  /**
   * Get template diff (what's unique vs shared)
   */
  getTemplateDiff(templateName) {
    const template = this.loadTemplate(templateName, { includeShared: false });
    const withShared = this.loadTemplate(templateName, { includeShared: true });
    
    const unique = {};
    for (const [key, value] of Object.entries(template)) {
      if (JSON.stringify(value) !== JSON.stringify(withShared[key])) {
        unique[key] = value;
      }
    }
    
    return {
      template: templateName,
      uniqueSections: Object.keys(unique),
      uniqueContent: unique,
      sharedContentSize: JSON.stringify(withShared).length - JSON.stringify(template).length
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  listAvailableTemplates() {
    const templateDir = path.resolve(__dirname, this.config.TEMPLATE_DIR);
    
    if (!fs.existsSync(templateDir)) {
      return [];
    }
    
    return fs.readdirSync(templateDir)
      .filter(f => f.startsWith('AGENTS-') && f.endsWith('.md'))
      .map(f => f.replace('AGENTS-', '').replace('.md', ''));
  }

  getSharedSkills() {
    return this.sharedSkills;
  }

  clearCache() {
    this.cache.clear();
    this._log('Cache cleared');
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  _loadSharedSkills() {
    const skillsPath = path.resolve(__dirname, this.config.SHARED_SKILLS_FILE);
    
    if (!fs.existsSync(skillsPath)) {
      console.warn('Shared skills file not found:', skillsPath);
      return {};
    }
    
    return JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
  }

  _parseTemplate(content) {
    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      return { content: content };
    }
    
    const metadata = parseYAML(frontmatterMatch[1]) || {};
    const body = frontmatterMatch[2];
    
    // Parse sections from body
    const sections = this._parseSections(body);
    
    return {
      metadata,
      ...sections
    };
  }

  _parseSections(body) {
    const sections = {};
    const sectionRegex = /^##?\s+(.+)\n/gm;
    let match;
    let lastIndex = 0;
    let lastTitle = 'content';
    
    while ((match = sectionRegex.exec(body)) !== null) {
      if (lastIndex < match.index) {
        sections[lastTitle] = body.substring(lastIndex, match.index).trim();
      }
      lastTitle = match[1].toLowerCase().replace(/\s+/g, '_');
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < body.length) {
      sections[lastTitle] = body.substring(lastIndex).trim();
    }
    
    return sections;
  }

  _mergeWithSharedSkills(template, options) {
    if (options.includeShared === false) {
      return template;
    }

    const merged = { ...template };
    const skills = this.sharedSkills;
    
    // Merge standards
    if (skills.standards) {
      merged.standards = {
        ...skills.standards,
        ...(template.standards || {})
      };
    }
    
    // Merge procedures
    if (skills.procedures) {
      merged.procedures = {
        ...skills.procedures,
        ...(template.procedures || {})
      };
    }
    
    // Merge common tools
    if (skills.common_tools) {
      merged.common_tools = {
        ...skills.common_tools,
        ...(template.common_tools || {})
      };
    }
    
    // Merge boundaries (universal always applies)
    if (skills.boundaries) {
      merged.boundaries = {
        ...skills.boundaries,
        ...(template.boundaries || {})
      };
    }
    
    // Merge communication guidelines
    if (skills.communication) {
      merged.communication = {
        ...skills.communication,
        ...(template.communication || {})
      };
    }
    
    return merged;
  }

  _calculateRelevance(taskDescription, templateName) {
    const taskLower = taskDescription.toLowerCase();
    const templateLower = templateName.toLowerCase();
    
    // Direct match
    if (taskLower.includes(templateLower) || templateLower.includes(taskLower)) {
      return 1.0;
    }
    
    // Keyword matching
    const keywords = this._extractKeywords(templateName);
    const matches = keywords.filter(kw => taskLower.includes(kw));
    
    return Math.min(matches.length / keywords.length, 0.9);
  }

  _calculateSectionRelevance(taskDescription, content) {
    const taskWords = new Set(taskDescription.toLowerCase().split(/\W+/));
    const contentWords = new Set(content.toLowerCase().split(/\W+/));
    
    const intersection = [...taskWords].filter(w => contentWords.has(w));
    return intersection.length / Math.max(taskWords.size, contentWords.size);
  }

  _calculateObjectRelevance(taskDescription, obj) {
    const content = JSON.stringify(obj).toLowerCase();
    return this._calculateSectionRelevance(taskDescription, content);
  }

  _extractKeywords(templateName) {
    const keywordMap = {
      'web-development': ['web', 'frontend', 'backend', 'fullstack', 'html', 'css', 'javascript'],
      'api-development': ['api', 'rest', 'graphql', 'endpoint', 'backend'],
      'mobile-development': ['mobile', 'ios', 'android', 'react native', 'flutter'],
      'database': ['database', 'sql', 'nosql', 'postgres', 'mongodb'],
      'content-creation': ['content', 'writing', 'blog', 'article', 'copywriting'],
      'research': ['research', 'analysis', 'study', 'investigate', 'report']
    };
    
    return keywordMap[templateName] || templateName.split(/[-_]/);
  }

  _mergeTemplates(templates) {
    const merged = {
      metadata: {
        name: 'Composite Template',
        source_templates: templates.map(t => t.metadata?.name || 'unknown')
      }
    };
    
    // Merge capabilities
    const allCapabilities = templates.flatMap(t => t.capabilities || []);
    merged.capabilities = [...new Set(allCapabilities)];
    
    // Merge standards
    templates.forEach(t => {
      if (t.standards) {
        merged.standards = { ...merged.standards, ...t.standards };
      }
    });
    
    // Merge tools
    const allTools = templates.flatMap(t => t.tools || []);
    merged.tools = [...new Set(allTools)];
    
    return merged;
  }

  _chainTemplates(templates) {
    return {
      type: 'chain',
      steps: templates.map((t, i) => ({
        step: i + 1,
        template: t.metadata?.name,
        capabilities: t.capabilities || []
      }))
    };
  }

  _priorityTemplates(templates) {
    // Use first template as primary, add unique elements from others
    const [primary, ...others] = templates;
    
    const combined = { ...primary };
    
    others.forEach(t => {
      // Add unique capabilities
      if (t.capabilities) {
        const existing = new Set(combined.capabilities || []);
        t.capabilities.forEach(cap => {
          if (!existing.has(cap)) {
            combined.capabilities = combined.capabilities || [];
            combined.capabilities.push(cap);
          }
        });
      }
    });
    
    return combined;
  }

  _log(...args) {
    if (this.config.DEBUG) {
      console.log('[TemplateLoader]', ...args);
    }
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  TemplateLoader,
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  const loader = new TemplateLoader({ DEBUG: true });
  
  console.log('Template Loader v1.0');
  console.log('====================\n');
  
  // List available templates
  console.log('Available Templates:');
  const templates = loader.listAvailableTemplates();
  templates.forEach(t => console.log(`  - ${t}`));
  
  // Show shared skills structure
  console.log('\nShared Skills Categories:');
  const skills = loader.getSharedSkills();
  console.log('  Standards:', Object.keys(skills.standards || {}).join(', '));
  console.log('  Procedures:', Object.keys(skills.procedures || {}).join(', '));
  console.log('  Tools:', Object.keys(skills.common_tools || {}).join(', '));
  console.log('  Boundaries:', Object.keys(skills.boundaries || {}).join(', '));
  
  // Example: Load relevant templates for a task
  if (templates.length > 0) {
    console.log('\nExample - Relevant templates for "Build REST API":');
    const relevant = loader.loadRelevantTemplates('Build REST API with authentication', 3);
    relevant.forEach(t => {
      console.log(`  - ${t.name} (score: ${t.score.toFixed(2)})`);
    });
  }
  
  console.log('\nUsage:');
  console.log('  const { TemplateLoader } = require("./template-loader");');
  console.log('  const loader = new TemplateLoader();');
  console.log('  const template = loader.loadTemplate("web-development");');
}
