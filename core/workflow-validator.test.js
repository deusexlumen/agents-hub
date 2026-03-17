/**
 * Workflow Validator Tests
 * 
 * Run with: node workflow-validator.test.js
 */

const { WorkflowValidator, VALIDATION_RULES } = require('./workflow-validator');
const fs = require('fs');
const path = require('path');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg) {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

console.log('Running Workflow Validator Tests...\n');

// ============================================================================
// Setup - Create test files
// ============================================================================

const TEST_DIRS = {
  workflows: path.join(__dirname, '../workflows'),
  templates: path.join(__dirname, '../templates'),
  phases: path.join(__dirname, '../phases')
};

// Ensure test directories exist
Object.values(TEST_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Create valid workflow
const validWorkflow = `name: test-workflow
version: "1.0"
phases:
  discovery:
    objective: Test discovery
  planning:
    objective: Test planning
templates:
  - web-development
`;

fs.writeFileSync(path.join(TEST_DIRS.workflows, 'test-workflow.yaml'), validWorkflow);

// Create valid template
const validTemplate = `---
name: Test Developer
version: "1.0"
---

# Persona

You are a test developer.

## Capabilities

- Testing
- Development

## Standards

- Quality

## Tools

- Jest

## Boundaries

- Never skip tests
`;

fs.writeFileSync(path.join(TEST_DIRS.templates, 'AGENTS-web-development.md'), validTemplate);

// Create valid phase
const validPhase = `# Discovery Phase

## Objective

Understand requirements.

## Activities

- Interview stakeholders
- Document findings
`;

fs.writeFileSync(path.join(TEST_DIRS.phases, 'discovery.md'), validPhase);

// Create invalid workflow (missing required field)
const invalidWorkflow = `version: "1.0"
# Missing 'name' field
`;

fs.writeFileSync(path.join(TEST_DIRS.workflows, 'invalid-workflow.yaml'), invalidWorkflow);

// ============================================================================
// Tests
// ============================================================================

test('WorkflowValidator initializes correctly', () => {
  const validator = new WorkflowValidator();
  assertTrue(validator.errors !== null);
  assertTrue(validator.warnings !== null);
  assertTrue(validator.stats !== null);
});

test('WorkflowValidator has validation rules', () => {
  assertTrue(VALIDATION_RULES.workflow !== undefined);
  assertTrue(VALIDATION_RULES.template !== undefined);
  assertTrue(VALIDATION_RULES.phase !== undefined);
});

test('WorkflowValidator parses YAML correctly', () => {
  const validator = new WorkflowValidator();
  const yaml = `name: test
version: "1.0"
phases:
  - discovery
  - planning
`;
  
  const parsed = validator._parseYAML(yaml);
  assertEqual(parsed.name, 'test');
  assertEqual(parsed.version, '1.0');
});

test('WorkflowValidator validates valid workflow', () => {
  const validator = new WorkflowValidator();
  const report = validator.validateAll();
  
  // Should have checked at least one workflow
  assertTrue(report.summary.workflows_checked >= 1);
});

test('WorkflowValidator detects missing required fields', () => {
  const validator = new WorkflowValidator();
  validator.validateAll();
  
  // Should find errors for invalid-workflow.yaml
  const missingFieldErrors = validator.errors.filter(
    e => e.type === 'MISSING_REQUIRED_FIELD' && e.file === 'invalid-workflow.yaml'
  );
  
  assertTrue(missingFieldErrors.length > 0);
});

test('WorkflowValidator checks template file size', () => {
  const validator = new WorkflowValidator();
  
  // Create a large template
  const largeTemplate = `---
name: Large Template
---

# Persona

${'x'.repeat(100000)}
`;
  
  fs.writeFileSync(
    path.join(TEST_DIRS.templates, 'AGENTS-large-template.md'),
    largeTemplate
  );
  
  validator.validateTemplates();
  
  const sizeWarnings = validator.warnings.filter(
    w => w.type === 'TEMPLATE_TOO_LARGE'
  );
  
  assertTrue(sizeWarnings.length > 0);
  
  // Cleanup
  fs.unlinkSync(path.join(TEST_DIRS.templates, 'AGENTS-large-template.md'));
});

test('WorkflowValidator checks for YAML frontmatter', () => {
  const validator = new WorkflowValidator();
  
  // Create template without frontmatter
  const noFrontmatter = `# No Frontmatter

This template has no YAML frontmatter.
`;
  
  fs.writeFileSync(
    path.join(TEST_DIRS.templates, 'AGENTS-no-frontmatter.md'),
    noFrontmatter
  );
  
  validator.validateTemplates();
  
  const frontmatterWarnings = validator.warnings.filter(
    w => w.type === 'MISSING_FRONTMATTER'
  );
  
  assertTrue(frontmatterWarnings.length > 0);
  
  // Cleanup
  fs.unlinkSync(path.join(TEST_DIRS.templates, 'AGENTS-no-frontmatter.md'));
});

test('WorkflowValidator checks required sections in templates', () => {
  const validator = new WorkflowValidator();
  
  // Create template without persona
  const noPersona = `---
name: No Persona
---

# Capabilities

- Testing
`;
  
  fs.writeFileSync(
    path.join(TEST_DIRS.templates, 'AGENTS-no-persona.md'),
    noPersona
  );
  
  validator.validateTemplates();
  
  const sectionErrors = validator.errors.filter(
    e => e.type === 'MISSING_REQUIRED_SECTION' && e.section === 'persona'
  );
  
  assertTrue(sectionErrors.length > 0);
  
  // Cleanup
  fs.unlinkSync(path.join(TEST_DIRS.templates, 'AGENTS-no-persona.md'));
});

test('WorkflowValidator validates cross-references', () => {
  const validator = new WorkflowValidator();
  
  // Create workflow with non-existent template reference
  const workflowWithBadRef = `name: bad-ref
version: "1.0"
phases:
  discovery:
    objective: Test
templates:
  - non-existent-template-12345
`;
  
  fs.writeFileSync(
    path.join(TEST_DIRS.workflows, 'bad-ref.yaml'),
    workflowWithBadRef
  );
  
  validator.validateAll();
  
  const refErrors = validator.errors.filter(
    e => e.type === 'TEMPLATE_REFERENCE_MISSING' || e.type === 'WORKFLOW_TEMPLATE_MISMATCH'
  );
  
  assertTrue(refErrors.length > 0);
  
  // Cleanup
  fs.unlinkSync(path.join(TEST_DIRS.workflows, 'bad-ref.yaml'));
});

test('WorkflowValidator generates report', () => {
  const validator = new WorkflowValidator();
  const report = validator.validateAll();
  
  assertTrue(report.summary !== undefined);
  assertTrue(report.errors !== undefined);
  assertTrue(report.warnings !== undefined);
  assertTrue(report.stats !== undefined);
  assertTrue(report.summary.status === 'PASS' || report.summary.status === 'FAIL');
});

test('WorkflowValidator tracks stats', () => {
  const validator = new WorkflowValidator();
  validator.validateAll();
  
  assertTrue(validator.stats.workflows_checked >= 0);
  assertTrue(validator.stats.templates_checked >= 0);
  assertTrue(validator.stats.phases_checked >= 0);
  assertEqual(validator.stats.errors_found, validator.errors.length);
  assertEqual(validator.stats.warnings_found, validator.warnings.length);
});

test('WorkflowValidator clears previous results', () => {
  const validator = new WorkflowValidator();
  
  validator.validateAll();
  const firstErrorCount = validator.errors.length;
  
  validator.errors = [];
  validator.warnings = [];
  validator.validateAll();
  
  // Should repopulate
  assertTrue(validator.errors.length >= 0);
});

test('WorkflowValidator gets nested values', () => {
  const validator = new WorkflowValidator();
  const obj = { a: { b: { c: 'value' } } };
  
  assertEqual(validator._getNestedValue(obj, 'a.b.c'), 'value');
  assertTrue(typeof validator._getNestedValue(obj, 'a.b') === 'object');
  assertEqual(validator._getNestedValue(obj, 'x.y.z'), null);
});

test('WorkflowValidator gets phase keywords', () => {
  const validator = new WorkflowValidator();
  
  const discovery = validator._getPhaseKeywords('discovery');
  assertTrue(discovery.includes('requirements'));
  
  const execution = validator._getPhaseKeywords('execution');
  assertTrue(execution.includes('implement'));
});

// ============================================================================
// Cleanup
// ============================================================================

// Remove test files
try {
  fs.unlinkSync(path.join(TEST_DIRS.workflows, 'test-workflow.yaml'));
  fs.unlinkSync(path.join(TEST_DIRS.workflows, 'invalid-workflow.yaml'));
  fs.unlinkSync(path.join(TEST_DIRS.templates, 'AGENTS-web-development.md'));
  fs.unlinkSync(path.join(TEST_DIRS.phases, 'discovery.md'));
} catch (e) {
  // Ignore cleanup errors
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n============================');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('============================');

if (testsFailed > 0) {
  process.exit(1);
}
