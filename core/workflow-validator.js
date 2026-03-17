/**
 * Workflow Validator
 * 
 * Validates workflow YAML files, templates, and system integrity
 * Ensures consistency across the Agents Hub system
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  WORKFLOW_DIR: '../workflows',
  PHASE_DIR: '../phases',
  TEMPLATE_DIR: '../templates',
  CORE_DIR: '.',
  STRICT_MODE: false
};

// ============================================================================
// Validation Rules
// ============================================================================

const VALIDATION_RULES = {
  workflow: {
    required_fields: ['name', 'phases', 'version'],
    phase_order: ['discovery', 'planning', 'execution', 'review', 'delivery'],
    supported_types: ['software-dev', 'content-creation', 'research-analysis', 'business-strategy']
  },
  template: {
    required_sections: ['persona'],
    recommended_sections: ['capabilities', 'standards', 'tools', 'boundaries'],
    max_size_kb: 50
  },
  phase: {
    required_sections: ['objective', 'activities'],
    max_duration_estimate: 480 // 8 hours in minutes
  }
};

// ============================================================================
// WorkflowValidator Class
// ============================================================================

class WorkflowValidator {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.errors = [];
    this.warnings = [];
    this.stats = {
      workflows_checked: 0,
      templates_checked: 0,
      phases_checked: 0,
      errors_found: 0,
      warnings_found: 0
    };
  }

  // -------------------------------------------------------------------------
  // Main Validation
  // -------------------------------------------------------------------------

  /**
   * Run full system validation
   */
  validateAll() {
    console.log('🔍 Running full system validation...\n');
    
    this.errors = [];
    this.warnings = [];
    
    // Validate workflows
    this.validateWorkflows();
    
    // Validate templates
    this.validateTemplates();
    
    // Validate phases
    this.validatePhases();
    
    // Validate core files
    this.validateCoreFiles();
    
    // Cross-reference validation
    this.validateCrossReferences();
    
    return this.generateReport();
  }

  /**
   * Validate all workflow files
   */
  validateWorkflows() {
    const workflowDir = path.resolve(__dirname, this.config.WORKFLOW_DIR);
    
    if (!fs.existsSync(workflowDir)) {
      this.errors.push({
        type: 'WORKFLOW_DIR_MISSING',
        message: `Workflow directory not found: ${workflowDir}`,
        severity: 'error'
      });
      return;
    }
    
    const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    
    files.forEach(file => {
      this.stats.workflows_checked++;
      const filePath = path.join(workflowDir, file);
      this._validateWorkflowFile(filePath, file);
    });
  }

  /**
   * Validate all template files
   */
  validateTemplates() {
    const templateDir = path.resolve(__dirname, this.config.TEMPLATE_DIR);
    
    if (!fs.existsSync(templateDir)) {
      this.warnings.push({
        type: 'TEMPLATE_DIR_MISSING',
        message: `Template directory not found: ${templateDir}`,
        severity: 'warning'
      });
      return;
    }
    
    const files = fs.readdirSync(templateDir).filter(f => f.startsWith('AGENTS-') && f.endsWith('.md'));
    
    files.forEach(file => {
      this.stats.templates_checked++;
      const filePath = path.join(templateDir, file);
      this._validateTemplateFile(filePath, file);
    });
  }

  /**
   * Validate all phase files
   */
  validatePhases() {
    const phaseDir = path.resolve(__dirname, this.config.PHASE_DIR);
    
    if (!fs.existsSync(phaseDir)) {
      this.errors.push({
        type: 'PHASE_DIR_MISSING',
        message: `Phase directory not found: ${phaseDir}`,
        severity: 'error'
      });
      return;
    }
    
    const files = fs.readdirSync(phaseDir).filter(f => f.endsWith('.md'));
    
    files.forEach(file => {
      this.stats.phases_checked++;
      const filePath = path.join(phaseDir, file);
      this._validatePhaseFile(filePath, file);
    });
  }

  /**
   * Validate core system files
   */
  validateCoreFiles() {
    const coreDir = path.resolve(__dirname, this.config.CORE_DIR);
    
    // Check for required core files
    const requiredFiles = ['orchestrator.md', 'context-manager.md', 'error-handler.md'];
    
    requiredFiles.forEach(file => {
      const filePath = path.join(coreDir, file);
      if (!fs.existsSync(filePath)) {
        this.warnings.push({
          type: 'CORE_FILE_MISSING',
          file: file,
          message: `Core file missing: ${file}`,
          severity: 'warning'
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // File Validators
  // -------------------------------------------------------------------------

  _validateWorkflowFile(filePath, filename) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if valid YAML
    let workflow;
    try {
      workflow = this._parseYAML(content);
    } catch (e) {
      this.errors.push({
        type: 'YAML_PARSE_ERROR',
        file: filename,
        message: `Invalid YAML: ${e.message}`,
        severity: 'error'
      });
      return;
    }
    
    // Check required fields
    VALIDATION_RULES.workflow.required_fields.forEach(field => {
      if (!this._getNestedValue(workflow, field)) {
        this.errors.push({
          type: 'MISSING_REQUIRED_FIELD',
          file: filename,
          field: field,
          message: `Missing required field: ${field}`,
          severity: 'error'
        });
      }
    });
    
    // Validate phases array
    if (workflow.phases) {
      const phaseNames = Object.keys(workflow.phases);
      const expectedOrder = VALIDATION_RULES.workflow.phase_order;
      
      // Check phase order
      phaseNames.forEach((phase, index) => {
        const expectedIndex = expectedOrder.indexOf(phase);
        if (expectedIndex !== -1 && expectedIndex !== index) {
          this.warnings.push({
            type: 'PHASE_ORDER_MISMATCH',
            file: filename,
            phase: phase,
            message: `Phase '${phase}' is at position ${index} but expected at ${expectedIndex}`,
            severity: 'warning'
          });
        }
      });
    }
    
    // Check for template references
    if (workflow.templates) {
      workflow.templates.forEach(template => {
        const templateFile = `AGENTS-${template}.md`;
        const templatePath = path.resolve(__dirname, this.config.TEMPLATE_DIR, templateFile);
        
        if (!fs.existsSync(templatePath)) {
          this.errors.push({
            type: 'TEMPLATE_REFERENCE_MISSING',
            file: filename,
            template: template,
            message: `Referenced template not found: ${template}`,
            severity: 'error'
          });
        }
      });
    }
  }

  _validateTemplateFile(filePath, filename) {
    const content = fs.readFileSync(filePath, 'utf8');
    const sizeKb = Buffer.byteLength(content, 'utf8') / 1024;
    
    // Check size
    if (sizeKb > VALIDATION_RULES.template.max_size_kb) {
      this.warnings.push({
        type: 'TEMPLATE_TOO_LARGE',
        file: filename,
        size: `${sizeKb.toFixed(1)} KB`,
        message: `Template size (${sizeKb.toFixed(1)} KB) exceeds recommended maximum (${VALIDATION_RULES.template.max_size_kb} KB)`,
        severity: 'warning'
      });
    }
    
    // Check for YAML frontmatter
    if (!content.match(/^---\s*\n/)) {
      this.warnings.push({
        type: 'MISSING_FRONTMATTER',
        file: filename,
        message: 'Template missing YAML frontmatter',
        severity: 'warning'
      });
    }
    
    // Check required sections
    VALIDATION_RULES.template.required_sections.forEach(section => {
      const sectionPattern = new RegExp(`^##?\\s+${section}`, 'im');
      if (!sectionPattern.test(content)) {
        this.errors.push({
          type: 'MISSING_REQUIRED_SECTION',
          file: filename,
          section: section,
          message: `Missing required section: ${section}`,
          severity: 'error'
        });
      }
    });
    
    // Check for broken internal links
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      const link = match[2];
      if (link.startsWith('./') || link.startsWith('../')) {
        const linkPath = path.resolve(path.dirname(filePath), link);
        if (!fs.existsSync(linkPath)) {
          this.warnings.push({
            type: 'BROKEN_LINK',
            file: filename,
            link: link,
            message: `Broken internal link: ${link}`,
            severity: 'warning'
          });
        }
      }
    }
  }

  _validatePhaseFile(filePath, filename) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check required sections
    VALIDATION_RULES.phase.required_sections.forEach(section => {
      const sectionPattern = new RegExp(`^##?\\s+${section}`, 'im');
      if (!sectionPattern.test(content)) {
        this.warnings.push({
          type: 'MISSING_RECOMMENDED_SECTION',
          file: filename,
          section: section,
          message: `Missing recommended section: ${section}`,
          severity: 'warning'
        });
      }
    });
    
    // Check for phase-specific keywords
    const phaseName = filename.replace('.md', '');
    const expectedKeywords = this._getPhaseKeywords(phaseName);
    
    if (expectedKeywords.length > 0) {
      const contentLower = content.toLowerCase();
      const missingKeywords = expectedKeywords.filter(kw => !contentLower.includes(kw));
      
      if (missingKeywords.length > 0) {
        this.warnings.push({
          type: 'MISSING_PHASE_KEYWORDS',
          file: filename,
          keywords: missingKeywords,
          message: `Missing expected keywords for ${phaseName}: ${missingKeywords.join(', ')}`,
          severity: 'warning'
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cross-Reference Validation
  // -------------------------------------------------------------------------

  validateCrossReferences() {
    // Check that all workflow types have corresponding templates
    const workflowDir = path.resolve(__dirname, this.config.WORKFLOW_DIR);
    const templateDir = path.resolve(__dirname, this.config.TEMPLATE_DIR);
    
    if (!fs.existsSync(workflowDir) || !fs.existsSync(templateDir)) {
      return;
    }
    
    const workflows = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    
    workflows.forEach(workflowFile => {
      const content = fs.readFileSync(path.join(workflowDir, workflowFile), 'utf8');
      const workflow = this._parseYAML(content);
      
      if (workflow.templates) {
        workflow.templates.forEach(template => {
          const templateFile = path.join(templateDir, `AGENTS-${template}.md`);
          if (!fs.existsSync(templateFile)) {
            this.errors.push({
              type: 'WORKFLOW_TEMPLATE_MISMATCH',
              workflow: workflowFile,
              template: template,
              message: `Workflow ${workflowFile} references missing template: ${template}`,
              severity: 'error'
            });
          }
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

  generateReport() {
    this.stats.errors_found = this.errors.length;
    this.stats.warnings_found = this.warnings.length;
    
    const report = {
      summary: {
        status: this.errors.length === 0 ? 'PASS' : 'FAIL',
        errors: this.errors.length,
        warnings: this.warnings.length,
        workflows_checked: this.stats.workflows_checked,
        templates_checked: this.stats.templates_checked,
        phases_checked: this.stats.phases_checked
      },
      errors: this.errors,
      warnings: this.warnings,
      stats: this.stats
    };
    
    return report;
  }

  printReport(report = null) {
    if (!report) {
      report = this.generateReport();
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Summary:`);
    console.log(`  Status: ${report.summary.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Workflows checked: ${report.summary.workflows_checked}`);
    console.log(`  Templates checked: ${report.summary.templates_checked}`);
    console.log(`  Phases checked: ${report.summary.phases_checked}`);
    console.log(`  Errors: ${report.summary.errors}`);
    console.log(`  Warnings: ${report.summary.warnings}`);
    
    if (report.errors.length > 0) {
      console.log(`\n❌ Errors (${report.errors.length}):`);
      report.errors.forEach((err, i) => {
        console.log(`\n  ${i + 1}. [${err.type}] ${err.file || ''}`);
        console.log(`     ${err.message}`);
      });
    }
    
    if (report.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${report.warnings.length}):`);
      report.warnings.forEach((warn, i) => {
        console.log(`\n  ${i + 1}. [${warn.type}] ${warn.file || ''}`);
        console.log(`     ${warn.message}`);
      });
    }
    
    if (report.errors.length === 0 && report.warnings.length === 0) {
      console.log('\n✅ All checks passed!');
    }
    
    console.log('\n' + '='.repeat(60));
    
    return report.summary.status === 'PASS';
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  _parseYAML(content) {
    // Simple YAML parser
    const result = {};
    const lines = content.split('\n');
    let currentKey = null;
    let currentArray = null;
    let indentLevel = 0;
    
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
          currentArray = [];
          result[currentKey] = currentArray;
        } else {
          result[currentKey] = value.replace(/^["']|["']$/g, '');
          currentArray = null;
        }
      }
    }
    
    return result;
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  _getPhaseKeywords(phaseName) {
    const keywords = {
      'discovery': ['objective', 'analyze', 'requirements', 'scope', 'understand'],
      'planning': ['design', 'architecture', 'plan', 'structure', 'organize'],
      'execution': ['implement', 'code', 'build', 'develop', 'create'],
      'review': ['test', 'verify', 'check', 'review', 'validate'],
      'delivery': ['deploy', 'release', 'deliver', 'ship', 'finalize']
    };
    
    return keywords[phaseName] || [];
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  WorkflowValidator,
  VALIDATION_RULES,
  CONFIG
};

// ============================================================================
// CLI Usage
// ============================================================================

if (require.main === module) {
  const validator = new WorkflowValidator();
  
  console.log('Agents Hub - Workflow Validator v1.0\n');
  
  // Parse arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node workflow-validator.js [options]');
    console.log('\nOptions:');
    console.log('  --help, -h     Show this help');
    console.log('  --strict       Enable strict mode (treat warnings as errors)');
    console.log('  --workflows    Validate only workflows');
    console.log('  --templates    Validate only templates');
    console.log('  --phases       Validate only phases');
    console.log('  --json         Output as JSON');
    process.exit(0);
  }
  
  // Run validation
  const report = validator.validateAll();
  
  // Output as JSON if requested
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    validator.printReport(report);
  }
  
  // Exit with error code if validation failed
  process.exit(report.summary.status === 'PASS' ? 0 : 1);
}
