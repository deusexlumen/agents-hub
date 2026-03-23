/**
 * Graph-Based Orchestrator v3.0
 * 
 * LangGraph-inspired graph-based orchestration for multi-agent systems
 * - Node-Edge architecture with explicit state transitions
 * - Cycle control with max_iterations guard
 * - Typed handovers with input/output contracts
 * - Checkpointing for fault tolerance
 * 
 * @module orchestrator
 * @version 3.0.0
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Logger } from './logger.js';
import { StatePersistence } from './state-persistence.js';

// Promisified utilities
const sleep = promisify(setTimeout);

// ============================================================================
// Graph State Management
// ============================================================================

/**
 * GlobalState - Thread-safe state container passed through all nodes
 */
export class GlobalState {
  constructor(sessionId, initialData = {}) {
    this.sessionId = sessionId;
    this.data = {
      iteration: 0,
      maxIterations: 50,
      visitedNodes: [],
      nodeResults: {},
      context: {},
      memory: [],
      errors: [],
      checkpointCount: 0,
      ...initialData
    };
    this.locks = new Map();
    this.logger = new Logger({ context: { sessionId } });
  }

  /**
   * Atomically update state
   */
  async update(updates) {
    const lockKey = 'state';
    while (this.locks.get(lockKey)) {
      await sleep(10);
    }
    
    this.locks.set(lockKey, true);
    try {
      this.data = {
        ...this.data,
        ...updates,
        lastUpdated: Date.now()
      };
      return { ...this.data };
    } finally {
      this.locks.delete(lockKey);
    }
  }

  /**
   * Get current state snapshot
   */
  get() {
    return { ...this.data };
  }

  /**
   * Record node execution
   */
  recordNodeVisit(nodeId, result) {
    this.data.visitedNodes.push({
      nodeId,
      timestamp: Date.now(),
      iteration: this.data.iteration
    });
    this.data.nodeResults[nodeId] = result;
  }

  /**
   * Detect cycles in execution path
   */
  detectCycle(nodeId, maxRevisits = 3) {
    const visits = this.data.visitedNodes.filter(v => v.nodeId === nodeId);
    return visits.length >= maxRevisits;
  }

  /**
   * Check if max iterations exceeded
   */
  isMaxIterationsExceeded() {
    return this.data.iteration >= this.data.maxIterations;
  }

  /**
   * Increment iteration counter
   */
  incrementIteration() {
    this.data.iteration++;
    return this.data.iteration;
  }

  /**
   * Add to memory
   */
  addMemory(entry) {
    this.data.memory.push({
      ...entry,
      timestamp: Date.now()
    });
    // Keep only last 100 entries
    if (this.data.memory.length > 100) {
      this.data.memory = this.data.memory.slice(-100);
    }
  }

  /**
   * Record error
   */
  recordError(error, nodeId = null) {
    this.data.errors.push({
      message: error.message,
      stack: error.stack,
      nodeId,
      timestamp: Date.now()
    });
  }
}

// ============================================================================
// Agent Node Definition
// ============================================================================

/**
 * AgentNode - Blueprint for an agent in the graph
 */
export class AgentNode {
  constructor(config) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.agentType = config.agentType || 'generic';
    this.action = config.action;
    this.inputSchema = config.inputSchema || null;
    this.outputSchema = config.outputSchema || null;
    this.timeout = config.timeout || 30000;
    this.retryCount = config.retryCount || 2;
    this.metadata = config.metadata || {};
    this.templates = config.templates || [];
    
