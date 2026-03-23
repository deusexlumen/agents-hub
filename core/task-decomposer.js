/**
 * Task Decomposer v3.0 - Graph-Based Output
 * 
 * Decomposes large tasks into graph-based execution plans
 * Output: Graph Definition (Nodes & Edges) statt Arrays
 * 
 * @module task-decomposer
 * @version 3.0.0
 */

import { AgentGraph, AgentNode, GraphEdge, Conditions, createCondition } from './orchestrator.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Complexity threshold (hours) for decomposition
  COMPLEXITY_THRESHOLD: 8,
  
  // Maximum sub-tasks per decomposition
  MAX_SUBTASKS: 10,
  
  // Minimum sub-task duration (minutes)
  MIN_DURATION_MINUTES: 15,
  
  // Maximum sub-task duration (hours)
  MAX_DURATION_HOURS: 4,
  
  // Complexity keywords for estimation
  COMPLEXITY_INDICATORS: {
    high: [
      'architektur', 'architecture', 'refactor', 'umbauen', 'redesign',
      'migration', 'integration', 'framework', 'platform', 'backend',
      'datenbank', 'database', 'security', 'authentication', 'auth'
    ],
    medium: [
      'api', 'endpoint', 'component', 'modul', 'module', 'feature',
      'funktion', 'implementation', 'schnittstelle', 'interface'
    ],
    low: [
      'fix', 'bug', 'typo', 'dokumentation', 'documentation', 'test',
      'style', 'format', 'rename', 'cleanup', 'refactor klein'
    ]
  },
  
  // Task type patterns
  TASK_PATTERNS: {
    development: [
      /implement|build|create|develop|code|schreiben|erstellen/i,
      /feature|funktion|komponente|component/i
    ],
    bugfix: [
      /fix|bug|issue|problem|fehler|beheben/i
    ],
    refactoring: [
      /refactor|umbauen|optimieren|cleanup|restructure/i
    ],
    research: [
      /research|analyze|investigate|untersuchen|analysieren/i
    ],
    documentation: [
      /document|doc|readme|dokumentation|beschreibung/i
    ],
    testing: [
      /test|testing|spec|unittest|integration test|e2e/i
    ]
  },

  // Agent type mapping for nodes
  AGENT_TYPES: {
    analysis: 'analyzer',
    design: 'architect',
    implementation: 'developer',
    testing: 'tester',
    documentation: 'writer',
    review: 'reviewer',
    planning: 'planner',
    research: 'researcher',
    evaluation: 'evaluator',
    preparation: 'setup',
    execution: 'executor',
    verification: 'verifier',
    investigation: 'investigator',
    writing: 'writer',
    finalization: 'finalizer',
    setup: 'setup'
  }
};

// ============================================================================
// Graph-Based Task Decomposer
// ============================================================================

/**
 * TaskDecomposer - Creates graph-based execution plans
 */
export class TaskDecomposer {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Main Decomposition - Returns Graph Definition
  // -------------------------------------------------------------------------

  /**
   * Decompose a task into a graph-based execution plan
   * @param {string} task - Task description
   * @param {Object} options - Decomposition options
   * @returns {Object} Graph definition with nodes and edges
   */
  async decompose(task, options = {}) {
    try {
      // Analyze task complexity
      const complexity = this._analyzeComplexity(task);
      
      // Determine if decomposition is needed
      if (complexity.estimatedHours < this.config.COMPLEXITY_THRESHOLD && !options.force) {
        return this._createSimpleGraph(task, complexity);
      }
      
      // Generate graph-based decomposition
      const graphDef = this._generateGraphDefinition(task, complexity, options);
      
      return {
        task,
        complexity: complexity.level,
        estimatedHours: complexity.estimatedHours,
        needsDecomposition: true,
        graph: graphDef,
        summary: this._generateSummary(graphDef)
      };
      
    } catch (error) {
      console.error('[TaskDecomposer] Decomposition failed:', error);
      throw error;
    }
  }

  /**
   * Create a simple single-node graph for non-decomposed tasks
   */
  _createSimpleGraph(task, complexity) {
    const graphDef = {
      id: `graph_${Date.now()}`,
      name: 'Simple Task Graph',
      nodes: [
        {
          id: 'executor',
          name: 'Task Executor',
          agentType: 'executor',
          type: 'implementation',
          description: task,
          estimate: { hours: complexity.estimatedHours, minutes: 0 },
          metadata: { complexity: complexity.level }
        }
      ],
      edges: [],
      entryPoint: 'executor',
      endNodes: ['executor']
    };

    return {
      task,
      complexity: complexity.level,
      estimatedHours: complexity.estimatedHours,
      needsDecomposition: false,
      reason: 'Task below complexity threshold',
      graph: graphDef
    };
  }

