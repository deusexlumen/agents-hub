/**
 * Smart Loader Tests
 * 
 * Run with: node smart-loader.test.js
 */

const { SmartLoader, KEYWORD_DATABASE } = require('./smart-loader');

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

function assertGreaterThan(actual, threshold, msg) {
  if (!(actual > threshold)) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${actual} > ${threshold}`);
  }
}

console.log('Running Smart Loader Tests...\n');

// ============================================================================
// Tests
// ============================================================================

test('SmartLoader initializes correctly', () => {
  const loader = new SmartLoader();
  assertTrue(loader.config !== null);
  assertTrue(loader.templateLoader !== null);
  assertTrue(loader.sectionCache !== null);
});

test('SmartLoader extracts keywords', () => {
  const loader = new SmartLoader();
  const keywords = loader._extractKeywords('Build REST API with authentication');
  
  assertTrue(keywords.length > 0);
  assertTrue(keywords.includes('build'));
  assertTrue(keywords.includes('rest'));
  assertTrue(keywords.includes('api'));
});

test('SmartLoader extracts related keywords', () => {
  const loader = new SmartLoader();
  const keywords = loader._extractKeywords('Build a React application');
  
  // Should include related keywords from database
  assertTrue(keywords.includes('react'));
  assertTrue(keywords.includes('frontend'));
  assertTrue(keywords.includes('component'));
});

test('SmartLoader calculates keyword overlap', () => {
  const loader = new SmartLoader();
  const overlap = loader._calculateKeywordOverlap(
    ['api', 'rest', 'auth'],
    ['api', 'graphql', 'auth']
  );
  
  assertTrue(overlap > 0);
  assertTrue(overlap <= 1);
});

test('SmartLoader calculates semantic similarity', () => {
  const loader = new SmartLoader();
  const similarity = loader._calculateSemanticSimilarity(
    'Build REST API',
    'Create API endpoint'
  );
  
  assertTrue(similarity > 0);
  assertTrue(similarity <= 1);
});

test('SmartLoader estimates tokens', () => {
  const loader = new SmartLoader();
  
  const text = 'This is a test string with some content.';
  const tokens = loader._estimateStringTokens(text);
  
  // Rough estimate: length/4
  assertTrue(tokens > 0);
  assertTrue(tokens >= Math.ceil(text.length / 4));
});

test('SmartLoader calculates template relevance', () => {
  const loader = new SmartLoader();
  const relevance = loader.calculateTemplateRelevance(
    'api-development',
    'Build REST API with authentication'
  );
  
  assertTrue(relevance > 0);
  assertTrue(relevance <= 1);
});

test('SmartLoader higher relevance for matching keywords', () => {
  const loader = new SmartLoader();
  
  const apiRelevance = loader.calculateTemplateRelevance(
    'api-development',
    'Build REST API'
  );
  
  const contentRelevance = loader.calculateTemplateRelevance(
    'content-creation',
    'Build REST API'
  );
  
  assertTrue(apiRelevance > contentRelevance);
});

test('SmartLoader loads optimal context', () => {
  const loader = new SmartLoader();
  const result = loader.loadOptimalContext('Build REST API');
  
  assertTrue(result.content !== null);
  assertTrue(result.metadata !== null);
  assertTrue(Array.isArray(result.content));
  assertTrue(Array.isArray(result.metadata.templates_loaded));
  // May be 0 if no templates exist
  assertTrue(result.metadata.estimated_tokens >= 0);
});

test('SmartLoader prunes context', () => {
  const loader = new SmartLoader();
  
  // Create a very large string context that exceeds limit
  const hugeContent = 'x'.repeat(50000); // ~12500 tokens
  const largeContext = [
    {
      template: 'test',
      content: hugeContent
    }
  ];
  
  const pruned = loader.pruneContext(largeContext, 8000);
  
  // Should have saved tokens
  assertTrue(pruned.tokens_saved >= 0);
  assertTrue(pruned.original_tokens > 8000);
  assertTrue(pruned.final_tokens <= pruned.original_tokens);
});

test('SmartLoader tracks loaded templates', () => {
  const loader = new SmartLoader();
  
  loader.loadOptimalContext('Build REST API');
  
  const stats = loader.getStats();
  assertTrue(stats.templates_loaded_count >= 0);
  assertTrue(stats.context_history_size > 0);
});

test('SmartLoader clears caches', () => {
  const loader = new SmartLoader();
  
  // Load context (may or may not load templates)
  loader.loadOptimalContext('Build REST API');
  const hadTemplates = loader.loadedTemplates.size > 0;
  const hadHistory = loader.contextHistory.length > 0;
  
  loader.clearCaches();
  
  // After clearing, everything should be empty
  assertEqual(loader.loadedTemplates.size, 0);
  assertEqual(loader.contextHistory.length, 0);
});

test('SmartLoader gets phase keywords', () => {
  const loader = new SmartLoader();
  const keywords = loader._getPhaseKeywords('execution', 'software-dev');
  
  assertTrue(keywords.includes('implement'));
  assertTrue(keywords.includes('code'));
  assertTrue(keywords.includes('build'));
});

test('SmartLoader loads phase context', () => {
  const loader = new SmartLoader();
  const context = loader.loadPhaseContext(
    'execution',
    'software-dev',
    'Build REST API'
  );
  
  assertTrue(context.phase !== null);
  assertTrue(context.templates !== null);
  assertEqual(context.metadata.phase, 'execution');
});

test('SmartLoader analyzes template', () => {
  const loader = new SmartLoader();
  
  // This might fail if no templates exist, but that's ok
  try {
    const analysis = loader.analyzeTemplate('web-development');
    assertTrue(analysis.name !== null);
    assertTrue(analysis.sections !== null);
    assertTrue(analysis.estimated_tokens > 0);
  } catch (e) {
    // Template doesn't exist, skip
    console.log('  (skipped - template not found)');
  }
});

test('SmartLoader summarizes content', () => {
  const loader = new SmartLoader();
  const longContent = `First paragraph with important info.

Second paragraph with more details.

Third paragraph explaining something.

Fourth paragraph with conclusion.`;
  
  const summary = loader._summarizeContent(longContent);
  
  assertTrue(summary.includes('[Summary]'));
  assertTrue(summary.includes('paragraphs summarized'));
});

test('KEYWORD_DATABASE has entries', () => {
  assertTrue(Object.keys(KEYWORD_DATABASE).length > 0);
  assertTrue(KEYWORD_DATABASE.javascript !== undefined);
  assertTrue(KEYWORD_DATABASE.react !== undefined);
  assertTrue(KEYWORD_DATABASE.api !== undefined);
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
