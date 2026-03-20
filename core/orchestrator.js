const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Guardrails } = require('./resilient-ops');

class ReActOrchestrator {
  constructor(config = {}) {
    this.llmCommand = config.llmCommand || process.env.LLM_COMMAND || 'gemini-code';
    this.llmArgs = config.llmArgs || [];
    this.guardrails = new Guardrails(config.guardrails);
    this.activeProcess = null;
    this.iteration = 0;
  }

  async runLoop(userInput) {
    this.iteration = 0;
    let currentInput = userInput;
    let isComplete = false;

    while (!isComplete && this.iteration < this.guardrails.maxIterations) {
      this.iteration++;
      console.log(`\n[Iteration ${this.iteration}/${this.guardrails.maxIterations}]`);
      
      const llmOutput = await this.spawnLLM(currentInput);
      
      if (llmOutput.includes('<TASK_COMPLETE>')) {
        isComplete = true;
        console.log('\n✓ Task completed');
        break;
      }

      const actions = this.parseActions(llmOutput);
      
      if (actions.length === 0) {
        console.log('\n' + llmOutput.replace(/\u003c[^\u003e]+\u003e/g, '').trim());
        break;
      }

      const observations = [];
      for (const action of actions) {
        const result = await this.executeAction(action);
        observations.push({ action, result });
      }

      currentInput = this.buildObservationPrompt(llmOutput, observations);
    }

    if (this.iteration >= this.guardrails.maxIterations) {
      console.log('\n⚠ Max iterations reached');
    }
  }

  spawnLLM(input) {
    return new Promise((resolve, reject) => {
      const outputChunks = [];
      const timeoutId = setTimeout(() => {
        if (this.activeProcess) {
          this.activeProcess.kill('SIGTERM');
          setTimeout(() => this.activeProcess?.kill('SIGKILL'), 5000);
        }
        reject(new Error('LLM timeout'));
      }, this.guardrails.timeoutMs);

      this.activeProcess = spawn(this.llmCommand, this.llmArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.activeProcess.stdout.on('data', (chunk) => {
        outputChunks.push(chunk.toString());
        process.stdout.write(chunk);
      });

      this.activeProcess.stderr.on('data', (chunk) => {
        console.error(chunk.toString());
      });

      this.activeProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;
        resolve(outputChunks.join(''));
      });

      this.activeProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      const prompt = `You are an autonomous agent. Use these actions:
<EXECUTE_CMD>command</EXECUTE_CMD> - Execute shell command
<WRITE_FILE>path</WRITE_FILE><CONTENT>content</CONTENT> - Write file
<READ_FILE>path</READ_FILE> - Read file
<TASK_COMPLETE> - When done

Task: ${input}

Think step by step. Use actions to accomplish the task. Always end with <TASK_COMPLETE>.`;

      this.activeProcess.stdin.write(prompt, 'utf8');
      this.activeProcess.stdin.end();
    });
  }

  parseActions(output) {
    const actions = [];
    
    const execMatch = output.match(/\u003cEXECUTE_CMD\u003e([\s\S]*?)\u003c\/EXECUTE_CMD\u003e/);
    if (execMatch) {
      actions.push({ type: 'EXECUTE_CMD', payload: execMatch[1].trim() });
    }

    const writeMatch = output.match(/\u003cWRITE_FILE\u003e([\s\S]*?)\u003c\/WRITE_FILE\u003e[\s\S]*?\u003cCONTENT\u003e([\s\S]*?)\u003c\/CONTENT\u003e/);
    if (writeMatch) {
      actions.push({ type: 'WRITE_FILE', path: writeMatch[1].trim(), content: writeMatch[2] });
    }

    const readMatch = output.match(/\u003cREAD_FILE\u003e([\s\S]*?)\u003c\/READ_FILE\u003e/);
    if (readMatch) {
      actions.push({ type: 'READ_FILE', path: readMatch[1].trim() });
    }

    return actions;
  }

  async executeAction(action) {
    try {
      switch (action.type) {
        case 'EXECUTE_CMD':
          console.log(`[EXEC] ${action.payload}`);
          const stdout = execSync(action.payload, { encoding: 'utf8', timeout: 30000 });
          return { success: true, output: stdout };

        case 'WRITE_FILE':
          console.log(`[WRITE] ${action.path}`);
          fs.mkdirSync(path.dirname(action.path), { recursive: true });
          fs.writeFileSync(action.path, action.content, 'utf8');
          return { success: true, output: `Wrote ${action.path}` };

        case 'READ_FILE':
          console.log(`[READ] ${action.path}`);
          if (!fs.existsSync(action.path)) {
            return { success: false, output: `File not found: ${action.path}` };
          }
          const content = fs.readFileSync(action.path, 'utf8');
          return { success: true, output: content };

        default:
          return { success: false, output: 'Unknown action' };
      }
    } catch (err) {
      return { success: false, output: err.message };
    }
  }

  buildObservationPrompt(previousOutput, observations) {
    let prompt = 'Previous actions:\n';
    for (const obs of observations) {
      prompt += `\nAction: ${obs.action.type}\n`;
      prompt += `Result: ${obs.result.success ? 'SUCCESS' : 'FAILED'}\n`;
      prompt += `Output: ${obs.result.output.substring(0, 2000)}\n`;
    }
    prompt += '\nContinue the task. Use actions or mark complete.';
    return prompt;
  }
}

module.exports = { ReActOrchestrator };
