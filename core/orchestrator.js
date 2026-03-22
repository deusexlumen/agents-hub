const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Guardrails } = require('./resilient-ops');

// ============================================================================
// Token Estimation Utility
// ============================================================================

/**
 * Schätzt die Token-Anzahl eines Textes
 * Verwendet Zeichen-Heuristik: ~4 Zeichen pro Token (GPT/Claude Durchschnitt)
 * 
 * @param {string} text - Der zu analysierende Text
 * @returns {number} - Geschätzte Token-Anzahl
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  // Konservative Schätzung: 4 Zeichen ≈ 1 Token
  // Dies deckt die meisten Sprachen ab, inkl. Code mit vielen Symbolen
  return Math.ceil(text.length / 4);
}

/**
 * Berechnet Gesamt-Token-Anzahl eines Context-Arrays
 * 
 * @param {Array} contextArray - Array von {role, content} Objekten
 * @returns {number} - Geschätzte Gesamt-Token
 */
function estimateContextTokens(contextArray) {
  if (!Array.isArray(contextArray)) return 0;
  
  let total = 0;
  for (const entry of contextArray) {
    if (entry.content) {
      total += estimateTokens(entry.content);
    }
    // overhead für role/metadata (ca. 4 tokens pro message)
    total += 4;
  }
  return total;
}

// ============================================================================
// Context Compression Utility
// ============================================================================

/**
 * Komprimiert Context durch Entfernung ältester Einträge
 * Bewahrt immer den ersten Eintrag (System Prompt)
 * 
 * Strategie:
 * 1. System Prompt (Index 0) wird NIEMALS entfernt
 * 2. Entferne älteste Observation/Action Paare zuerst
 * 3. Wenn nötig, fasse mehrere Einträge zusammen
 * 
 * @param {Array} historyArray - Array von Context-Einträgen
 * @param {number} maxTokens - Maximale Token-Anzahl
 * @returns {Array} - Komprimierter Context
 */
function compressContext(historyArray, maxTokens) {
  if (!Array.isArray(historyArray) || historyArray.length === 0) {
    return historyArray;
  }

  // Berechne aktuelle Token-Anzahl
  let currentTokens = estimateContextTokens(historyArray);
  
  // Wenn unter Limit, nichts tun
  if (currentTokens <= maxTokens) {
    return historyArray;
  }

  // Kopie erstellen (System Prompt an Index 0 beibehalten)
  const compressed = [...historyArray];
  const systemPrompt = compressed[0];
  const systemTokens = estimateTokens(systemPrompt.content || '') + 4;
  
  // Verfügbare Tokens für den Rest
  const availableTokens = maxTokens - systemTokens - 100; // 100 Puffer
  
  if (availableTokens <= 0) {
    // Edge case: System Prompt allein zu groß
    console.warn('[ContextCompression] System prompt exceeds token limit');
    return [systemPrompt];
  }

  // Entferne älteste Einträge (ab Index 1) bis unter Limit
  while (compressed.length > 1 && estimateContextTokens(compressed) > maxTokens) {
    // Entferne Eintrag an Index 1 (ältester nach System Prompt)
    const removed = compressed.splice(1, 1)[0];
    console.log(`[ContextCompression] Removed entry: ${removed.role || 'unknown'} (${estimateTokens(removed.content || '')} tokens)`);
  }

  // Wenn immer noch über Limit, fasse verbleibende zusammen
  if (estimateContextTokens(compressed) > maxTokens && compressed.length > 2) {
    return aggressiveCompression(compressed, maxTokens);
  }

  console.log(`[ContextCompression] Compressed from ${currentTokens} to ${estimateContextTokens(compressed)} tokens (${historyArray.length} → ${compressed.length} entries)`);
  
  return compressed;
}

/**
 * Aggressive Kompression: Fasst mehrere Einträge zusammen
 */
function aggressiveCompression(historyArray, maxTokens) {
  const systemPrompt = historyArray[0];
  const rest = historyArray.slice(1);
  
  // Gruppiere in Paare (User/Assistant) und fasse zusammen
  const summarized = [];
  let buffer = '';
  
  for (let i = 0; i < rest.length; i++) {
    const entry = rest[i];
    const text = `[${entry.role || 'unknown'}]: ${(entry.content || '').substring(0, 500)}...\n`;
    
    if (estimateTokens(buffer + text) > 500 && buffer.length > 0) {
      // Speichere Buffer und starte neu
      summarized.push({
        role: 'assistant',
        content: `Previous interactions summary:\n${buffer}`
      });
      buffer = text;
    } else {
      buffer += text;
    }
  }
  
  if (buffer.length > 0) {
    summarized.push({
      role: 'assistant', 
      content: `Previous interactions summary:\n${buffer}`
    });
  }

  const result = [systemPrompt, ...summarized];
  console.log(`[ContextCompression] Aggressive compression: ${historyArray.length} → ${result.length} entries`);
  
  return result;
}

