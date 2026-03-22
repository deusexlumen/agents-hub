const { spawn } = require('child_process');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { Guardrails } = require('./resilient-ops');

// Promisified exec für asynchrone, nicht-blockierende Ausführung
const execAsync = promisify(exec);

// ============================================================================
// Token Estimation Utility
// ============================================================================

/**
 * Schätzt die Token-Anzahl eines Textes
 * Verwendet Zeichen-Heuristik: ~4 Zeichen pro Token
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Berechnet Gesamt-Token-Anzahl eines Context-Arrays
 */
function estimateContextTokens(contextArray) {
  if (!Array.isArray(contextArray)) return 0;
  
  let total = 0;
  for (const entry of contextArray) {
    if (entry.content) {
      total += estimateTokens(entry.content);
    }
    total += 4; // overhead für role/metadata
  }
  return total;
}

// ============================================================================
// Context Compression Utility
// ============================================================================

/**
 * Komprimiert Context durch Entfernung ältester Einträge
 * Bewahrt immer den ersten Eintrag (System Prompt)
 */
function compressContext(historyArray, maxTokens) {
  if (!Array.isArray(historyArray) || historyArray.length === 0) {
    return historyArray;
  }

  let currentTokens = estimateContextTokens(historyArray);
  
  if (currentTokens <= maxTokens) {
    return historyArray;
  }

  const compressed = [...historyArray];
  const systemPrompt = compressed[0];
  
  while (compressed.length > 1 && estimateContextTokens(compressed) > maxTokens) {
    const removed = compressed.splice(1, 1)[0];
    console.log(`[ContextCompression] Removed entry: ${removed.role || 'unknown'} (${estimateTokens(removed.content || '')} tokens)`);
  }

  console.log(`[ContextCompression] Compressed from ${currentTokens} to ${estimateContextTokens(compressed)} tokens (${historyArray.length} → ${compressed.length} entries)`);
  
  return compressed;
}

// ============================================================================
// ReAct Orchestrator - Vollständig Asynchron mit Retry & Sliding Window
// ============================================================================

class ReActOrchestrator {
  constructor(config = {}) {
    this.llmCommand = config.llmCommand || process.env.LLM_COMMAND || 'gemini-code';
    this.llmArgs = config.llmArgs || [];
    this.guardrails = new Guardrails(config.guardrails);
    
    // Context Window Management
    this.maxContextTokens = config.maxTokens || 4000;
    this.tokenReserve = config.tokenReserve || 500;
    this.effectiveMaxTokens = this.maxContextTokens - this.tokenReserve;
    
    // Sliding Window für History (max 10 Einträge)
    this.maxHistoryEntries = config.maxHistoryEntries || 10;
    this.contextHistory = [];
    this.systemPrompt = null;
    
    // Retry Konfiguration
    this.maxRetries = config.maxRetries || 3;
    this.baseDelay = config.baseDelay || 1000;
    
    this.activeProcess = null;
    this.iteration = 0;
  }

  /**
   * Haupt-Loop mit asynchroner, nicht-blockierender Ausführung
   */
  async runLoop(userInput) {
    this.iteration = 0;
    let isComplete = false;
    
    // Initialisiere Context mit System Prompt
    await this._initializeContext(userInput);

    while (!isComplete && this.iteration < this.guardrails.maxIterations) {
      this.iteration++;
      console.log(`\n[Iteration ${this.iteration}/${this.guardrails.maxIterations}]`);
      console.log(`[Context] ${estimateContextTokens(this.contextHistory)}/${this.maxContextTokens} tokens, ${this.contextHistory.length} entries`);
      
      // Context vor LLM-Call komprimieren
      this._compressContext();
      
      // LLM Call mit Retry
      let llmOutput;
      try {
        llmOutput = await this._executeWithRetry(
          () => this.spawnLLM(userInput),
          this.maxRetries
        );
      } catch (error) {
        console.error(`[Orchestrator] LLM call failed after retries: ${error.message}`);
        break;
      }
      
      // Füge LLM Output zur History hinzu (mit Sliding Window)
      this._addToHistory('assistant', llmOutput);
      
      if (llmOutput.includes('<TASK_COMPLETE>')) {
        isComplete = true;
        console.log('\n✓ Task completed');
        break;
      }

      // Parse Actions
      const actions = this.parseActions(llmOutput);
      
      if (actions.length === 0) {
        console.log('\n' + llmOutput.replace(/<[^>]+>/g, '').trim());
        break;
      }

      // Führe Actions asynchron aus
      const observations = [];
      for (const action of actions) {
        try {
          const result = await this._executeWithRetry(
            () => this.executeAction(action),
            this.maxRetries
          );
          observations.push({ action, result });
        } catch (error) {
          observations.push({ 
            action, 
            result: { success: false, output: error.message } 
          });
        }
      }

      // Baue Observation Prompt
      const observationPrompt = this.buildObservationPrompt(llmOutput, observations);
      
      // Füge Observation zur History hinzu (mit Sliding Window)
      this._addToHistory('user', observationPrompt);
    }

    if (this.iteration >= this.guardrails.maxIterations) {
      console.log('\n⚠ Max iterations reached');
    }
    
    console.log(`\n[Final Context] ${estimateContextTokens(this.contextHistory)}/${this.maxContextTokens} tokens, ${this.contextHistory.length} entries`);
  }

