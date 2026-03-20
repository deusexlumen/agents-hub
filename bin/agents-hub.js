#!/usr/bin/env node

const readline = require('readline');
const { ReActOrchestrator } = require('../core/orchestrator');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'agents-hub> '
});

const orchestrator = new ReActOrchestrator();

console.log('\n🤖 Agents Hub - Autonomous Mode\n');

rl.prompt();

rl.on('line', async (input) => {
  const trimmed = input.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }
  
  if (trimmed === 'exit' || trimmed === 'quit') {
    console.log('Shutting down...');
    process.exit(0);
  }
  
  try {
    await orchestrator.runLoop(trimmed);
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  rl.prompt();
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});
