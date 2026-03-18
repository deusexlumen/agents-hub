#!/usr/bin/env node

/**
 * Agents Hub CLI
 * 
 * Command-line interface for the Agents Hub orchestration system
 * Provides commands for session management, workflow control, and system operations
 * 
 * @module agents-hub-cli
 * @version 2.0.0
 */

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

// Import core modules
const { AgentsHub } = require('../index.js');
const { StateManager } = require('../core/state-persistence.js');
const { TemplateLoader } = require('../core/template-loader.js');
const { WorkflowValidator } = require('../core/workflow-validator.js');
const { TaskDecomposer } = require('../core/task-decomposer.js');
const { LearningEngine } = require('../core/learning-engine.js');

// ============================================================================
// CLI Setup
// ============================================================================

const program = new Command();

program
  .name('agents-hub')
  .description('Dynamic Multi-Agent Orchestration System CLI')
  .version('2.0.0');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Print formatted header
 */
function printHeader(title) {
  console.log('\n' + chalk.cyan('═'.repeat(60)));
  console.log(chalk.cyan.bold('  ' + title));
  console.log(chalk.cyan('═'.repeat(60)) + '\n');
}

/**
 * Print success message
 */
function printSuccess(message) {
  console.log(chalk.green('✓'), message);
}

/**
 * Print error message
 */
function printError(message) {
  console.error(chalk.red('✗'), message);
}

/**
 * Print info message
 */
