/**
 * State Persistence Tests
 * 
 * Run with: node state-persistence.test.js
 */

const { StateManager, DEFAULT_STATE } = require('./state-persistence');
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

// Clean up before tests
const TEST_DIR = './session_state';
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true });
}

console.log('Running State Persistence Tests...\n');

// ============================================================================
// Tests
// ============================================================================

test('StateManager initializes with default config', () => {
  const manager = new StateManager();
  assertTrue(manager.config !== null);
  assertTrue(manager.config.STATE_DIR !== null);
});

test('StateManager creates directories on init', () => {
  const manager = new StateManager();
  assertTrue(fs.existsSync(path.join(TEST_DIR, 'active')));
  assertTrue(fs.existsSync(path.join(TEST_DIR, 'archived')));
  assertTrue(fs.existsSync(path.join(TEST_DIR, 'recovery')));
});

test('initSession creates new session', () => {
  const manager = new StateManager();
  const sessionId = manager.initSession('Build REST API', 'software-dev');
  
  assertTrue(sessionId !== null);
  assertEqual(manager.currentState.context.user_intent, 'Build REST API');
  assertEqual(manager.currentState.context.workflow_type, 'software-dev');
  assertEqual(manager.currentState.context.current_phase, 'discovery');
});

test('initSession auto-detects workflow type', () => {
  const manager = new StateManager();
  manager.initSession('Write a blog post about AI');
  
  assertEqual(manager.currentState.context.workflow_type, 'content-creation');
});

test('updatePhase modifies phase data', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  manager.updatePhase('discovery', {
    status: 'active',
    findings: ['finding1', 'finding2']
  });
  
  assertEqual(manager.currentState.phases.discovery.status, 'active');
  assertTrue(manager.currentState.phases.discovery.findings.length === 2);
});

test('transitionPhase moves to next phase', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  manager.transitionPhase('discovery', 'planning');
  
  assertEqual(manager.currentState.phases.discovery.status, 'completed');
  assertEqual(manager.currentState.phases.planning.status, 'active');
  assertEqual(manager.currentState.context.current_phase, 'planning');
  assertTrue(manager.currentState.context.completed_phases.includes('discovery'));
});

test('createCheckpoint creates recovery point', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  const checkpointId = manager.createCheckpoint('test_checkpoint');
  
  assertTrue(checkpointId !== null);
  assertTrue(fs.existsSync(path.join(TEST_DIR, 'recovery', `${checkpointId}.json`)));
});

test('restoreCheckpoint recovers state', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  manager.updateContext({ test_key: 'test_value' });
  const checkpointId = manager.createCheckpoint('before_change');
  
  manager.updateContext({ test_key: 'changed_value' });
  assertEqual(manager.currentState.context.test_key, 'changed_value');
  
  manager.restoreCheckpoint(checkpointId);
  assertEqual(manager.currentState.context.test_key, 'test_value');
});

test('getPrunedContext returns minimal context', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  manager.transitionPhase('discovery', 'planning');
  
  const pruned = manager.getPrunedContext();
  
  assertTrue(pruned.session_id !== null);
  assertEqual(pruned.current_phase, 'planning');
  assertTrue(pruned.phase_summaries.discovery !== undefined);
  assertTrue(pruned.current_phase_data !== undefined);
});

test('addToMemory stores data', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  manager.addToMemory('key_decisions', { decision: 'Use Node.js' });
  
  assertEqual(manager.currentState.memory.key_decisions.length, 1);
  assertEqual(manager.currentState.memory.key_decisions[0].decision, 'Use Node.js');
});

test('trackTemplates records template usage', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  manager.trackTemplates(['api-dev', 'security'], ['auth', 'rest']);
  
  assertTrue(manager.currentState.templates.loaded.includes('api-dev'));
  assertTrue(manager.currentState.templates.relevant_sections.includes('auth'));
});

test('persistState saves to disk', () => {
  const manager = new StateManager();
  const sessionId = manager.initSession('Test project');
  
  manager.updateContext({ test_data: 'persisted' });
  
  // Create new manager instance and load
  const manager2 = new StateManager();
  manager2.loadSession(sessionId);
  
  assertEqual(manager2.currentState.context.test_data, 'persisted');
});

test('getRecoveryOptions lists active sessions', () => {
  const manager = new StateManager();
  manager.initSession('First project');
  
  const manager2 = new StateManager();
  manager2.initSession('Second project');
  
  const manager3 = new StateManager();
  const options = manager3.getRecoveryOptions();
  
  assertTrue(options.length >= 2);
  assertTrue(options.some(o => o.user_intent === 'First project'));
  assertTrue(options.some(o => o.user_intent === 'Second project'));
});

test('closeSession archives session', () => {
  const manager = new StateManager();
  const sessionId = manager.initSession('Test project');
  
  manager.closeSession('completed');
  
  // Active file should be removed
  assertTrue(!fs.existsSync(path.join(TEST_DIR, 'active', `session_${sessionId}.json`)));
  
  // Should be in archived
  const archiveDir = path.join(TEST_DIR, 'archived', new Date().toISOString().slice(0, 7));
  assertTrue(fs.existsSync(path.join(archiveDir, `session_${sessionId}.json`)));
});

test('cleanup removes old sessions', () => {
  const manager = new StateManager();
  
  // This is hard to test without mocking time
  // Just verify the method exists and returns a number
  const result = manager.cleanup(999); // Very old
  assertTrue(typeof result === 'number');
});

test('shouldPrune detects large context', () => {
  const manager = new StateManager();
  
  assertTrue(manager.shouldPrune(9000)); // Over threshold
  assertTrue(!manager.shouldPrune(5000)); // Under threshold
});

test('updateMetrics tracks usage', () => {
  const manager = new StateManager();
  manager.initSession('Test project');
  
  manager.updateMetrics({ total_tokens_used: 5000 });
  assertEqual(manager.currentState.metrics.total_tokens_used, 5000);
  
  manager.updateMetrics({ total_tokens_used: 3000 }); // Should add or replace
  assertEqual(manager.currentState.metrics.total_tokens_used, 3000);
});

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
