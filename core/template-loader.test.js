/**
 * Template Loader Tests
 * 
 * Run with: node template-loader.test.js
 */

const { TemplateLoader } = require('./template-loader');
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

console.log('Running Template Loader Tests...\n');

// ============================================================================
// Setup - Create test templates
// ============================================================================

const TEST_TEMPLATE_DIR = path.join(__dirname, '../templates');

// Ensure test directory exists
if (!fs.existsSync(TEST_TEMPLATE_DIR)) {
  fs.mkdirSync(TEST_TEMPLATE_DIR, { recursive: true });
}

// Create test template
const testTemplate = `---
name: Test Developer
version: "1.0"
description: Test template for unit tests
---

# Persona

You are a test developer specializing in testing.

## Capabilities

- Unit testing
- Integration testing
- E2E testing

## Standards

- 80% coverage minimum
- TDD approach

## Tools

- Jest
- Cypress
- Playwright

## Boundaries

- Never skip tests for critical paths
- Always mock external services in unit tests
`;

fs.writeFileSync(
  path.join(TEST_TEMPLATE_DIR, 'AGENTS-test-developer.md'),
  testTemplate
);

// Create another test template
const apiTemplate = `---
name: API Developer
version: "1.0"
description: API development specialist
---

# Persona

You are an API developer specializing in REST and GraphQL.

## Capabilities

- REST API design
- GraphQL schema design
- Authentication

## Standards

- OpenAPI specification
- JWT for auth

## Tools

- Express
- Fastify
- Apollo

## Unique Section

This is unique to API template.
`;

fs.writeFileSync(
  path.join(TEST_TEMPLATE_DIR, 'AGENTS-api-development.md'),
  apiTemplate
);

// ============================================================================
// Tests
// ============================================================================

test('TemplateLoader initializes correctly', () => {
  const loader = new TemplateLoader();
  assertTrue(loader.sharedSkills !== null);
  assertTrue(loader.cache !== null);
});

test('TemplateLoader loads shared skills', () => {
  const loader = new TemplateLoader();
  const skills = loader.getSharedSkills();
  
  assertTrue(skills.standards !== undefined);
  assertTrue(skills.procedures !== undefined);
  assertTrue(skills.boundaries !== undefined);
});

test('TemplateLoader lists available templates', () => {
  const loader = new TemplateLoader();
  const templates = loader.listAvailableTemplates();
  
  assertTrue(templates.length >= 2);
  assertTrue(templates.includes('test-developer'));
  assertTrue(templates.includes('api-development'));
});

test('TemplateLoader loads template with metadata', () => {
  const loader = new TemplateLoader();
  const template = loader.loadTemplate('test-developer');
  
  assertTrue(template.metadata !== undefined);
  assertEqual(template.metadata.name, 'Test Developer');
  assertEqual(template.metadata.version, '1.0');
});

test('TemplateLoader merges with shared skills', () => {
  const loader = new TemplateLoader();
  const template = loader.loadTemplate('test-developer');
  
  // Should have shared standards
  assertTrue(template.standards !== undefined);
  assertTrue(template.standards.code_quality !== undefined);
  assertTrue(template.standards.security !== undefined);
  
  // Should have shared procedures
  assertTrue(template.procedures !== undefined);
  assertTrue(template.procedures.handoff !== undefined);
});

test('TemplateLoader can load without shared skills', () => {
  const loader = new TemplateLoader();
  const withShared = loader.loadTemplate('test-developer', { includeShared: true });
  const withoutShared = loader.loadTemplate('test-developer', { includeShared: false });
  
  // Without shared skills should have fewer standards
  const withSharedCount = Object.keys(withShared.standards || {}).length;
  const withoutSharedCount = Object.keys(withoutShared.standards || {}).length;
  
  assertTrue(withoutSharedCount < withSharedCount, 
    `Expected ${withoutSharedCount} < ${withSharedCount}`);
});

test('TemplateLoader caches templates', () => {
  const loader = new TemplateLoader({ CACHE_ENABLED: true });
  
  const template1 = loader.loadTemplate('test-developer');
  const template2 = loader.loadTemplate('test-developer');
  
  // Should be same object reference (from cache)
  assertTrue(template1 === template2);
});

test('TemplateLoader calculates relevance', () => {
  const loader = new TemplateLoader();
  
  // Should match api-development for REST API task
  const templates = loader.loadRelevantTemplates('Build REST API with authentication', 3);
  
  assertTrue(templates.length > 0);
  
  // At least one should be api-development
  const apiTemplate = templates.find(t => t.name === 'api-development');
  assertTrue(apiTemplate !== undefined);
  assertTrue(apiTemplate.score > 0);
});

test('TemplateLoader loads multiple templates', () => {
  const loader = new TemplateLoader();
  const templates = loader.loadTemplates(['test-developer', 'api-development']);
  
  assertEqual(templates.length, 2);
  assertTrue(templates[0].metadata !== undefined);
  assertTrue(templates[1].metadata !== undefined);
});

test('TemplateLoader composes templates', () => {
  const loader = new TemplateLoader();
  const composed = loader.composeTemplates(
    ['test-developer', 'api-development'],
    'merge'
  );
  
  assertTrue(composed.metadata !== undefined);
  assertTrue(composed.metadata.source_templates !== undefined);
  assertEqual(composed.metadata.source_templates.length, 2);
});

test('TemplateLoader clears cache', () => {
  const loader = new TemplateLoader({ CACHE_ENABLED: true });
  
  loader.loadTemplate('test-developer');
  assertTrue(loader.cache.size > 0);
  
  loader.clearCache();
  assertEqual(loader.cache.size, 0);
});

test('TemplateLoader handles missing template', () => {
  const loader = new TemplateLoader();
  
  let errorThrown = false;
  try {
    loader.loadTemplate('non-existent-template');
  } catch (err) {
    errorThrown = true;
    assertTrue(err.message.includes('not found'));
  }
  
  assertTrue(errorThrown);
});

// ============================================================================
// Cleanup
// ============================================================================

// Remove test templates
try {
  fs.unlinkSync(path.join(TEST_TEMPLATE_DIR, 'AGENTS-test-developer.md'));
  fs.unlinkSync(path.join(TEST_TEMPLATE_DIR, 'AGENTS-api-development.md'));
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