  /**
   * Generate full graph definition from task
   */
  _generateGraphDefinition(task, complexity, options) {
    const taskType = this._detectTaskType(task);
    
    // Generate nodes based on task type
    const nodes = this._generateNodes(task, complexity, taskType);
    
    // Generate edges with conditions
    const edges = this._generateEdges(nodes, taskType);
    
    // Determine entry point and end nodes
    const entryPoint = nodes[0]?.id;
    const endNodes = this._determineEndNodes(nodes);

    return {
      id: `graph_${Date.now()}_${taskType}`,
      name: `${taskType.charAt(0).toUpperCase() + taskType.slice(1)} Task Graph`,
      nodes,
      edges,
      entryPoint,
      endNodes,
      metadata: {
        taskType,
        complexity: complexity.level,
        estimatedHours: complexity.estimatedHours,
        totalNodes: nodes.length,
        conditionalEdges: edges.filter(e => e.conditional).length
      }
    };
  }

  // -------------------------------------------------------------------------
  // Node Generation
  // -------------------------------------------------------------------------

  /**
   * Generate nodes based on task type
   */
  _generateNodes(task, complexity, taskType) {
    switch (taskType) {
      case 'development':
        return this._generateDevelopmentNodes(task, complexity);
      case 'bugfix':
        return this._generateBugfixNodes(task, complexity);
      case 'refactoring':
        return this._generateRefactoringNodes(task, complexity);
      case 'research':
        return this._generateResearchNodes(task, complexity);
      case 'documentation':
        return this._generateDocumentationNodes(task, complexity);
      case 'testing':
        return this._generateTestingNodes(task, complexity);
      default:
        return this._generateGenericNodes(task, complexity);
    }
  }

