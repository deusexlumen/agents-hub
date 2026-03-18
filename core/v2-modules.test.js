/**
 * Test Suite for New Agents Hub v2.0 Modules
 * 
 * Tests: Orchestrator, AutoTransition, TaskDecomposer, LearningEngine
 */

const assert = require('assert');

// Import modules
const { AgentsHub, Orchestrator } = require('../core/orchestrator');
const { AutoTransition } = require('../core/auto-transition');
const { TaskDecomposer } = require('../core/task-decomposer');
const { LearningEngine } = require('../core/learning-engine');

// Test results
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

// ============================================================================
// Orchestrator Tests
// ============================================================================

console.log('\n📦 Orchestrator Tests');
console.log('═══════════════════════');

test('Orchestrator can be instantiated', () => {
  const orch = new Orchestrator();
  assert(orch instanceof Orchestrator);
});

test('AgentsHub extends Orchestrator', () => {
  const hub = new AgentsHub();
  assert(hub instanceof AgentsHub);
  assert(hub instanceof Orchestrator);
});

test('Orchestrator has required methods', () => {
  const orch = new Orchestrator();
  assert(typeof orch.startSession === 'function');
  assert(typeof orch.resumeSession === 'function');
  assert(typeof orch.transitionPhase === 'function');
  assert(typeof orch.getStatus === 'function');
  assert(typeof orch.nextPhase === 'function');
});

// ============================================================================
// AutoTransition Tests
// ============================================================================

console.log('\n📦 AutoTransition Tests');
console.log('═══════════════════════');

test('AutoTransition can be instantiated', () => {
  const at = new AutoTransition();
  assert(at instanceof AutoTransition);
});

test('AutoTransition detects check interval correctly', () => {
  const at = new AutoTransition();
  assert.strictEqual(at.shouldCheckTransition('test', 3), true);
  assert.strictEqual(at.shouldCheckTransition('test', 4), false);
  assert.strictEqual(at.shouldCheckTransition('test', 6), true);
});

test('AutoTransition returns correct analysis structure', async () => {
  const at = new AutoTransition();
  // Mock minimal state for testing
  const result = await at.analyze('test-session', {
    messages: 3,
    currentPhase: 'discovery',
    lastMessage: { content: 'I think we are done here' }
  });
  
  assert(result.hasOwnProperty('shouldTransition'));
  assert(result.hasOwnProperty('confidence'));
  assert(result.hasOwnProperty('reason'));
  assert(typeof result.confidence === 'number');
});

// ============================================================================
// TaskDecomposer Tests
// ============================================================================

console.log('\n📦 TaskDecomposer Tests');
console.log('═══════════════════════');

test('TaskDecomposer can be instantiated', () => {
  const td = new TaskDecomposer();
  assert(td instanceof TaskDecomposer);
});

test('TaskDecomposer estimates complexity correctly', () => {
  const td = new TaskDecomposer();
  
  const low = td.estimateComplexity('Fix typo in readme');
  assert.strictEqual(low.level, 'low');
  
  const high = td.estimateComplexity('Build microservices architecture with authentication');
  assert.strictEqual(high.level, 'high');
});

test('TaskDecomposer detects task types', () => {
  const td = new TaskDecomposer();
  
  const bug = td._detectTaskType('Fix login bug');
  assert.strictEqual(bug, 'bugfix');
  
  const test = td._detectTaskType('Write unit tests');
  assert.strictEqual(test, 'testing');
  
  const doc = td._detectTaskType('Update documentation');
  assert.strictEqual(doc, 'documentation');
});

test('TaskDecomposer generates sub-tasks', () => {
  const td = new TaskDecomposer();
  const complexity = td.estimateComplexity('Build REST API');
  const subTasks = td._generateSubTasks('Build REST API', complexity, {});
  
  assert(Array.isArray(subTasks));
  assert(subTasks.length > 0);
  assert(subTasks[0].hasOwnProperty('id'));
  assert(subTasks[0].hasOwnProperty('title'));
  assert(subTasks[0].hasOwnProperty('estimate'));
});

test('TaskDecomposer builds execution graph', () => {
  const td = new TaskDecomposer();
  const subTasks = [
    { id: 'st-1', title: 'Task 1', estimate: { hours: 1, minutes: 0 }, dependencies: [] },
    { id: 'st-2', title: 'Task 2', estimate: { hours: 1, minutes: 0 }, dependencies: ['st-1'] },
    { id: 'st-3', title: 'Task 3', estimate: { hours: 1, minutes: 0 }, dependencies: [] }
  ];
  
  const graph = td.buildExecutionGraph(subTasks);
  assert(graph.hasOwnProperty('steps'));
  assert(graph.hasOwnProperty('order'));
  assert(graph.hasOwnProperty('levels'));
  assert(Array.isArray(graph.order));
  assert(graph.order.length === 3);
});

// ============================================================================
// LearningEngine Tests
// ============================================================================

console.log('\n📦 LearningEngine Tests');
console.log('═══════════════════════');

test('LearningEngine can be instantiated', () => {
  const le = new LearningEngine();
  assert(le instanceof LearningEngine);
});

test('LearningEngine records patterns', () => {
  const le = new LearningEngine();
  const pattern = le.recordPattern({
    name: 'Test Pattern',
    template: 'test-template',
    category: 'test'
  });
  
  assert(pattern.hasOwnProperty('id'));
  assert.strictEqual(pattern.name, 'Test Pattern');
  assert.strictEqual(pattern.usageCount, 1);
});

test('LearningEngine records preferences', () => {
  const le = new LearningEngine();
  le.recordPreference('workflow', 'software-dev', { task: 'test' });
  
  const pref = le.getPreferences('workflow');
  assert(pref !== null);
  assert(Array.isArray(pref.values));
});

test('LearningEngine gets preferred values', () => {
  const le = new LearningEngine();
  le.recordPreference('template', 'api-development');
  le.recordPreference('template', 'api-development');
  le.recordPreference('template', 'frontend');
  
  const preferred = le.getPreferredValue('template');
  assert.strictEqual(preferred, 'api-development');
});

test('LearningEngine provides recommendations', () => {
  const le = new LearningEngine();
  
  // Record some patterns first
  le.recordPattern({
    name: 'API Pattern',
    template: 'api-development',
    keywords: ['api', 'rest', 'endpoint'],
    category: 'development'
  });
  
  const recommendations = le.recommendTemplates('Build REST API with authentication');
  assert(Array.isArray(recommendations));
  // Should have at least keyword-based recommendations
  assert(recommendations.length > 0);
});

test('LearningEngine provides statistics', () => {
  const le = new LearningEngine();
  const stats = le.getStatistics();
  
  assert(stats.hasOwnProperty('patternsLearned'));
  assert(stats.hasOwnProperty('totalPatternUses'));
  assert(stats.hasOwnProperty('preferenceCategories'));
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n═══════════════════════════════════════');
console.log('Test Summary');
console.log('═══════════════════════════════════════');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
}