  /**
   * Initialisiert den Context mit System Prompt
   */
  async _initializeContext(userInput) {
    this.systemPrompt = {
      role: 'system',
      content: `You are an autonomous agent. Use these actions:
<EXECUTE_CMD>command</EXECUTE_CMD> - Execute shell command
<WRITE_FILE>path</WRITE_FILE><CONTENT>content</CONTENT> - Write file
<READ_FILE>path</READ_FILE> - Read file
<TASK_COMPLETE> - When done

Task: ${userInput}

Think step by step. Use actions to accomplish the task. Always end with <TASK_COMPLETE>.`
    };
    
    this.contextHistory = [this.systemPrompt];
    
    // Füge initialen Task als User Message hinzu
    this._addToHistory('user', `Task: ${userInput}`);
  }

  /**
   * Fügt Eintrag zur History hinzu mit Sliding Window (max 10 Einträge)
   */
  _addToHistory(role, content) {
    this.contextHistory.push({ role, content });
    
    // Sliding Window: Behalte nur die letzten maxHistoryEntries
    if (this.contextHistory.length > this.maxHistoryEntries) {
      // Entferne ältesten Eintrag nach System Prompt (Index 1)
      const removed = this.contextHistory.splice(1, 1)[0];
      console.log(`[SlidingWindow] Removed oldest entry: ${removed.role} (${estimateTokens(removed.content)} tokens)`);
    }
    
    // Sofort komprimieren wenn über Token-Limit
    const currentTokens = estimateContextTokens(this.contextHistory);
    if (currentTokens > this.effectiveMaxTokens) {
      console.log(`[Context] Token limit approaching (${currentTokens}/${this.effectiveMaxTokens}), compressing...`);
      this._compressContext();
    }
  }

  /**
   * Komprimiert Context vor LLM-Call
   */
  _compressContext() {
    const beforeTokens = estimateContextTokens(this.contextHistory);
    const beforeCount = this.contextHistory.length;
    
    this.contextHistory = compressContext(
      this.contextHistory, 
      this.effectiveMaxTokens
    );
    
    const afterTokens = estimateContextTokens(this.contextHistory);
    
    if (beforeCount !== this.contextHistory.length) {
      console.log(`[ContextCompression] ${beforeCount} → ${this.contextHistory.length} entries, ${beforeTokens} → ${afterTokens} tokens`);
    }
  }

  /**
   * Gibt optimierte History für LLM-Call zurück (max 10 Einträge, formatiert)
   */
  _getOptimizedHistory() {
    // Sicherstellen dass Context komprimiert ist
    this._compressContext();
    
    // Sliding Window: Max 10 Einträge
    let optimized = this.contextHistory;
    if (optimized.length > this.maxHistoryEntries) {
      const systemPrompt = optimized[0];
      const recent = optimized.slice(-(this.maxHistoryEntries - 1));
      optimized = [systemPrompt, ...recent];
    }
    
    // Formatiere für LLM
    const formatted = [];
    for (const entry of optimized) {
      switch (entry.role) {
        case 'system':
          formatted.push({
            role: 'system',
            content: entry.content
          });
          break;
        case 'user':
          formatted.push({
            role: 'user',
            content: entry.content.substring(0, 2000) // Limit content length
          });
          break;
        case 'assistant':
          formatted.push({
            role: 'assistant',
            content: entry.content.substring(0, 3000) // Allow more for assistant
          });
          break;
      }
    }
    
    return formatted;
  }