    // Runtime tracking
    this.executionCount = 0;
    this.totalExecutionTime = 0;
    this.errors = [];
  }

  /**
   * Validate input against schema
   */
  validateInput(input) {
    if (!this.inputSchema) return { valid: true };
    
    try {
      const result = this.inputSchema.safeParse(input);
      if (result.success) {
        return { valid: true, data: result.data };
      }
      return {
        valid: false,
        errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
      };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  /**
   * Validate output against schema
   */
  validateOutput(output) {
    if (!this.outputSchema) return { valid: true };
    
    try {
      const result = this.outputSchema.safeParse(output);
      if (result.success) {
        return { valid: true, data: result.data };
      }
      return {
        valid: false,
        errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
      };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  /**
   * Execute node action
   */
  async execute(input, globalState, context = {}) {
    const startTime = Date.now();
    this.executionCount++;
    
    // Validate input
    const inputValidation = this.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(`Input validation failed: ${inputValidation.errors.join(', ')}`);
    }

    // Execute with retry
    let lastError;
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const result = await this._executeWithTimeout(
          this.action,
          inputValidation.data || input,
          globalState,
          context,
          this.timeout
        );

        // Validate output
        const outputValidation = this.validateOutput(result);
        if (!outputValidation.valid) {
          throw new Error(`Output validation failed: ${outputValidation.errors.join(', ')}`);
        }

        const executionTime = Date.now() - startTime;
        this.totalExecutionTime += executionTime;

        return {
          success: true,
          result: outputValidation.data || result,
          executionTime,
          attempt,
          nodeId: this.id
        };

      } catch (error) {
        lastError = error;
        if (attempt < this.retryCount) {
          await sleep(1000 * attempt); // Exponential backoff
        }
      }
    }

    this.errors.push({
      message: lastError.message,
      timestamp: Date.now(),
      input: JSON.stringify(input).slice(0, 500)
    });

    throw lastError;
  }

  async _executeWithTimeout(action, input, globalState, context, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Node execution timeout after ${timeout}ms`));
      }, timeout);

      Promise.resolve(action(input, globalState, context))
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

// ============================================================================
// Graph Edge Definition
// ============================================================================

/**
 * GraphEdge - Connection between nodes with conditional routing
 */
export class GraphEdge {
  constructor(fromNode, toNode, condition = null, metadata = {}) {
    this.id = `${fromNode}->${toNode}`;
    this.fromNode = fromNode;
    this.toNode = toNode;
    this.condition = condition; // Function: (result, globalState) => boolean
    this.metadata = metadata;
    this.executionCount = 0;
  }

  /**
   * Check if edge should be traversed
   */
  shouldTraverse(result, globalState) {
    if (!this.condition) return true;
    
    try {
      return this.condition(result, globalState);
    } catch (error) {
      console.error(`[GraphEdge] Condition evaluation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Record edge traversal
   */
  recordTraversal() {
    this.executionCount++;
  }
}

// ============================================================================
// Agent Graph
// ============================================================================

/**
 * AgentGraph - LangGraph-inspired stateful graph orchestrator
 */
export class AgentGraph {
  constructor(config = {}) {
    this.id = config.id || `graph_${Date.now()}`;
    this.name = config.name || 'AgentGraph';
    this.nodes = new Map();
    this.edges = new Map();
    this.entryPoint = null;
    this.endNodes = new Set();
    
    // State management
    this.globalState = null;
    this.statePersistence = new StatePersistence({
      stateDir: config.stateDir || './session_state'
    });
    
    // Logging
    this.logger = new Logger({
      context: { graphId: this.id },
      level: config.logLevel || 'info'
    });
    
    // Checkpointing
    this.checkpointInterval = config.checkpointInterval || 5;
    this.checkpointEnabled = config.checkpointEnabled !== false;
    
    // Execution tracking
    this.executionHistory = [];
    this.isRunning = false;
  }

  /**
   * Add a node to the graph
   */
  addNode(agentId, action, config = {}) {
    const node = new AgentNode({
      id: agentId,
      name: config.name || agentId,
      agentType: config.agentType || 'generic',
      action,
      inputSchema: config.inputSchema,
      outputSchema: config.outputSchema,
      timeout: config.timeout || 30000,
      retryCount: config.retryCount || 2,
      metadata: config.metadata || {},
      templates: config.templates || []
    });

    this.nodes.set(agentId, node);
    this.logger.info(`Node added: ${agentId}`, { nodeId: agentId, type: config.agentType });
    
    return this;
  }

  /**
   * Add an edge between nodes
   */
  addEdge(fromNodeId, toNodeId, condition = null, metadata = {}) {
    if (!this.nodes.has(fromNodeId)) {
      throw new Error(`Source node not found: ${fromNodeId}`);
    }
    if (!this.nodes.has(toNodeId)) {
      throw new Error(`Target node not found: ${toNodeId}`);
    }

    const edge = new GraphEdge(fromNodeId, toNodeId, condition, metadata);
    this.edges.set(edge.id, edge);
    
    this.logger.info(`Edge added: ${fromNodeId} -> ${toNodeId}`, {
      from: fromNodeId,
      to: toNodeId,
      conditional: !!condition
    });
    
    return this;
  }

  /**
   * Set the entry point for graph execution
   */
  setEntryPoint(nodeId) {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`Entry point node not found: ${nodeId}`);
    }
    this.entryPoint = nodeId;
    this.logger.info(`Entry point set: ${nodeId}`);
    return this;
  }

  /**
   * Mark a node as an end node
   */
  addEndNode(nodeId) {
    if (!this.nodes.has(nodeId)) {
      throw new Error(`End node not found: ${nodeId}`);
    }
    this.endNodes.add(nodeId);
    this.logger.info(`End node added: ${nodeId}`);
    return this;
  }

  /**
   * Initialize global state
   */
  initializeState(initialData = {}, sessionId = null) {
    const sid = sessionId || crypto.randomUUID();
    this.globalState = new GlobalState(sid, initialData);
    
    // Initialize session persistence
    this.statePersistence.initSession(
      `Graph execution: ${this.name}`,
      'graph-orchestration'
    );
    
    this.logger.info('Global state initialized', { sessionId: sid });
    return sid;
  }

  /**
   * Get outgoing edges from a node
   */
  getOutgoingEdges(nodeId) {
    const edges = [];
    for (const edge of this.edges.values()) {
      if (edge.fromNode === nodeId) {
        edges.push(edge);
      }
    }
    return edges;
  }

  /**
   * Get next nodes based on execution result
   */
  getNextNodes(currentNodeId, result) {
    const outgoingEdges = this.getOutgoingEdges(currentNodeId);
    const nextNodes = [];

    for (const edge of outgoingEdges) {
      if (edge.shouldTraverse(result, this.globalState)) {
        nextNodes.push({
          nodeId: edge.toNode,
          edge: edge
        });
      }
    }

    return nextNodes;
  }

  /**
   * Main graph execution - iterative with cycle detection
   */
  async execute(initialInput = {}, options = {}) {
    if (!this.entryPoint) {
      throw new Error('No entry point set. Call setEntryPoint() first.');
    }

    if (!this.globalState) {
      this.initializeState();
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    this.logger.info('Graph execution started', {
      graphId: this.id,
      entryPoint: this.entryPoint,
      sessionId: this.globalState.sessionId
    });

    // Initialize execution queue with entry point
    const queue = [{
      nodeId: this.entryPoint,
      input: initialInput,
      parentNode: null
    }];

    const results = [];

    try {
      while (queue.length > 0 && this.isRunning) {
        // Check max iterations
        const iteration = this.globalState.incrementIteration();
        
        if (this.globalState.isMaxIterationsExceeded()) {
          this.logger.error('Max iterations exceeded', { iteration });
          throw new Error(`Max iterations (${this.globalState.data.maxIterations}) exceeded`);
        }

        // Checkpoint if needed
        if (this.checkpointEnabled && iteration % this.checkpointInterval === 0) {
          await this._createCheckpoint(`iteration_${iteration}`);
        }

        // Process next node in queue
        const { nodeId, input, parentNode } = queue.shift();
        
        // Check for cycles
        if (this.globalState.detectCycle(nodeId, 3)) {
          this.logger.warn(`Cycle detected for node ${nodeId}, skipping`, { nodeId, iteration });
          this.globalState.recordError(new Error(`Cycle detected: ${nodeId}`), nodeId);
          continue;
        }

        // Execute node
        const node = this.nodes.get(nodeId);
        if (!node) {
          throw new Error(`Node not found: ${nodeId}`);
        }

        this.logger.info(`Executing node: ${nodeId}`, {
          nodeId,
          iteration,
          parentNode
        });

        let nodeResult;
        try {
          nodeResult = await node.execute(input, this.globalState, {
            graphId: this.id,
            iteration,
            parentNode
          });

          this.globalState.recordNodeVisit(nodeId, nodeResult);
          results.push(nodeResult);

          this.logger.info(`Node completed: ${nodeId}`, {
            nodeId,
            executionTime: nodeResult.executionTime,
            success: nodeResult.success
          });

        } catch (error) {
          this.logger.error(`Node execution failed: ${nodeId}`, {
            nodeId,
            error: error.message
          });
          
          this.globalState.recordError(error, nodeId);
          
          // Try to find error handling edge
          const errorEdges = this.getOutgoingEdges(nodeId).filter(e => 
            e.metadata?.errorHandler === true
          );
          
          if (errorEdges.length > 0) {
            for (const edge of errorEdges) {
              queue.push({
                nodeId: edge.toNode,
                input: { error: error.message, parentResult: null },
                parentNode: nodeId
              });
            }
            continue;
          }
          
          throw error;
        }

        // Check if end node
        if (this.endNodes.has(nodeId)) {
          this.logger.info(`End node reached: ${nodeId}`);
          break;
        }

        // Get next nodes
        const nextNodes = this.getNextNodes(nodeId, nodeResult);
        
        for (const { nodeId: nextNodeId, edge } of nextNodes) {
          edge.recordTraversal();
          queue.push({
            nodeId: nextNodeId,
            input: nodeResult.result,
            parentNode: nodeId
          });
        }

        // Log graph state
        this.executionHistory.push({
          iteration,
          nodeId,
          timestamp: Date.now(),
          queueLength: queue.length
        });
      }

      const totalTime = Date.now() - startTime;
      
      this.logger.info('Graph execution completed', {
        graphId: this.id,
        iterations: this.globalState.data.iteration,
        totalTime,
        nodesExecuted: results.length
      });

      return {
        success: true,
        results,
        finalState: this.globalState.get(),
        executionTime: totalTime,
        iterations: this.globalState.data.iteration
      };

    } catch (error) {
      this.logger.error('Graph execution failed', {
        error: error.message,
        iteration: this.globalState.data.iteration
      });

      // Create error checkpoint
      if (this.checkpointEnabled) {
        await this._createCheckpoint('error');
      }

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute graph asynchronously (non-blocking)
   */
  async executeAsync(initialInput = {}, options = {}) {
    return this.execute(initialInput, options);
  }

  /**
   * Stop graph execution
   */
  stop() {
    this.isRunning = false;
    this.logger.info('Graph execution stopped');
  }

  /**
   * Create checkpoint
   */
  async _createCheckpoint(reason) {
    try {
      const checkpointId = this.statePersistence.createCheckpoint(reason);
      this.globalState.data.checkpointCount++;
      
      this.logger.debug(`Checkpoint created: ${checkpointId}`, { reason });
      
      return checkpointId;
    } catch (error) {
      this.logger.error('Checkpoint creation failed', { error: error.message });
      return null;
    }
  }

  /**
   * Restore from checkpoint
   */
  async restoreCheckpoint(checkpointId) {
    try {
      const state = this.statePersistence.restoreCheckpoint(checkpointId);
      this.globalState = new GlobalState(state.metadata.session_id, state);
      
      this.logger.info(`Restored from checkpoint: ${checkpointId}`);
      
      return this.globalState;
    } catch (error) {
      this.logger.error('Checkpoint restore failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get graph status
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      entryPoint: this.entryPoint,
      endNodes: Array.from(this.endNodes),
      isRunning: this.isRunning,
      globalState: this.globalState?.get() || null,
      executionHistory: this.executionHistory.slice(-20)
    };
  }

  /**
   * Export graph definition
   */
  exportGraph() {
    const nodes = [];
    for (const [id, node] of this.nodes) {
      nodes.push({
        id: node.id,
        name: node.name,
        agentType: node.agentType,
        hasInputSchema: !!node.inputSchema,
        hasOutputSchema: !!node.outputSchema,
        metadata: node.metadata
      });
    }

    const edges = [];
    for (const [id, edge] of this.edges) {
      edges.push({
        id: edge.id,
        from: edge.fromNode,
        to: edge.toNode,
        conditional: !!edge.condition,
        metadata: edge.metadata,
        executionCount: edge.executionCount
      });
    }

    return {
      id: this.id,
      name: this.name,
      nodes,
      edges,
      entryPoint: this.entryPoint,
      endNodes: Array.from(this.endNodes)
    };
  }

  /**
   * Visualize graph (Mermaid format)
   */
  visualize() {
    let mermaid = 'graph TD\n';
    
    // Add nodes
    for (const [id, node] of this.nodes) {
      const shape = this.endNodes.has(id) ? '((END))' : 
                    id === this.entryPoint ? '[[ENTRY]]' : '[NODE]';
      mermaid += `  ${id}${shape}\n`;
    }
    
    // Add edges
    for (const edge of this.edges.values()) {
      const label = edge.condition ? '|conditional|' : '';
      mermaid += `  ${edge.fromNode} -->${label} ${edge.toNode}\n`;
    }
    
    return mermaid;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a conditional edge function
 */
export function createCondition(predicate) {
  return (result, globalState) => {
    try {
      return predicate(result, globalState);
    } catch (error) {
      console.error(`[Condition] Evaluation error: ${error.message}`);
      return false;
    }
  };
}

/**
 * Common conditions
 */
export const Conditions = {
  always: () => true,
  never: () => false,
  
  success: (result) => result?.success === true,
  failure: (result) => result?.success === false,
  
  confidenceAbove: (threshold) => (result) => 
    result?.result?.confidence >= threshold,
  
  confidenceBelow: (threshold) => (result) => 
    result?.result?.confidence < threshold,
  
  iterationBelow: (maxIter) => (result, globalState) => 
    globalState.data.iteration < maxIter,
  
  hasResult: (result) => result?.result != null,
  
  matchesPattern: (pattern) => (result) => {
    const str = JSON.stringify(result);
    return pattern.test(str);
  }
};

// ============================================================================
// Exports
// ============================================================================

export { GlobalState, AgentNode, GraphEdge };
export default AgentGraph;