  /**
   * Generate development nodes
   */
  _generateDevelopmentNodes(task, complexity) {
    return [
      {
        id: 'requirements_analysis',
        name: 'Requirements Analysis',
        agentType: this.config.AGENT_TYPES.analysis,
        type: 'analysis',
        description: `Analyze requirements for: ${task}`,
        estimate: { hours: 1, minutes: 0 },
        inputSchema: { type: 'object', properties: { task: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { requirements: { type: 'array' } } },
        metadata: { phase: 'discovery' }
      },
      {
        id: 'architecture_design',
        name: 'Architecture Design',
        agentType: this.config.AGENT_TYPES.design,
        type: 'design',
        description: 'Design solution architecture and component structure',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.15, 2), minutes: 0 },
        inputSchema: { type: 'object', properties: { requirements: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { architecture: { type: 'object' } } },
        metadata: { phase: 'planning' }
      },
      {
        id: 'core_implementation',
        name: 'Core Implementation',
        agentType: this.config.AGENT_TYPES.implementation,
        type: 'implementation',
        description: 'Implement core functionality',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        inputSchema: { type: 'object', properties: { architecture: { type: 'object' } } },
        outputSchema: { type: 'object', properties: { code: { type: 'string' }, tests: { type: 'array' } } },
        metadata: { phase: 'execution' }
      },
      {
        id: 'code_review',
        name: 'Code Review',
        agentType: this.config.AGENT_TYPES.review,
        type: 'review',
        description: 'Review implementation for quality and correctness',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.1, 1), minutes: 0 },
        inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { approved: { type: 'boolean' }, feedback: { type: 'string' } } },
        metadata: { phase: 'review' }
      },
      {
        id: 'testing',
        name: 'Testing',
        agentType: this.config.AGENT_TYPES.testing,
        type: 'testing',
        estimate: { hours: Math.max(complexity.estimatedHours * 0.2, 1), minutes: 0 },
        inputSchema: { type: 'object', properties: { code: { type: 'string' }, tests: { type: 'array' } } },
        outputSchema: { type: 'object', properties: { passed: { type: 'boolean' }, coverage: { type: 'number' } } },
        metadata: { phase: 'verification' }
      },
      {
        id: 'documentation',
        name: 'Documentation',
        agentType: this.config.AGENT_TYPES.documentation,
        type: 'documentation',
        description: 'Document implementation and usage',
        estimate: { hours: 1, minutes: 0 },
        inputSchema: { type: 'object', properties: { code: { type: 'string' }, architecture: { type: 'object' } } },
        outputSchema: { type: 'object', properties: { docs: { type: 'string' } } },
        metadata: { phase: 'delivery' }
      },
      {
        id: 'final_review',
        name: 'Final Review',
        agentType: this.config.AGENT_TYPES.review,
        type: 'review',
        description: 'Final code review and refinements',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.1, 1), minutes: 0 },
        inputSchema: { type: 'object', properties: { code: { type: 'string' }, docs: { type: 'string' }, testResults: { type: 'object' } } },
        outputSchema: { type: 'object', properties: { approved: { type: 'boolean' } } },
        metadata: { phase: 'review' }
      }
    ];
  }

  /**
   * Generate bugfix nodes
   */
  _generateBugfixNodes(task, complexity) {
    return [
      {
        id: 'bug_analysis',
        name: 'Bug Analysis',
        agentType: this.config.AGENT_TYPES.analysis,
        type: 'analysis',
        description: `Reproduce and analyze bug: ${task}`,
        estimate: { hours: 0, minutes: 30 },
        metadata: { phase: 'discovery' }
      },
      {
        id: 'root_cause',
        name: 'Root Cause Investigation',
        agentType: this.config.AGENT_TYPES.investigation,
        type: 'investigation',
        description: 'Identify root cause of the issue',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'analysis' }
      },
      {
        id: 'fix_implementation',
        name: 'Fix Implementation',
        agentType: this.config.AGENT_TYPES.implementation,
        type: 'implementation',
        description: 'Implement bug fix',
        estimate: { hours: complexity.estimatedHours * 0.4, minutes: 0 },
        metadata: { phase: 'execution' }
      },
      {
        id: 'fix_verification',
        name: 'Fix Verification',
        agentType: this.config.AGENT_TYPES.testing,
        type: 'testing',
        description: 'Verify fix and run regression tests',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'verification' }
      }
    ];
  }

  /**
   * Generate refactoring nodes
   */
  _generateRefactoringNodes(task, complexity) {
    return [
      {
        id: 'state_analysis',
        name: 'Current State Analysis',
        agentType: this.config.AGENT_TYPES.analysis,
        type: 'analysis',
        description: 'Analyze current implementation',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'discovery' }
      },
      {
        id: 'refactoring_plan',
        name: 'Refactoring Plan',
        agentType: this.config.AGENT_TYPES.planning,
        type: 'planning',
        description: 'Plan refactoring steps and identify risks',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'planning' }
      },
      {
        id: 'backup',
        name: 'Backup Current State',
        agentType: this.config.AGENT_TYPES.preparation,
        type: 'preparation',
        description: 'Create backup or checkpoint before refactoring',
        estimate: { hours: 0, minutes: 15 },
        metadata: { phase: 'preparation' }
      },
      {
        id: 'core_refactoring',
        name: 'Core Refactoring',
        agentType: this.config.AGENT_TYPES.implementation,
        type: 'implementation',
        description: 'Execute main refactoring',
        estimate: { hours: complexity.estimatedHours * 0.6, minutes: 0 },
        metadata: { phase: 'execution' }
      },
      {
        id: 'verification',
        name: 'Verification',
        agentType: this.config.AGENT_TYPES.testing,
        type: 'testing',
        description: 'Verify functionality after refactoring',
        estimate: { hours: Math.max(complexity.estimatedHours * 0.2, 1), minutes: 0 },
        metadata: { phase: 'verification' }
      }
    ];
  }

  /**
   * Generate research nodes
   */
  _generateResearchNodes(task, complexity) {
    return [
      {
        id: 'initial_research',
        name: 'Initial Research',
        agentType: this.config.AGENT_TYPES.research,
        type: 'research',
        description: 'Gather initial information and resources',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'discovery' }
      },
      {
        id: 'deep_dive',
        name: 'Deep Dive Analysis',
        agentType: this.config.AGENT_TYPES.analysis,
        type: 'analysis',
        description: 'In-depth analysis of findings',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        metadata: { phase: 'analysis' }
      },
      {
        id: 'evaluation',
        name: 'Comparison & Evaluation',
        agentType: this.config.AGENT_TYPES.evaluation,
        type: 'evaluation',
        description: 'Compare options and evaluate approaches',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.25, 2), minutes: 0 },
        metadata: { phase: 'evaluation' }
      },
      {
        id: 'research_docs',
        name: 'Documentation',
        agentType: this.config.AGENT_TYPES.documentation,
        type: 'documentation',
        description: 'Document research findings and recommendations',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.15, 2), minutes: 0 },
        metadata: { phase: 'delivery' }
      }
    ];
  }

  /**
   * Generate documentation nodes
   */
  _generateDocumentationNodes(task, complexity) {
    return [
      {
        id: 'structure_planning',
        name: 'Structure Planning',
        agentType: this.config.AGENT_TYPES.planning,
        type: 'planning',
        description: 'Plan documentation structure and outline',
        estimate: { hours: 0, minutes: 30 },
        metadata: { phase: 'planning' }
      },
      {
        id: 'draft_content',
        name: 'Draft Content',
        agentType: this.config.AGENT_TYPES.writing,
        type: 'writing',
        description: 'Write documentation draft',
        estimate: { hours: complexity.estimatedHours * 0.6, minutes: 0 },
        metadata: { phase: 'execution' }
      },
      {
        id: 'review_edit',
        name: 'Review & Edit',
        agentType: this.config.AGENT_TYPES.review,
        type: 'review',
        description: 'Review and refine documentation',
        estimate: { hours: complexity.estimatedHours * 0.25, minutes: 0 },
        metadata: { phase: 'review' }
      },
      {
        id: 'finalization',
        name: 'Finalization',
        agentType: this.config.AGENT_TYPES.finalization,
        type: 'finalization',
        description: 'Final formatting and publishing',
        estimate: { hours: complexity.estimatedHours * 0.1, minutes: 0 },
        metadata: { phase: 'delivery' }
      }
    ];
  }

  /**
   * Generate testing nodes
   */
  _generateTestingNodes(task, complexity) {
    return [
      {
        id: 'test_planning',
        name: 'Test Planning',
        agentType: this.config.AGENT_TYPES.planning,
        type: 'planning',
        description: 'Define test strategy and scenarios',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'planning' }
      },
      {
        id: 'test_env_setup',
        name: 'Test Environment Setup',
        agentType: this.config.AGENT_TYPES.setup,
        type: 'setup',
        description: 'Set up test environment and fixtures',
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'preparation' }
      },
      {
        id: 'test_implementation',
        name: 'Test Implementation',
        agentType: this.config.AGENT_TYPES.implementation,
        type: 'implementation',
        description: 'Write test cases and scenarios',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        metadata: { phase: 'execution' }
      },
      {
        id: 'test_execution',
        name: 'Test Execution',
        agentType: this.config.AGENT_TYPES.execution,
        type: 'execution',
        description: 'Run tests and collect results',
        estimate: { hours: complexity.estimatedHours * 0.25, minutes: 0 },
        metadata: { phase: 'execution' }
      },
      {
        id: 'results_analysis',
        name: 'Results Analysis',
        agentType: this.config.AGENT_TYPES.analysis,
        type: 'analysis',
        description: 'Analyze test results and report issues',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.15, 1), minutes: 0 },
        metadata: { phase: 'review' }
      }
    ];
  }

  /**
   * Generate generic nodes
   */
  _generateGenericNodes(task, complexity) {
    return [
      {
        id: 'analysis',
        name: 'Analysis',
        agentType: this.config.AGENT_TYPES.analysis,
        type: 'analysis',
        description: `Analyze task requirements: ${task}`,
        estimate: { hours: 1, minutes: 0 },
        metadata: { phase: 'discovery' }
      },
      {
        id: 'planning',
        name: 'Planning',
        agentType: this.config.AGENT_TYPES.planning,
        type: 'planning',
        description: 'Create implementation plan',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.2, 2), minutes: 0 },
        metadata: { phase: 'planning' }
      },
      {
        id: 'implementation',
        name: 'Implementation',
        agentType: this.config.AGENT_TYPES.implementation,
        type: 'implementation',
        description: 'Execute implementation',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        metadata: { phase: 'execution' }
      },
      {
        id: 'verification',
        name: 'Verification',
        agentType: this.config.AGENT_TYPES.testing,
        type: 'verification',
        description: 'Verify and test implementation',
        estimate: { hours: Math.max(complexity.estimatedHours * 0.2, 1), minutes: 0 },
        metadata: { phase: 'verification' }
      }
    ];
  }

  // -------------------------------------------------------------------------
  // Edge Generation
  // -------------------------------------------------------------------------

  /**
   * Generate edges between nodes with conditions
   */
  _generateEdges(nodes, taskType) {
    const edges = [];
    
    // Create sequential edges with conditions
    for (let i = 0; i < nodes.length - 1; i++) {
      const fromNode = nodes[i];
      const toNode = nodes[i + 1];
      
      // Add conditional retry edges for review nodes
      if (fromNode.type === 'review' || fromNode.type === 'testing') {
        // Success path
        edges.push({
          id: `${fromNode.id}_to_${toNode.id}`,
          from: fromNode.id,
          to: toNode.id,
          conditional: true,
          condition: 'success',
          conditionFn: 'result.success === true || result.result?.approved === true',
          metadata: { path: 'success' }
        });
        
        // Failure/retry path - go back to implementation
        const implNode = nodes.find(n => n.type === 'implementation');
        if (implNode && implNode.id !== fromNode.id) {
          edges.push({
            id: `${fromNode.id}_retry_${implNode.id}`,
            from: fromNode.id,
            to: implNode.id,
            conditional: true,
            condition: 'failure',
            conditionFn: 'result.success === false || result.result?.approved === false',
            metadata: { path: 'retry', maxRetries: 3 }
          });
        }
      } else {
        // Regular sequential edge
        edges.push({
          id: `${fromNode.id}_to_${toNode.id}`,
          from: fromNode.id,
          to: toNode.id,
          conditional: false,
          metadata: { path: 'sequential' }
        });
      }
    }
    
    // Add parallel edges for independent nodes
    const parallelGroups = this._identifyParallelGroups(nodes);
    for (const group of parallelGroups) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          // Check if edge already exists
          const existing = edges.find(e => e.from === group[0].id && e.to === group[i].id);
          if (!existing) {
            edges.push({
              id: `parallel_${group[0].id}_to_${group[i].id}`,
              from: group[0].id,
              to: group[i].id,
              conditional: false,
              metadata: { path: 'parallel' }
            });
          }
        }
      }
    }
    
    return edges;
  }

  /**
   * Identify nodes that can run in parallel
   */
  _identifyParallelGroups(nodes) {
    const groups = [];
    let currentGroup = [];
    
    for (const node of nodes) {
      if (node.type === 'documentation' || node.type === 'testing') {
        // These can run in parallel with implementation
        if (currentGroup.length === 0) {
          currentGroup.push(node);
        } else {
          // Start new group
          if (currentGroup.length > 0) groups.push([...currentGroup]);
          currentGroup = [node];
        }
      } else {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup = [];
        }
        groups.push([node]);
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * Determine end nodes
   */
  _determineEndNodes(nodes) {
    // Last node is always an end node
    const endNodes = [nodes[nodes.length - 1]?.id];
    
    // Also mark verification/testing nodes as potential end nodes
    const verifyNodes = nodes
      .filter(n => n.type === 'verification' || n.type === 'testing' || n.type === 'review')
      .map(n => n.id);
    
    return [...new Set([...endNodes, ...verifyNodes])];
  }

  // -------------------------------------------------------------------------
  // Legacy Compatibility
  // -------------------------------------------------------------------------

  /**
   * Quick complexity estimation
   */
  estimateComplexity(task) {
    return this._analyzeComplexity(task);
  }

  /**
   * Check if task needs decomposition
   */
  needsDecomposition(task) {
    const complexity = this._analyzeComplexity(task);
    return complexity.estimatedHours >= this.config.COMPLEXITY_THRESHOLD;
  }

  /**
   * Build execution graph (legacy compatibility)
   */
  buildExecutionGraph(subTasks) {
    const graph = {
      steps: subTasks.map(st => ({
        id: st.id,
        title: st.title,
        type: st.type,
        duration: st.estimate?.hours * 60 + st.estimate?.minutes || 60,
        dependencies: st.dependencies || []
      })),
      order: [],
      levels: []
    };
    
    // Calculate execution order (topological sort)
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (stepId) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected: ${stepId}`);
      }
      if (visited.has(stepId)) return;
      
      visiting.add(stepId);
      
      const step = graph.steps.find(s => s.id === stepId);
      if (step) {
        step.dependencies.forEach(depId => visit(depId));
      }
      
      visiting.delete(stepId);
      visited.add(stepId);
      graph.order.push(stepId);
    };
    
    graph.steps.forEach(step => {
      if (!visited.has(step.id)) visit(step.id);
    });
    
    // Calculate execution levels
    const levels = [];
    const completed = new Set();
    
    while (completed.size < graph.steps.length) {
      const level = [];
      
      graph.steps.forEach(step => {
        if (completed.has(step.id)) return;
        
        const depsSatisfied = step.dependencies.every(dep => completed.has(dep));
        if (depsSatisfied) level.push(step.id);
      });
      
      if (level.length === 0) break;
      
      levels.push(level);
      level.forEach(id => completed.add(id));
    }
    
    graph.levels = levels;
    return graph;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate summary of graph
   */
  _generateSummary(graphDef) {
    const totalDuration = graphDef.nodes.reduce((sum, n) => 
      sum + (n.estimate?.hours || 0) + (n.estimate?.minutes || 0) / 60, 0
    );
    
    return {
      nodeCount: graphDef.nodes.length,
      edgeCount: graphDef.edges.length,
      conditionalEdges: graphDef.edges.filter(e => e.conditional).length,
      estimatedHours: totalDuration,
      phases: [...new Set(graphDef.nodes.map(n => n.metadata?.phase).filter(Boolean))],
      hasCycles: graphDef.edges.some(e => e.metadata?.path === 'retry')
    };
  }

  /**
   * Analyze task complexity
   */
  _analyzeComplexity(task) {
    const taskLower = task.toLowerCase();
    let score = 0;
    let indicators = [];
    
    Object.entries(this.config.COMPLEXITY_INDICATORS).forEach(([level, keywords]) => {
      keywords.forEach(keyword => {
        if (taskLower.includes(keyword.toLowerCase())) {
          score += level === 'high' ? 3 : level === 'medium' ? 2 : 1;
          indicators.push(keyword);
        }
      });
    });
    
    let estimatedHours = 2;
    if (score >= 8) estimatedHours = 16;
    else if (score >= 4) estimatedHours = 8;
    else if (score >= 2) estimatedHours = 4;
    
    let level = 'low';
    if (estimatedHours >= 16) level = 'high';
    else if (estimatedHours >= 8) level = 'medium';
    
    return { level, estimatedHours, score, indicators: [...new Set(indicators)] };
  }

  /**
   * Detect task type
   */
  _detectTaskType(task) {
    const taskLower = task.toLowerCase();
    
    for (const [type, patterns] of Object.entries(this.config.TASK_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(taskLower)) return type;
      }
    }
    
    return 'generic';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AgentGraph from a task decomposition
 */
export async function createGraphFromTask(task, options = {}) {
  const decomposer = new TaskDecomposer(options);
  const decomposition = await decomposer.decompose(task, options);
  
  if (!decomposition.graph) {
    throw new Error('Task decomposition did not produce a graph');
  }
  
  const graphDef = decomposition.graph;
  const graph = new AgentGraph({
    id: graphDef.id,
    name: graphDef.name,
    ...options
  });
  
  // Add nodes
  for (const nodeDef of graphDef.nodes) {
    graph.addNode(nodeDef.id, async (input, globalState, context) => {
      // Default action that logs and returns input
      globalState.addMemory({
        node: nodeDef.id,
        type: nodeDef.type,
        input: JSON.stringify(input).slice(0, 200)
      });
      
      return {
        nodeId: nodeDef.id,
        type: nodeDef.type,
        result: input,
        completed: true
      };
    }, nodeDef);
  }
  
  // Add edges
  for (const edgeDef of graphDef.edges) {
    let condition = null;
    
    if (edgeDef.conditional) {
      if (edgeDef.condition === 'success') {
        condition = Conditions.success;
      } else if (edgeDef.condition === 'failure') {
        condition = Conditions.failure;
      } else if (edgeDef.conditionFn) {
        condition = createCondition(new Function('result', 'globalState', `return ${edgeDef.conditionFn}`));
      }
    }
    
    graph.addEdge(edgeDef.from, edgeDef.to, condition, edgeDef.metadata);
  }
  
  // Set entry point and end nodes
  graph.setEntryPoint(graphDef.entryPoint);
  for (const endNode of graphDef.endNodes) {
    graph.addEndNode(endNode);
  }
  
  return {
    graph,
    decomposition
  };
}

// ============================================================================
// Exports
// ============================================================================

export { CONFIG };
export default TaskDecomposer;