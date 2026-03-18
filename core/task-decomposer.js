/**
 * Task Decomposer
 * 
 * Decomposes large tasks into smaller, manageable sub-tasks
 * with dependency tracking and execution graph generation
 * 
 * @module task-decomposer
 * @version 2.0.0
 */

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
  }
};

// ============================================================================
// TaskDecomposer Class
// ============================================================================

/**
 * Task decomposition and dependency management
 * Breaks down complex tasks into executable sub-tasks
 */
class TaskDecomposer {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Main Decomposition
  // -------------------------------------------------------------------------

  /**
   * Decompose a task into sub-tasks
   * @param {string} task - Task description
   * @param {Object} options - Decomposition options
   * @returns {Object} Decomposed task structure
   */
  async decompose(task, options = {}) {
    try {
      // Analyze task complexity
      const complexity = this._analyzeComplexity(task);
      
      // Determine if decomposition is needed
      if (complexity.estimatedHours < this.config.COMPLEXITY_THRESHOLD && !options.force) {
        return {
          task,
          complexity: complexity.level,
          estimatedHours: complexity.estimatedHours,
          needsDecomposition: false,
          reason: 'Task below complexity threshold',
          subTasks: [this._createSingleSubTask(task, complexity)]
        };
      }
      
      // Generate sub-tasks based on task type
      const subTasks = this._generateSubTasks(task, complexity, options);
      
      // Build dependency graph
      const executionGraph = this.buildExecutionGraph(subTasks);
      
      return {
        task,
        complexity: complexity.level,
        estimatedHours: complexity.estimatedHours,
        needsDecomposition: true,
        subTasks,
        executionGraph,
        parallelGroups: this._identifyParallelGroups(subTasks, executionGraph),
        criticalPath: this._calculateCriticalPath(subTasks, executionGraph)
      };
      
    } catch (error) {
      console.error('[TaskDecomposer] Decomposition failed:', error);
      throw error;
    }
  }

  /**
   * Quick complexity estimation
   * @param {string} task - Task description
   * @returns {Object} Complexity estimate
   */
  estimateComplexity(task) {
    return this._analyzeComplexity(task);
  }

  /**
   * Check if task needs decomposition
   * @param {string} task - Task description
   * @returns {boolean} Whether decomposition is recommended
   */
  needsDecomposition(task) {
    const complexity = this._analyzeComplexity(task);
    return complexity.estimatedHours >= this.config.COMPLEXITY_THRESHOLD;
  }

  // -------------------------------------------------------------------------
  // Sub-task Generation
  // -------------------------------------------------------------------------

  /**
   * Generate sub-tasks based on task type and complexity
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @param {Object} options - Generation options
   * @returns {Array} Generated sub-tasks
   */
  _generateSubTasks(task, complexity, options) {
    const taskType = this._detectTaskType(task);
    const subTasks = [];
    
    switch (taskType) {
      case 'development':
        subTasks.push(...this._generateDevelopmentSubTasks(task, complexity));
        break;
      case 'bugfix':
        subTasks.push(...this._generateBugfixSubTasks(task, complexity));
        break;
      case 'refactoring':
        subTasks.push(...this._generateRefactoringSubTasks(task, complexity));
        break;
      case 'research':
        subTasks.push(...this._generateResearchSubTasks(task, complexity));
        break;
      case 'documentation':
        subTasks.push(...this._generateDocumentationSubTasks(task, complexity));
        break;
      case 'testing':
        subTasks.push(...this._generateTestingSubTasks(task, complexity));
        break;
      default:
        subTasks.push(...this._generateGenericSubTasks(task, complexity));
    }
    
    // Add IDs and estimates
    return subTasks.map((subTask, index) => ({
      id: `st-${index + 1}`,
      ...subTask,
      estimate: subTask.estimate || this._estimateSubTaskTime(subTask),
      dependencies: subTask.dependencies || []
    }));
  }