  /**
   * Führt Funktion mit Retry und Exponential Backoff aus
   * @param {Function} fn - Die auszuführende Funktion
   * @param {number} maxRetries - Maximale Anzahl Versuche
   * @returns {Promise} - Ergebnis der Funktion
   */
  async _executeWithRetry(fn, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Retry] Attempt ${attempt}/${maxRetries}`);
        return await fn();
      } catch (error) {
        lastError = error;
        console.warn(`[Retry] Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Exponential Backoff: 1s, 2s, 4s
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`[Retry] Waiting ${delay}ms before retry...`);
          await this._sleep(delay);
        }
      }
    }
    
    throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Sleep Utility für Backoff
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Asynchroner LLM Call mit Context-Kompression
   */
  async spawnLLM(input) {
    // Sicherstellen dass Context komprimiert ist
    this._compressContext();
    
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

      // Baue Prompt aus optimierter History
      const prompt = this._buildPromptFromHistory();

      this.activeProcess.stdin.write(prompt, 'utf8');
      this.activeProcess.stdin.end();
    });
  }

  /**
   * Baut den finalen Prompt aus der optimierten History
   */
  _buildPromptFromHistory() {
    const optimized = this._getOptimizedHistory();
    
    let prompt = '';
    
    for (const entry of optimized) {
      switch (entry.role) {
        case 'system':
          prompt += entry.content + '\n\n';
          break;
        case 'user':
          prompt += `User: ${entry.content}\n\n`;
          break;
        case 'assistant':
          prompt += `Assistant: ${entry.content}\n\n`;
          break;
      }
    }
    
    // Hinweis wenn Context komprimiert wurde
    if (this.iteration > this.maxHistoryEntries / 2) {
      prompt += '\n[Note: Earlier conversation history may have been summarized.]\n\n';
    }
    
    prompt += 'Continue:';
    
    return prompt;
  }

  /**
   * Parst Actions aus LLM Output
   */
  parseActions(output) {
    const actions = [];
    
    const execMatch = output.match(/<EXECUTE_CMD>([\s\S]*?)<\/EXECUTE_CMD>/);
    if (execMatch) {
      actions.push({ type: 'EXECUTE_CMD', payload: execMatch[1].trim() });
    }

    const writeMatch = output.match(/<WRITE_FILE>([\s\S]*?)<\/WRITE_FILE>[\s\S]*?<CONTENT>([\s\S]*?)<\/CONTENT>/);
    if (writeMatch) {
      actions.push({ type: 'WRITE_FILE', path: writeMatch[1].trim(), content: writeMatch[2] });
    }

    const readMatch = output.match(/<READ_FILE>([\s\S]*?)<\/READ_FILE>/);
    if (readMatch) {
      actions.push({ type: 'READ_FILE', path: readMatch[1].trim() });
    }

    return actions;
  }

  /**
   * Führt Action asynchron aus (NICHT-blockierend)
   */
  async executeAction(action) {
    try {
      switch (action.type) {
        case 'EXECUTE_CMD':
          console.log(`[EXEC] ${action.payload}`);
          // ASYNCHRON: execAsync statt execSync
          const { stdout } = await execAsync(action.payload, { 
            timeout: 30000,
            maxBuffer: 1024 * 1024 // 1MB
          });
          return { success: true, output: stdout };

        case 'WRITE_FILE':
          console.log(`[WRITE] ${action.path}`);
          // ASYNCHRON: fs.promises
          await fs.mkdir(path.dirname(action.path), { recursive: true });
          await fs.writeFile(action.path, action.content, 'utf8');
          return { success: true, output: `Wrote ${action.path}` };

        case 'READ_FILE':
          console.log(`[READ] ${action.path}`);
          // ASYNCHRON: fs.promises
          try {
            const content = await fs.readFile(action.path, 'utf8');
            return { success: true, output: content };
          } catch (err) {
            if (err.code === 'ENOENT') {
              return { success: false, output: `File not found: ${action.path}` };
            }
            throw err;
          }

        default:
          return { success: false, output: 'Unknown action' };
      }
    } catch (err) {
      return { success: false, output: err.message };
    }
  }

  /**
   * Baut Observation Prompt
   */
  buildObservationPrompt(previousOutput, observations) {
    let prompt = 'Previous actions:\n';
    for (const obs of observations) {
      prompt += `\nAction: ${obs.action.type}\n`;
      prompt += `Result: ${obs.result.success ? 'SUCCESS' : 'FAILED'}\n`;
      // Limit output length
      const output = obs.result.output.substring(0, 1000);
      prompt += `Output: ${output}${obs.result.output.length > 1000 ? '...' : ''}\n`;
    }
    prompt += '\nContinue the task. Use actions or mark complete.';
    return prompt;
  }

  /**
   * Gibt Context-Status zurück
   */
  getContextStatus() {
    return {
      tokens: estimateContextTokens(this.contextHistory),
      maxTokens: this.maxContextTokens,
      effectiveMaxTokens: this.effectiveMaxTokens,
      entries: this.contextHistory.length,
      maxHistoryEntries: this.maxHistoryEntries,
      utilization: (estimateContextTokens(this.contextHistory) / this.maxContextTokens * 100).toFixed(1) + '%',
      iterations: this.iteration
    };
  }

  /**
   * Manuelle Context-Kompression
   */
  forceCompress() {
    this._compressContext();
    return this.getContextStatus();
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = { 
  ReActOrchestrator,
  estimateTokens,
  estimateContextTokens,
  compressContext
};