function printInfo(message) {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Print warning message
 */
function printWarning(message) {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Format session data for display
 */
function formatSession(session) {
  const created = new Date(session.created_at).toLocaleString();
  const duration = session.duration_minutes 
    ? `${Math.floor(session.duration_minutes / 60)}h ${session.duration_minutes % 60}m`
    : 'N/A';
  
  return {
    ID: session.session_id,
    Intent: session.user_intent.substring(0, 50) + (session.user_intent.length > 50 ? '...' : ''),
    Phase: session.current_phase,
    Created: created,
    Duration: duration
  };
}

// ============================================================================
// Commands
// ============================================================================

// Initialize project
program
  .command('init')
  .description('Initialize a new Agents Hub project')
  .option('-n, --name <name>', 'Project name', 'my-agents-project')
  .option('-t, --template <template>', 'Initial template to use')
  .action(async (options) => {
    printHeader('Initializing Agents Hub Project');
    
    try {
      const projectDir = path.resolve(process.cwd(), options.name);
      
      // Create project directory
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
        printSuccess(`Created project directory: ${options.name}`);
      } else {
        printInfo(`Using existing directory: ${options.name}`);
      }
      
      // Create subdirectories
      const dirs = ['tasks', 'sessions', 'templates', 'workflows'];
      dirs.forEach(dir => {
        const dirPath = path.join(projectDir, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      });
      printSuccess('Created project structure');
      
      // Create initial config
      const configPath = path.join(projectDir, 'agents-hub.config.js');
      const config = `module.exports = {
  project: '${options.name}',
  version: '1.0.0',
  defaultWorkflow: 'software-dev',
  autoSave: true,
  autoSaveInterval: 300000, // 5 minutes
  maxCheckpoints: 10,
  pruneThreshold: 8000, // tokens
  templates: {
    preferLocal: true,
    cacheEnabled: true
  },
  mcp: {
    enabled: true,
    configPath: './mcp-config.yaml'
  }
};`;
      fs.writeFileSync(configPath, config);
      printSuccess('Created configuration file');
      
      // Create README for project
      const readmePath = path.join(projectDir, 'README.md');
      const readme = `# ${options.name}

Agents Hub Project

## Quick Start

\`\`\`bash
# Start a new session
agents-hub start

# Check status
agents-hub status

# Continue last session
agents-hub continue
\`\`\`

## Project Structure

- \`tasks/\` - Task definitions and context
- \`sessions/\` - Session state files
- \`templates/\` - Custom agent templates
- \`workflows/\` - Workflow definitions

## Configuration

See \`agents-hub.config.js\` for project settings.
`;
      fs.writeFileSync(readmePath, readme);
      printSuccess('Created project README');
      
      console.log('\n' + chalk.green('Project initialized successfully!'));
      console.log(chalk.cyan(`\nNext steps:`));
      console.log(`  cd ${options.name}`);
      console.log(`  agents-hub start`);
      
    } catch (error) {
      printError(`Initialization failed: ${error.message}`);
      process.exit(1);
    }
  });

// Start new session
program
  .command('start [intent]')
  .description('Start a new session')
  .option('-w, --workflow <type>', 'Workflow type', 'software-dev')
  .option('-t, --template <template>', 'Template to use')
  .option('-a, --auto', 'Enable auto-transition detection', false)
  .action(async (intent, options) => {
    printHeader('Starting New Session');
    
    try {
      const hub = new AgentsHub();
      const sessionId = await hub.startSession(intent || 'New session', {
        workflowType: options.workflow,
        template: options.template,
        autoTransition: options.auto
      });
      
      printSuccess(`Session started: ${sessionId}`);
      printInfo(`Workflow: ${options.workflow}`);
      printInfo(`Intent: ${intent || 'New session'}`);
      
      if (options.auto) {
        printInfo('Auto-transition detection enabled');
      }
      
      console.log(chalk.cyan('\nCurrent phase: discovery'));
      console.log('Use "agents-hub phase next" to advance to the next phase');
      
    } catch (error) {
      printError(`Failed to start session: ${error.message}`);
      process.exit(1);
    }
  });

// Show session status
program
  .command('status')
  .description('Show session status')
  .option('-s, --session <id>', 'Specific session ID')
  .option('-a, --all', 'Show all active sessions', false)
  .action(async (options) => {
    printHeader('Session Status');
    
    try {
      const manager = new StateManager();
      
      if (options.all) {
        const sessions = manager.getRecoveryOptions();
        
        if (sessions.length === 0) {
          printInfo('No active sessions found');
          return;
        }
        
        console.log(chalk.bold(`\nActive Sessions (${sessions.length}):\n`));
        sessions.forEach((session, i) => {
          const data = formatSession(session);
          console.log(chalk.yellow(`${i + 1}.`), session.session_id);
          console.log(`   Intent: ${data.Intent}`);
          console.log(`   Phase: ${chalk.cyan(session.current_phase)}`);
          console.log(`   Duration: ${data.Duration}`);
          console.log();
        });
      } else if (options.session) {
        const state = manager.loadSession(options.session);
        console.log(chalk.bold('Session Details:\n'));
        console.log('ID:', state.metadata.session_id);
        console.log('Phase:', chalk.cyan(state.context.current_phase));
        console.log('Workflow:', state.context.workflow_type);
        console.log('Intent:', state.context.user_intent);
        console.log('Duration:', `${state.context.session_duration_minutes} minutes`);
        console.log('Phases completed:', state.context.completed_phases.join(', ') || 'none');
        console.log('Tokens used:', state.metrics.total_tokens_used);
      } else {
        // Show most recent session
        const sessions = manager.getRecoveryOptions();
        
        if (sessions.length === 0) {
          printInfo('No active sessions found');
          printInfo('Start a new session with: agents-hub start');
          return;
        }
        
        const latest = sessions[0];
        const data = formatSession(latest);
        
        console.log(chalk.bold('Most Recent Session:\n'));
        console.log('ID:', latest.session_id);
        console.log('Intent:', data.Intent);
        console.log('Current Phase:', chalk.cyan(latest.current_phase));
        console.log('Created:', data.Created);
        console.log('Duration:', data.Duration);
        console.log('\nUse --all to see all sessions');
        console.log('Use --session <id> for detailed view');
      }
      
    } catch (error) {
      printError(`Failed to get status: ${error.message}`);
      process.exit(1);
    }
  });

// Continue session
program
  .command('continue')
  .description('Continue the last active session')
  .option('-s, --session <id>', 'Specific session ID to continue')
  .action(async (options) => {
    printHeader('Continuing Session');
    
    try {
      const hub = new AgentsHub();
      let sessionId = options.session;
      
      if (!sessionId) {
        const manager = new StateManager();
        const sessions = manager.getRecoveryOptions();
        if (sessions.length === 0) {
          printError('No sessions to continue');
          printInfo('Start a new session with: agents-hub start');
          process.exit(1);
        }
        sessionId = sessions[0].session_id;
      }
      
      const state = await hub.resumeSession(sessionId);
      printSuccess(`Loaded session: ${sessionId}`);
      printInfo(`Current phase: ${state.context.current_phase}`);
      printInfo(`Workflow: ${state.context.workflow_type}`);
      
    } catch (error) {
      printError(`Failed to continue session: ${error.message}`);
      process.exit(1);
    }
  });

// List templates
program
  .command('templates')
  .description('List available templates')
  .option('-d, --detail', 'Show detailed information', false)
  .action(async (options) => {
    printHeader('Available Templates');
    
    try {
      const loader = new TemplateLoader();
      const templates = loader.listAvailableTemplates();
      
      if (templates.length === 0) {
        printInfo('No templates found');
        return;
      }
      
      console.log(chalk.bold(`Found ${templates.length} templates:\n`));
      
      templates.forEach((template, i) => {
        const name = template.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        console.log(chalk.yellow(`${i + 1}.`), name);
        
        if (options.detail) {
          try {
            const data = loader.loadTemplate(template);
            if (data.metadata?.description) {
              console.log(`   ${data.metadata.description}`);
            }
            if (data.capabilities) {
              console.log(`   Capabilities: ${data.capabilities.slice(0, 3).join(', ')}...`);
            }
            console.log();
          } catch (e) {
            console.log();
          }
        }
      });
      
    } catch (error) {
      printError(`Failed to list templates: ${error.message}`);
      process.exit(1);
    }
  });

// Validate system
program
  .command('validate')
  .description('Validate system integrity')
  .option('--strict', 'Enable strict mode (warnings as errors)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    printHeader('System Validation');
    
    try {
      const validator = new WorkflowValidator({
        STRICT_MODE: options.strict
      });
      
      const report = validator.validateAll();
      
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        validator.printReport(report);
      }
      
      process.exit(report.summary.status === 'PASS' ? 0 : 1);
      
    } catch (error) {
      printError(`Validation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Phase management
const phaseCmd = program
  .command('phase')
  .description('Phase management commands');

phaseCmd
  .command('next')
  .description('Transition to the next phase')
  .option('-s, --session <id>', 'Session ID (uses latest if not specified)')
  .option('-r, --reason <reason>', 'Transition reason')
  .action(async (options) => {
    printHeader('Phase Transition');
    
    try {
      const hub = new AgentsHub();
      const phaseOrder = ['discovery', 'planning', 'execution', 'review', 'delivery'];
      
      // Get current session
      const manager = new StateManager();
      let sessionId = options.session;
      
      if (!sessionId) {
        const sessions = manager.getRecoveryOptions();
        if (sessions.length === 0) {
          printError('No active session found');
          process.exit(1);
        }
        sessionId = sessions[0].session_id;
      }
      
      const state = manager.loadSession(sessionId);
      const currentPhase = state.context.current_phase;
      const currentIndex = phaseOrder.indexOf(currentPhase);
      
      if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
        printError(`Cannot transition from phase: ${currentPhase}`);
        process.exit(1);
      }
      
      const nextPhase = phaseOrder[currentIndex + 1];
      
      await hub.transitionPhase(sessionId, currentPhase, nextPhase, {
        reason: options.reason || 'Manual transition'
      });
      
      printSuccess(`Transitioned: ${currentPhase} → ${nextPhase}`);
      printInfo(`Session: ${sessionId}`);
      
    } catch (error) {
      printError(`Phase transition failed: ${error.message}`);
      process.exit(1);
    }
  });

phaseCmd
  .command('list')
  .description('List all phases and their status')
  .option('-s, --session <id>', 'Session ID')
  .action(async (options) => {
    printHeader('Phase Status');
    
    try {
      const manager = new StateManager();
      let sessionId = options.session;
      
      if (!sessionId) {
        const sessions = manager.getRecoveryOptions();
        if (sessions.length === 0) {
          printError('No active session found');
          process.exit(1);
        }
        sessionId = sessions[0].session_id;
      }
      
      const state = manager.loadSession(sessionId);
      const phases = ['discovery', 'planning', 'execution', 'review', 'delivery'];
      
      console.log(chalk.bold(`Session: ${sessionId}\n`));
      
      phases.forEach((phase, i) => {
        const phaseData = state.phases[phase];
        const status = phaseData.status;
        
        let icon = '○';
        let color = chalk.gray;
        
        if (status === 'completed') {
          icon = '✓';
          color = chalk.green;
        } else if (status === 'active') {
          icon = '▶';
          color = chalk.cyan;
        }
        
        console.log(`${color(`${icon} ${i + 1}. ${phase.toUpperCase()}`)}`);
        console.log(`   Status: ${status}`);
        
        if (phaseData.started_at) {
          console.log(`   Started: ${new Date(phaseData.started_at).toLocaleString()}`);
        }
        if (phaseData.completed_at) {
          console.log(`   Completed: ${new Date(phaseData.completed_at).toLocaleString()}`);
        }
        console.log();
      });
      
    } catch (error) {
      printError(`Failed to list phases: ${error.message}`);
      process.exit(1);
    }
  });

// Task decomposition
program
  .command('split <task>')
  .description('Decompose a task into sub-tasks')
  .option('-e, --estimate', 'Include time estimates', true)
  .option('-d, --dependencies', 'Show dependencies', true)
  .option('-o, --output <file>', 'Output to file')
  .action(async (task, options) => {
    printHeader('Task Decomposition');
    
    try {
      const decomposer = new TaskDecomposer();
      const result = await decomposer.decompose(task, {
        includeEstimates: options.estimate,
        includeDependencies: options.dependencies
      });
      
      console.log(chalk.bold('Task:'), task);
      console.log(chalk.bold('Complexity:'), result.complexity);
      console.log(chalk.bold(`Sub-tasks (${result.subTasks.length}):\n`));
      
      result.subTasks.forEach((subTask, i) => {
        console.log(chalk.yellow(`${i + 1}.`), subTask.title);
        console.log(`   Description: ${subTask.description}`);
        
        if (options.estimate && subTask.estimate) {
          console.log(`   Estimate: ${subTask.estimate.hours}h ${subTask.estimate.minutes}m`);
        }
        
        if (options.dependencies && subTask.dependencies && subTask.dependencies.length > 0) {
          console.log(`   Dependencies: ${subTask.dependencies.join(', ')}`);
        }
        console.log();
      });
      
      if (result.executionGraph) {
        console.log(chalk.bold('Execution Order:'));
        result.executionGraph.order.forEach((id, i) => {
          const step = result.executionGraph.steps.find(s => s.id === id);
          console.log(`  ${i + 1}. ${step.title}`);
        });
        console.log();
      }
      
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
        printSuccess(`Saved to: ${options.output}`);
      }
      
    } catch (error) {
      printError(`Decomposition failed: ${error.message}`);
      process.exit(1);
    }
  });

// Learning engine commands
const learnCmd = program
  .command('learn')
  .description('Learning engine commands');

learnCmd
  .command('patterns')
  .description('Show learned patterns')
  .option('-l, --limit <n>', 'Number of patterns to show', '10')
  .action(async (options) => {
    printHeader('Learned Patterns');
    
    try {
      const engine = new LearningEngine();
      const patterns = engine.getPatterns({
        limit: parseInt(options.limit)
      });
      
      if (patterns.length === 0) {
        printInfo('No patterns learned yet');
        return;
      }
      
      patterns.forEach((pattern, i) => {
        console.log(chalk.yellow(`${i + 1}.`), pattern.name);
        console.log(`   Success rate: ${(pattern.successRate * 100).toFixed(1)}%`);
        console.log(`   Uses: ${pattern.usageCount}`);
        console.log();
      });
      
    } catch (error) {
      printError(`Failed to get patterns: ${error.message}`);
      process.exit(1);
    }
  });

learnCmd
  .command('recommend <task>')
  .description('Get template recommendations for a task')
  .action(async (task) => {
    printHeader('Template Recommendations');
    
    try {
      const engine = new LearningEngine();
      const recommendations = engine.recommendTemplates(task);
      
      console.log(chalk.bold('Task:'), task);
      console.log(chalk.bold(`Recommendations (${recommendations.length}):\n`));
      
      recommendations.forEach((rec, i) => {
        console.log(chalk.yellow(`${i + 1}.`), rec.template);
        console.log(`   Confidence: ${(rec.confidence * 100).toFixed(1)}%`);
        console.log(`   Reason: ${rec.reason}`);
        console.log();
      });
      
    } catch (error) {
      printError(`Recommendation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Close session
program
  .command('close')
  .description('Close the current session')
  .option('-s, --session <id>', 'Session ID to close')
  .option('-f, --force', 'Force close without confirmation', false)
  .action(async (options) => {
    printHeader('Closing Session');
    
    try {
      const hub = new AgentsHub();
      let sessionId = options.session;
      
      if (!sessionId) {
        const manager = new StateManager();
        const sessions = manager.getRecoveryOptions();
        if (sessions.length === 0) {
          printError('No active session to close');
          process.exit(1);
        }
        sessionId = sessions[0].session_id;
      }
      
      const summary = await hub.closeSession(sessionId, 'completed');
      
      printSuccess(`Session closed: ${sessionId}`);
      console.log('\nSession Summary:');
      console.log(`  Duration: ${summary.duration_minutes} minutes`);
      console.log(`  Phases completed: ${summary.phases_completed.join(', ')}`);
      console.log(`  Key decisions: ${summary.key_decisions_count}`);
      
    } catch (error) {
      printError(`Failed to close session: ${error.message}`);
      process.exit(1);
    }
  });

// Cleanup command
program
  .command('cleanup')
  .description('Clean up old sessions')
  .option('-d, --days <n>', 'Max age in days', '30')
  .action(async (options) => {
    printHeader('Cleanup');
    
    try {
      const manager = new StateManager();
      const cleaned = manager.cleanup(parseInt(options.days));
      
      printSuccess(`Cleaned up ${cleaned} old sessions`);
      printInfo(`Removed sessions older than ${options.days} days`);
      
    } catch (error) {
      printError(`Cleanup failed: ${error.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// Parse CLI
// ============================================================================

program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
