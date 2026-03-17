# Context Manager

Manages session state, user preferences, and work history.

## Purpose

The Context Manager maintains continuity across:
- Multiple phases of a workflow
- Multiple sessions for long-running tasks
- Multiple specialist invocations
- User preference learning

## Context Structure

```yaml
session_context:
  # Identity
  session_id: "uuid-v4"
  created_at: "2026-03-17T13:00:00Z"
  last_updated: "2026-03-17T13:30:00Z"
  
  # Workflow State
  workflow:
    type: "software-dev"
    version: "1.0"
    current_phase: "execution"
    completed_phases: ["discovery", "planning"]
    remaining_phases: ["review", "delivery"]
  
  # User Intent
  user:
    original_request: "Build a REST API for user management"
    clarified_intent: "Create Node.js/Express API with JWT auth"
    preferences:
      communication_style: "concise"
      detail_level: "high"
      feedback_frequency: "often"
  
  # Requirements
  requirements:
    functional:
      - "User registration"
      - "User login"
      - "JWT token refresh"
    non_functional:
      performance: "< 200ms response time"
      security: "OWASP compliance"
      scalability: "10k concurrent users"
    constraints:
      timeline: "2 weeks"
      budget: "limited"
      tech_stack: ["Node.js", "Express", "PostgreSQL"]
  
  # Planning
  plan:
    approach: "Layered architecture"
    architecture: "RESTful API"
    file_structure: "/docs/architecture.md"
    implementation_steps:
      - step: 1
        task: "Setup project structure"
        status: "complete"
      - step: 2
        task: "Implement auth endpoints"
        status: "in_progress"
      - step: 3
        task: "Add validation"
        status: "pending"
  
  # Execution State
  execution:
    current_task: "Implement login endpoint"
    completed_tasks: ["Setup project", "Configure database"]
    blockers: []
    
  # Deliverables
  deliverables:
    discovery:
      - "tasks/001/discovery/requirements.md"
    planning:
      - "tasks/001/planning/architecture.md"
      - "tasks/001/planning/implementation-plan.md"
    execution:
      - "tasks/001/execution/src/"
    review: []
    delivery: []
  
  # Decisions Log
  decisions:
    - timestamp: "2026-03-17T13:15:00Z"
      phase: "planning"
      decision: "Use Express over Fastify"
      rationale: "Team familiarity"
      alternatives_considered: ["Fastify", "NestJS"]
  
  # Communication History
  history:
    - role: "user"
      message: "I need to build a REST API"
      timestamp: "2026-03-17T13:00:00Z"
    - role: "assistant"
      message: "I'll help you build a REST API..."
      timestamp: "2026-03-17T13:01:00Z"
```

## Context Operations

### Initialize New Session

```
FUNCTION initialize_session(user_input):
  session_id = generate_uuid()
  timestamp = now()
  
  context = {
    session_id: session_id,
    created_at: timestamp,
    last_updated: timestamp,
    workflow: {
      type: detect_workflow(user_input),
      current_phase: "discovery",
      completed_phases: []
    },
    user: {
      original_request: user_input
    }
  }
  
  save_context(context)
  return context
```

### Update Context

```
FUNCTION update_context(session_id, updates):
  context = load_context(session_id)
  
  # Deep merge updates
  context = deep_merge(context, updates)
  context.last_updated = now()
  
  save_context(context)
  return context
```

### Get Current State

```
FUNCTION get_current_state(session_id):
  context = load_context(session_id)
  
  return {
    workflow_type: context.workflow.type,
    current_phase: context.workflow.current_phase,
    current_task: context.execution?.current_task,
    pending_tasks: get_pending_tasks(context),
    blockers: context.execution?.blockers,
    recent_decisions: get_recent_decisions(context, limit=5)
  }
```

### Transition Phase

```
FUNCTION transition_phase(session_id, from_phase, to_phase):
  context = load_context(session_id)
  
  # Validate transition
  if context.workflow.current_phase != from_phase:
    raise Error("Phase mismatch")
  
  # Update phase tracking
  context.workflow.completed_phases.append(from_phase)
  context.workflow.current_phase = to_phase
  context.workflow.remaining_phases.remove(to_phase)
  
  # Log transition
  log_phase_transition(session_id, from_phase, to_phase)
  
  save_context(context)
  return context
```

## Persistence Strategy

### File-Based Storage

```
STORAGE STRUCTURE:

tasks/
└── {task_id}/
    ├── context.yaml          ← Main context file
    ├── state.json            ← Current state (fast access)
    ├── history/
    │   └── conversation.md   ← Chat history
    ├── phases/
    │   ├── discovery/
    │   ├── planning/
    │   ├── execution/
    │   ├── review/
    │   └── delivery/
    └── deliverables/         ← Final outputs
```

