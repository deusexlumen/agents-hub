/**
 * Tests for Resilient Operations Module
 * 
 * @module resilient-ops.test
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');
const { 
  withRetry, 
  sleep, 
  CircuitBreaker, 
  ResilientFileOps, 
  BatchProcessor 
} = require('./resilient-ops');

// ============================================================================
// Test Utilities
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`✗ ${name}: ${error.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  console.log('Running Resilient Operations Tests...\n');
  
  // Test withRetry
  await test('withRetry succeeds on first attempt', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      return 'success';
    });
    assert(result === 'success', 'Should return success');
    assert(attempts === 1, 'Should only attempt once');
  });
  
  await test('withRetry retries on failure', async () => {
    let attempts = 0;
    try {
      await withRetry(async () => {
        attempts++;
        throw new Error('Temporary error');
      }, { maxAttempts: 3, delayMs: 10 });
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(attempts === 3, `Should retry 3 times, got ${attempts}`);
    }
  });
  
  await test('withRetry succeeds after retry', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary error');
      }
      return 'success';
    }, { maxAttempts: 3, delayMs: 10 });
    assert(result === 'success', 'Should eventually succeed');
    assert(attempts === 3, 'Should succeed on third attempt');
  });
  
  // Test sleep
  await test('sleep delays execution', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    assert(elapsed >= 45, `Should delay ~50ms, got ${elapsed}ms`);
  });
  
  // Test CircuitBreaker
  await test('CircuitBreaker starts closed', () => {
    const cb = new CircuitBreaker();
    assert(cb.state === 'CLOSED', 'Should start closed');
  });
  
  await test('CircuitBreaker opens after failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error('Fail'); });
      } catch (e) {
        // Expected
      }
    }
    
    assert(cb.state === 'OPEN', `Should be open, got ${cb.state}`);
  });
  
  await test('CircuitBreaker rejects when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    
    try {
      await cb.execute(async () => { throw new Error('Fail'); });
    } catch (e) {}
    
    try {
      await cb.execute(async () => 'success');
      assert(false, 'Should reject when open');
    } catch (e) {
      assert(e.message.includes('OPEN'), 'Should indicate circuit is open');
    }
  });
  
  // Test ResilientFileOps
  await test('ResilientFileOps writes and reads file', async () => {
    const ops = new ResilientFileOps();
    const testPath = './test-file-' + Date.now() + '.txt';
    const content = 'Hello, World!';
    
    try {
      await ops.writeFile(testPath, content);
      const result = await ops.readFile(testPath);
      assert(result.data === content, 'Should read written content');
    } finally {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    }
  });
  
  await test('ResilientFileOps writes and reads JSON', async () => {
    const ops = new ResilientFileOps();
    const testPath = './test-json-' + Date.now() + '.json';
    const data = { test: true, nested: { value: 123 } };
    
    try {
      await ops.writeJSON(testPath, data);
      const result = await ops.readJSON(testPath);
      assert(JSON.stringify(result.data) === JSON.stringify(data), 'Should read JSON correctly');
    } finally {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    }
  });
  
  await test('ResilientFileOps creates backup before overwrite', async () => {
    const ops = new ResilientFileOps();
    const testPath = './test-backup-' + Date.now() + '.txt';
    const backupPath = testPath + '.backup';
    
    try {
      // Write initial file
      fs.writeFileSync(testPath, 'original');
      
      // Overwrite with backup
      await ops.writeFile(testPath, 'updated');
      
      // Backup should be cleaned up on success
      assert(!fs.existsSync(backupPath), 'Backup should be cleaned up');
      assert(fs.readFileSync(testPath, 'utf8') === 'updated', 'File should be updated');
    } finally {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    }
  });
  
  await test('ResilientFileOps ensures directory exists', async () => {
    const ops = new ResilientFileOps();
    const baseDir = './test-nested-dir-' + Date.now();
    const testDir = baseDir + '/sub/dir';
    
    try {
      await ops.ensureDir(testDir);
      assert(fs.existsSync(testDir), 'Directory should exist');
    } finally {
      // Cleanup - nur die erstellten Verzeichnisse
      try {
        if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
        if (fs.existsSync(baseDir + '/sub')) fs.rmdirSync(baseDir + '/sub');
        if (fs.existsSync(baseDir)) fs.rmdirSync(baseDir);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });
  
  await test('ResilientFileOps safe delete', async () => {
    const ops = new ResilientFileOps();
    const testPath = './test-delete-' + Date.now() + '.txt';
    
    fs.writeFileSync(testPath, 'delete me');
    
    const result = await ops.deleteFile(testPath);
    assert(result.success, 'Should delete successfully');
    assert(!fs.existsSync(testPath), 'File should not exist');
  });
  
  await test('ResilientFileOps handles missing file with ignoreNotFound', async () => {
    const ops = new ResilientFileOps();
    const testPath = './non-existent-file.txt';
    
    const result = await ops.deleteFile(testPath, { ignoreNotFound: true });
    assert(result.success, 'Should return success');
    assert(result.ignored, 'Should indicate file was ignored');
  });
  
  // Test BatchProcessor
  await test('BatchProcessor processes items', async () => {
    const processor = new BatchProcessor({ batchSize: 2, concurrency: 1 });
    const items = [1, 2, 3, 4, 5];
    
    const result = await processor.process(items, async (item) => {
      return item * 2;
    });
    
    assert(result.total === 5, 'Should process all items');
    assert(result.successful === 5, 'Should succeed all');
    assert(result.results.length === 5, 'Should have 5 results');
  });
  
  await test('BatchProcessor handles errors gracefully', async () => {
    const processor = new BatchProcessor({ batchSize: 2, concurrency: 1 });
    const items = [1, 2, 3];
    
    const result = await processor.process(items, async (item) => {
      if (item === 2) throw new Error('Fail');
      return item;
    });
    
    assert(result.total === 3, 'Should attempt all items');
    assert(result.successful === 2, 'Should succeed 2');
    assert(result.failed === 1, 'Should fail 1');
  });
  
  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log(`${'='.repeat(50)}`);
  
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(console.error);