// ============================================================================
// ReAct Orchestrator mit Context Window Management
// ============================================================================

class ReActOrchestrator {
  constructor(config = {}) {
    this.llmCommand = config.llmCommand || process.env.LLM_COMMAND || 'gemini-code';
    this.llmArgs = config.llmArgs || [];
    this.guardrails = new Guardrails(config.guardrails);
    
    // Context Window Management
    this.maxContextTokens = config.maxTokens || 4000;
    this.tokenReserve = config.tokenReserve || 500; // Reserve für Antwort
    this.effectiveMaxTokens = this.maxContextTokens - this.tokenReserve;
    
    this.activeProcess = null;
    this.iteration = 0;
    
    // Context History für Sliding Window
    this.contextHistory = [];
    this.systemPrompt = null;
    this.maxHistoryEntries = config.maxHistoryEntries || 20;
  }

  /**
   * Haupt-Loop mit Context-Kompression
   */
  async runLoop(userInput) {
    this.iteration = 0;
    let currentInput = userInput;
    let isComplete = false;
    
    // Initialisiere Context mit System Prompt
    this._initializeContext(userInput);

    while (!isComplete && this.iteration < this.guardrails.maxIterations) {
      this.iteration++;
      console.log(`\n[Iteration ${this.iteration}/${this.guardrails.maxIterations}]`);
      console.log(`[Context] ${estimateContextTokens(this.contextHistory)}/${this.maxContextTokens} tokens`);
      
      // Context vor LLM-Call komprimieren
      this._compressContext();
      
      const llmOutput = await this.spawnLLM(currentInput);
      
      // Füge LLM Output zur History hinzu
      this._addToHistory('assistant', llmOutput);
      
      if (llmOutput.includes('<TASK_COMPLETE>')) {
        isComplete = true;
        console.log('\n✓ Task completed');
        break;
      }

      const actions = this.parseActions(llmOutput);
      
      if (actions.length === 0) {
        console.log('\n' + llmOutput.replace(/<[^>]+>/g, '').trim());
        break;
      }

      const observations = [];
      for (const action of actions) {
        const result = await this.executeAction(action);
        observations.push({ action, result });
      }

      currentInput = this.buildObservationPrompt(llmOutput, observations);
      
      // Füge Observation zur History hinzu
      this._addToHistory('user', currentInput);
    }

    if (this.iteration >= this.guardrails.maxIterations) {
      console.log('\n⚠ Max iterations reached');
    }
    
    // Finaler Context-Report
    console.log(`\n[Final Context] ${estimateContextTokens(this.contextHistory)}/${this.maxContextTokens} tokens, ${this.contextHistory.length} entries`);
  }

  /**
   * Initialisiert den Context mit System Prompt
   */
  _initializeContext(userInput) {
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
   * Fügt Eintrag zur History hinzu mit Größen-Check
   */
  _addToHistory(role, content) {
    this.contextHistory.push({ role, content });
    
    // Sofort komprimieren wenn über Limit
    const currentTokens = estimateContextTokens(this.contextHistory);
    if (currentTokens > this.effectiveMaxTokens) {
      console.log(`[Context] Token limit approaching (${currentTokens}/${this.effectiveMaxTokens}), compressing...`);
      this._compressContext();
    }
  }

  /**
   * Komprimiert Context vor LLM-Call
   * WICHTIG: Wird vor JEDEM LLM-Call aufgerufen
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
   * LLM Call mit Context-Kompression vor dem Senden
   */
  spawnLLM(input) {
    return new Promise((resolve, reject) => {
      // Sicherstellen dass Context komprimiert ist
      this._compressContext();
      
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

      // Baue Prompt aus Context History
      const prompt = this._buildPromptFromHistory();

      this.activeProcess.stdin.write(prompt, 'utf8');
      this.activeProcess.stdin.end();
    });
  }

  /**
   * Baut den finalen Prompt aus der Context History
   */
  _buildPromptFromHistory() {
    // Letzte Sicherheits-Kompression
    this._compressContext();
    
    let prompt = '';
    
    for (const entry of this.contextHistory) {
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
    
    // Füge Hinweis hinzu wenn Context komprimiert wurde
    if (this.contextHistory.length < this.iteration * 2 + 1) {
      prompt += '\n[Note: Earlier parts of this conversation were summarized due to length constraints.]\n\n';
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
   * Führt Action aus
   */
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

  /**
   * Baut Observation Prompt
   */
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

  /**
   * Gibt Context-Status zurück
   */
  getContextStatus() {
    return {
      tokens: estimateContextTokens(this.contextHistory),
      maxTokens: this.maxContextTokens,
      effectiveMaxTokens: this.effectiveMaxTokens,
      entries: this.contextHistory.length,
      utilization: (estimateContextTokens(this.contextHistory) / this.maxContextTokens * 100).toFixed(1) + '%',
      iterations: this.iteration
    };
  }

  /**
   * Manuelle Context-Kompression (für externe Nutzung)
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