### Save Behavior

```
ON EVERY SIGNIFICANT CHANGE:
1. Update in-memory context
2. Write to context.yaml
3. Update state.json
4. Sync to backup location (optional)

AUTOSAVE TRIGGERS:
- Phase transition
- Major decision
- Deliverable completion
- User explicit save request
- Session timeout warning
```

## Context Pruning

To manage token limits:

```
PRUNING STRATEGY:

1. COMPLETED PHASES
   - Keep summary only
   - Remove detailed instructions
   - Keep decisions and artifacts

2. OLD MESSAGES
   - Summarize conversation > 10 messages back
   - Keep recent messages in full
   - Archive full history to file

3. REDUNDANT INFORMATION
   - Remove duplicate requirements
   - Consolidate similar decisions
   - Clean up temporary notes

EXAMPLE PRUNED CONTEXT:

[DISCOVERY - SUMMARY]
Requirements gathered for Node.js REST API.
Key requirements: JWT auth, user management, <200ms latency.
See: tasks/001/discovery/requirements.md

[PLANNING - SUMMARY]
Architecture: Layered pattern with Express.
Tech stack: Node.js, Express, PostgreSQL, Prisma.
See: tasks/001/planning/architecture.md

[CURRENT - EXECUTION]
Full context loaded...
Current task: Implement login endpoint
Next up: Add JWT token generation
```

## User Preference Learning

### Preference Tracking

```yaml
user_preferences:
  communication:
    style: "concise"  # or "detailed", "technical"
    tone: "professional"  # or "casual", "friendly"
    length: "medium"  # or "brief", "comprehensive"
    
  workflow:
    feedback_frequency: "often"  # or "phase-end", "on-request"
    autonomy_level: "confirm"  # or "full", "none"
    detail_preference: "high"  # or "low"
    
  technical:
    preferred_languages: ["TypeScript", "Python"]
    preferred_frameworks: ["React", "Express"]
    preferred_tools: ["Vite", "Prisma"]
    
  domain_expertise:
    level: "intermediate"  # or "beginner", "expert"
    familiar_with: ["REST APIs", "React", "Docker"]
    wants_to_learn: ["GraphQL", "Kubernetes"]
```

### Preference Inference

```
FROM USER INTERACTIONS:

If user often says "be more concise":
  SET communication.style = "concise"

If user provides detailed technical specs:
  SET domain_expertise.level = "expert"

If user asks for explanations:
  SET domain_expertise.level = "beginner"

If user prefers quick approval:
  SET workflow.feedback_frequency = "phase-end"

If user wants to see every change:
  SET workflow.feedback_frequency = "often"
```

## Cross-Session Continuity

### Long-Running Tasks

```
FOR TASKS SPANNING MULTIPLE SESSIONS:

1. Save full context on session end
2. Generate session summary
3. Note current state and blockers
4. On resume, load context
5. Present summary to user
6. Confirm understanding
7. Continue from last state
```

### Resume Protocol

```
USER: "Continue the API project"

ORCHESTRATOR:
"Welcome back! Resuming your API project...

Last session: March 17, 2026
Current phase: Execution (75% complete)
Last task: Implementing JWT middleware
Status: In progress, no blockers

Quick recap:
- Building Node.js/Express REST API
- Completed: User registration endpoint
- In progress: Login with JWT
- Next: Token refresh endpoint

Ready to continue?"
```

## Context Security

### Sensitive Data Handling

```
RULES:

1. NEVER store in context:
   - API keys
   - Passwords
   - Private credentials
   - PII (unnecessarily)

2. INSTEAD:
   - Reference environment variables
   - Use placeholder tokens
   - Prompt user when needed
   - Clear after use

3. IF SENSITIVE DATA MUST BE STORED:
   - Encrypt at rest
   - Limit access
   - Set expiration
   - Audit access
```

## Recovery Mechanisms

### Corrupted Context

```
IF context.yaml is corrupted:

1. Try to load backup (context.yaml.bak)
2. If backup available:
   - Restore from backup
   - Log corruption event
   - Continue with warning
3. If no backup:
   - Create new context
   - Attempt to infer from files
   - Ask user for confirmation
   - Log reconstruction
```

### Session Timeout

```
IF session times out:

1. Auto-save current state
2. Generate timeout summary
3. Note current task and progress
4. On reconnect:
   - Present timeout summary
   - Confirm current state
   - Resume work
```