  /**
   * Generate sub-tasks for development
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateDevelopmentSubTasks(task, complexity) {
    return [
      {
        title: 'Requirements Analysis',
        description: `Analyze requirements for: ${task}`,
        type: 'analysis',
        estimate: { hours: 1, minutes: 0 },
        dependencies: []
      },
      {
        title: 'Architecture/Design',
        description: 'Design solution architecture and component structure',
        type: 'design',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.15, 2), minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Core Implementation',
        description: 'Implement core functionality',
        type: 'implementation',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        dependencies: ['st-2']
      },
      {
        title: 'Testing',
        description: 'Write and run tests',
        type: 'testing',
        estimate: { hours: Math.max(complexity.estimatedHours * 0.2, 1), minutes: 0 },
        dependencies: ['st-3']
      },
      {
        title: 'Documentation',
        description: 'Document implementation and usage',
        type: 'documentation',
        estimate: { hours: 1, minutes: 0 },
        dependencies: ['st-3']
      },
      {
        title: 'Review & Refinement',
        description: 'Code review and final refinements',
        type: 'review',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.1, 1), minutes: 0 },
        dependencies: ['st-4', 'st-5']
      }
    ];
  }

  /**
   * Generate sub-tasks for bugfix
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateBugfixSubTasks(task, complexity) {
    return [
      {
        title: 'Bug Analysis',
        description: `Reproduce and analyze bug: ${task}`,
        type: 'analysis',
        estimate: { hours: 0, minutes: 30 },
        dependencies: []
      },
      {
        title: 'Root Cause Investigation',
        description: 'Identify root cause of the issue',
        type: 'investigation',
        estimate: { hours: 1, minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Fix Implementation',
        description: 'Implement bug fix',
        type: 'implementation',
        estimate: { hours: complexity.estimatedHours * 0.4, minutes: 0 },
        dependencies: ['st-2']
      },
      {
        title: 'Testing',
        description: 'Verify fix and run regression tests',
        type: 'testing',
        estimate: { hours: 1, minutes: 0 },
        dependencies: ['st-3']
      }
    ];
  }

  /**
   * Generate sub-tasks for refactoring
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateRefactoringSubTasks(task, complexity) {
    return [
      {
        title: 'Current State Analysis',
        description: 'Analyze current implementation',
        type: 'analysis',
        estimate: { hours: 1, minutes: 0 },
        dependencies: []
      },
      {
        title: 'Refactoring Plan',
        description: 'Plan refactoring steps and identify risks',
        type: 'planning',
        estimate: { hours: 1, minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Backup Current State',
        description: 'Create backup or checkpoint before refactoring',
        type: 'preparation',
        estimate: { hours: 0, minutes: 15 },
        dependencies: ['st-2']
      },
      {
        title: 'Core Refactoring',
        description: 'Execute main refactoring',
        type: 'implementation',
        estimate: { hours: complexity.estimatedHours * 0.6, minutes: 0 },
        dependencies: ['st-3']
      },
      {
        title: 'Verification',
        description: 'Verify functionality after refactoring',
        type: 'testing',
        estimate: { hours: Math.max(complexity.estimatedHours * 0.2, 1), minutes: 0 },
        dependencies: ['st-4']
      }
    ];
  }

  /**
   * Generate sub-tasks for research
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateResearchSubTasks(task, complexity) {
    return [
      {
        title: 'Initial Research',
        description: 'Gather initial information and resources',
        type: 'research',
        estimate: { hours: 1, minutes: 0 },
        dependencies: []
      },
      {
        title: 'Deep Dive Analysis',
        description: 'In-depth analysis of findings',
        type: 'analysis',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Comparison & Evaluation',
        description: 'Compare options and evaluate approaches',
        type: 'evaluation',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.25, 2), minutes: 0 },
        dependencies: ['st-2']
      },
      {
        title: 'Documentation',
        description: 'Document research findings and recommendations',
        type: 'documentation',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.15, 2), minutes: 0 },
        dependencies: ['st-3']
      }
    ];
  }

  /**
   * Generate sub-tasks for documentation
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateDocumentationSubTasks(task, complexity) {
    return [
      {
        title: 'Structure Planning',
        description: 'Plan documentation structure and outline',
        type: 'planning',
        estimate: { hours: 0, minutes: 30 },
        dependencies: []
      },
      {
        title: 'Draft Content',
        description: 'Write documentation draft',
        type: 'writing',
        estimate: { hours: complexity.estimatedHours * 0.6, minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Review & Edit',
        description: 'Review and refine documentation',
        type: 'review',
        estimate: { hours: complexity.estimatedHours * 0.25, minutes: 0 },
        dependencies: ['st-2']
      },
      {
        title: 'Finalization',
        description: 'Final formatting and publishing',
        type: 'finalization',
        estimate: { hours: complexity.estimatedHours * 0.1, minutes: 0 },
        dependencies: ['st-3']
      }
    ];
  }

  /**
   * Generate sub-tasks for testing
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateTestingSubTasks(task, complexity) {
    return [
      {
        title: 'Test Planning',
        description: 'Define test strategy and scenarios',
        type: 'planning',
        estimate: { hours: 1, minutes: 0 },
        dependencies: []
      },
      {
        title: 'Test Environment Setup',
        description: 'Set up test environment and fixtures',
        type: 'setup',
        estimate: { hours: 1, minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Test Implementation',
        description: 'Write test cases and scenarios',
        type: 'implementation',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        dependencies: ['st-2']
      },
      {
        title: 'Test Execution',
        description: 'Run tests and collect results',
        type: 'execution',
        estimate: { hours: complexity.estimatedHours * 0.25, minutes: 0 },
        dependencies: ['st-3']
      },
      {
        title: 'Results Analysis',
        description: 'Analyze test results and report issues',
        type: 'analysis',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.15, 1), minutes: 0 },
        dependencies: ['st-4']
      }
    ];
  }

  /**
   * Generate generic sub-tasks
   * @param {string} task - Main task
   * @param {Object} complexity - Complexity analysis
   * @returns {Array} Sub-tasks
   */
  _generateGenericSubTasks(task, complexity) {
    return [
      {
        title: 'Analysis',
        description: `Analyze task requirements: ${task}`,
        type: 'analysis',
        estimate: { hours: 1, minutes: 0 },
        dependencies: []
      },
      {
        title: 'Planning',
        description: 'Create implementation plan',
        type: 'planning',
        estimate: { hours: Math.min(complexity.estimatedHours * 0.2, 2), minutes: 0 },
        dependencies: ['st-1']
      },
      {
        title: 'Implementation',
        description: 'Execute implementation',
        type: 'implementation',
        estimate: { hours: complexity.estimatedHours * 0.5, minutes: 0 },
        dependencies: ['st-2']
      },
      {
        title: 'Verification',
        description: 'Verify and test implementation',
        type: 'verification',
        estimate: { hours: Math.max(complexity.estimatedHours * 0.2, 1), minutes: 0 },
        dependencies: ['st-3']
      }
    ];
  }

  // -------------------------------------------------------------------------
  // Dependency Graph
  // -------------------------------------------------------------------------

  /**
   * Build execution graph from sub-tasks
   * @param {Array} subTasks - Sub-tasks with dependencies
   * @returns {Object} Execution graph
   */
  buildExecutionGraph(subTasks) {
    const graph = {
      steps: subTasks.map(st => ({
        id: st.id,
        title: st.title,
        type: st.type,
        duration: st.estimate.hours * 60 + st.estimate.minutes,
        dependencies: st.dependencies || []
      })),
      order: [],
      levels: [],
      parallelGroups: []
    };
    
    // Calculate execution order (topological sort)
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (stepId) => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected: ${stepId}`);
      }
      if (visited.has(stepId)) {
        return;
      }
      
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
      if (!visited.has(step.id)) {
        visit(step.id);
      }
    });
    
    // Calculate execution levels (for parallel execution)
    const levels = [];
    const completed = new Set();
    
    while (completed.size < graph.steps.length) {
      const level = [];
      
      graph.steps.forEach(step => {
        if (completed.has(step.id)) return;
        
        const depsSatisfied = step.dependencies.every(dep => completed.has(dep));
        if (depsSatisfied) {
          level.push(step.id);
        }
      });
      
      if (level.length === 0) {
        throw new Error('Unable to resolve execution levels');
      }
      
      levels.push(level);
      level.forEach(id => completed.add(id));
    }
    
    graph.levels = levels;
    
    return graph;
  }

  /**
   * Identify groups that can run in parallel
   * @param {Array} subTasks - Sub-tasks
   * @param {Object} executionGraph - Execution graph
   * @returns {Array} Parallel groups
   */
  _identifyParallelGroups(subTasks, executionGraph) {
    return executionGraph.levels.map((level, index) => ({
      group: index + 1,
      tasks: level,
      count: level.length,
      totalDuration: level.reduce((sum, id) => {
        const task = subTasks.find(st => st.id === id);
        return sum + (task?.estimate?.hours || 0) * 60 + (task?.estimate?.minutes || 0);
      }, 0)
    }));
  }

  /**
   * Calculate critical path
   * @param {Array} subTasks - Sub-tasks
   * @param {Object} executionGraph - Execution graph
   * @returns {Object} Critical path information
   */
  _calculateCriticalPath(subTasks, executionGraph) {
    // Calculate earliest start/finish
    const earliest = {};
    executionGraph.order.forEach(id => {
      const step = executionGraph.steps.find(s => s.id === id);
      const depEndTimes = step.dependencies.map(dep => earliest[dep]?.finish || 0);
      const start = Math.max(0, ...depEndTimes);
      earliest[id] = {
        start,
        finish: start + step.duration
      };
    });
    
    // Find total duration
    const totalDuration = Math.max(...Object.values(earliest).map(e => e.finish));
    
    // Calculate latest start/finish
    const latest = {};
    [...executionGraph.order].reverse().forEach(id => {
      const step = executionGraph.steps.find(s => s.id === id);
      const dependentSteps = executionGraph.steps.filter(s => s.dependencies.includes(id));
      
      if (dependentSteps.length === 0) {
        latest[id] = {
          finish: totalDuration,
          start: totalDuration - step.duration
        };
      } else {
        const latestFinish = Math.min(...dependentSteps.map(s => latest[s.id]?.start || totalDuration));
        latest[id] = {
          finish: latestFinish,
          start: latestFinish - step.duration
        };
      }
    });
    
    // Identify critical path (zero slack)
    const criticalPath = executionGraph.order.filter(id => {
      const e = earliest[id];
      const l = latest[id];
      return l.finish - e.finish < 0.01; // Allow for floating point errors
    });
    
    return {
      path: criticalPath,
      duration: totalDuration,
      steps: criticalPath.map(id => ({
        id,
        ...earliest[id]
      }))
    };
  }

  // -------------------------------------------------------------------------
  // Analysis Helpers
  // -------------------------------------------------------------------------

  /**
   * Analyze task complexity
   * @param {string} task - Task description
   * @returns {Object} Complexity analysis
   */
  _analyzeComplexity(task) {
    const taskLower = task.toLowerCase();
    let score = 0;
    let indicators = [];
    
    // Check complexity keywords
    Object.entries(this.config.COMPLEXITY_INDICATORS).forEach(([level, keywords]) => {
      keywords.forEach(keyword => {
        if (taskLower.includes(keyword.toLowerCase())) {
          score += level === 'high' ? 3 : level === 'medium' ? 2 : 1;
          indicators.push(keyword);
        }
      });
    });
    
    // Estimate hours based on score
    let estimatedHours = 2; // Base estimate
    if (score >= 8) {
      estimatedHours = 16; // High complexity
    } else if (score >= 4) {
      estimatedHours = 8;  // Medium complexity
    } else if (score >= 2) {
      estimatedHours = 4;  // Low-medium complexity
    }
    
    // Determine level
    let level = 'low';
    if (estimatedHours >= 16) level = 'high';
    else if (estimatedHours >= 8) level = 'medium';
    
    return {
      level,
      estimatedHours,
      score,
      indicators: [...new Set(indicators)]
    };
  }

  /**
   * Detect task type
   * @param {string} task - Task description
   * @returns {string} Task type
   */
  _detectTaskType(task) {
    const taskLower = task.toLowerCase();
    
    for (const [type, patterns] of Object.entries(this.config.TASK_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(taskLower)) {
          return type;
        }
      }
    }
    
    return 'generic';
  }

  /**
   * Estimate time for a sub-task
   * @param {Object} subTask - Sub-task
   * @returns {Object} Time estimate
   */
  _estimateSubTaskTime(subTask) {
    // Default estimates by type
    const defaults = {
      analysis: { hours: 1, minutes: 0 },
      design: { hours: 1, minutes: 30 },
      implementation: { hours: 2, minutes: 0 },
      testing: { hours: 1, minutes: 0 },
      documentation: { hours: 0, minutes: 45 },
      review: { hours: 0, minutes: 30 },
      planning: { hours: 0, minutes: 30 },
      setup: { hours: 0, minutes: 30 },
      research: { hours: 1, minutes: 0 },
      investigation: { hours: 1, minutes: 0 },
      evaluation: { hours: 1, minutes: 0 },
      preparation: { hours: 0, minutes: 15 },
      execution: { hours: 1, minutes: 0 },
      verification: { hours: 1, minutes: 0 },
      writing: { hours: 1, minutes: 0 },
      finalization: { hours: 0, minutes: 30 }
    };
    
    return defaults[subTask.type] || { hours: 1, minutes: 0 };
  }

  /**
   * Create single sub-task for non-decomposed tasks
   * @param {string} task - Task description
   * @param {Object} complexity - Complexity analysis
   * @returns {Object} Single sub-task
   */
  _createSingleSubTask(task, complexity) {
    return {
      id: 'st-1',
      title: task,
      description: task,
      type: 'implementation',
      estimate: { hours: complexity.estimatedHours, minutes: 0 },
      dependencies: []
    };
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  TaskDecomposer,
  CONFIG
};
