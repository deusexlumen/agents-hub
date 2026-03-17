# Core Orchestrator Logic

This document defines the internal logic for the Agents Hub Orchestrator.

## Orchestrator Responsibilities

1. **Workflow Detection**
   - Analyze user input
   - Match to workflow type
   - Load appropriate workflow definition

2. **Phase Management**
   - Track current phase
   - Enforce phase order
   - Handle phase transitions
   - Maintain phase history

3. **Context Loading**
   - Load workflow YAML
   - Load phase instructions
   - Load specialist templates (when needed)
   - Merge contexts appropriately

4. **User Interaction**
   - Ask clarifying questions
   - Present options
   - Confirm decisions
   - Report progress

5. **State Management**
   - Maintain session context
   - Track deliverables
   - Log decisions
   - Archive completed work

## Workflow Detection Algorithm

```
INPUT: user_message
OUTPUT: workflow_type

ALGORITHM:
1. keywords = extract_keywords(user_message)

2. scores = {
   "software-dev": 0,
   "content-creation": 0,
   "research-analysis": 0,
   "business-strategy": 0
}

3. For each keyword in keywords:
   If keyword in software_keywords:
      scores["software-dev"] += weight
   If keyword in content_keywords:
      scores["content-creation"] += weight
   If keyword in research_keywords:
      scores["research-analysis"] += weight
   If keyword in business_keywords:
      scores["business-strategy"] += weight

4. workflow_type = max(scores)

5. If max_score < threshold:
   Ask user to clarify

6. Return workflow_type
```

### Keyword Mappings

```yaml
software_keywords:
  high_weight:
    - code
    - build
    - develop
    - program
    - app
    - application
    - software
    - website
    - web
    - API
    - backend
    - frontend
    - database
    - bug
    - feature
    - implement
  medium_weight:
    - fix
    - create
    - make
    - setup
    - configure

content_keywords:
  high_weight:
    - write
    - blog
    - article
    - content
    - social media
    - video
    - design
    - graphic
    - logo
    - brand
    - marketing
    - email
    - newsletter
  medium_weight:
    - create
    - produce
    - draft

research_keywords:
  high_weight:
    - research
    - analyze
    - study
    - investigate
    - report
    - data
    - survey
    - find
    - discover
    - competitive analysis
    - market research
  medium_weight:
    - look into
    - explore

business_keywords:
  high_weight:
    - strategy
    - business plan
    - market
    - growth
    - revenue
    - profit
    - business model
    - competitive
    - SWOT
    - OKR
    - KPI
    - metrics
  medium_weight:
    - plan
    - optimize
    - improve
```

## Phase State Machine

```
STATES:
- discovery
- planning
- execution
- review
- delivery
- complete

TRANSITIONS:
discovery → planning
planning → execution
execution → review
review → execution (if revisions needed)
review → delivery
delivery → complete

GUARDS:
- Can only move forward if exit criteria met
- Can move backward for revisions
- Cannot skip phases (except explicitly)
```

## Context Loading Priority

When multiple sources provide instructions:

```
PRIORITY (highest to lowest):

1. Phase-specific instructions (phases/{phase}.md)
   - Always loaded
   - Phase context overrides general

2. Specialist templates (templates/*.md)
   - Loaded when needed
   - Domain expertise
   - Technical details

3. Workflow configuration (workflows/*.yaml)
   - Phase order
   - Exit criteria
   - Commands

4. Core orchestrator (AGENTS.md)
   - General principles
   - Fallback behavior
```

## Session Lifecycle

```
SESSION START
├── Load AGENTS.md
├── Detect/confirm workflow
├── Check for existing context
│   ├── If exists: Resume
│   └── If new: Start discovery
└── Load phase instructions

DURING SESSION
├── Execute phase activities
├── Update context
├── Await user input
├── Handle commands
└── Manage transitions

SESSION END
├── Complete delivery phase
├── Archive session
├── Log metrics
└── Offer follow-up
```

## Decision Trees

### What to Load?

```
User says: "I need to build a website"

1. Detect workflow
   └── "build" + "website" → software-dev

2. Check current phase
   └── New session → discovery

3. Load context
   ├── workflows/software-dev.yaml
   ├── phases/discovery.md
   └── (specialist not needed yet)

4. Present phase questions
   └── Ask discovery questions
```

### When to Load Specialist?

```
During execution phase:

IF task contains "React" AND "frontend":
   LOAD templates/AGENTS-frontend-specialist.md
   LOAD templates/AGENTS-web-development.md

IF task contains "API" AND "backend":
   LOAD templates/AGENTS-api-development.md

IF user explicitly requests:
   "Load web development specialist"
   LOAD templates/AGENTS-web-development.md
```

### Phase Transition Decision

```
Current phase: discovery

CHECK exit criteria:
✓ User intent understood?
✓ Requirements documented?
✓ Constraints identified?
✓ Success criteria defined?

IF all criteria met:
   ASK: "Shall we move to planning?"
   IF user agrees:
      SAVE discovery artifacts
      LOAD phases/planning.md
      SET current_phase = planning
   ELSE:
      CONTINUE in discovery
ELSE:
   CONTINUE in discovery
   PROMPT for missing information
```

## Error Recovery

### Common Errors and Responses

```
ERROR: Workflow detection ambiguous
RESPONSE:
  "I'm not sure which type of work this is.
   Is this:
   A) Software development (coding)
   B) Content creation (writing/design)
   C) Research/analysis
   D) Business strategy"

ERROR: Phase criteria not met
RESPONSE:
  "Before moving to [next_phase], we need to:
   - [Missing criterion 1]
   - [Missing criterion 2]
   
   Shall we address these first?"

ERROR: Template not found
RESPONSE:
  "I don't have a specialist template for [topic].
   I can proceed with general knowledge, or
   would you like to try a different approach?"

ERROR: User wants to skip phases
RESPONSE:
  "I can skip to [phase], but this bypasses:
   - [What will be missed]
   
   Are you sure? I recommend completing
   [current_phase] for best results."
```

## Performance Optimization

### Context Window Management

```
To stay within token limits:

1. Load only current phase (not all phases)
2. Load specialist sections selectively
3. Summarize completed phases
4. Archive old context
5. Use references instead of full text

STRUCTURE:
[Current phase - full details]
[Previous phases - summaries only]
[Next phases - titles only]
```

### Caching Strategy

```
CACHE:
- Workflow YAML (rarely changes)
- Specialist templates (static)
- Phase structure (static)

DON'T CACHE:
- Session context (dynamic)
- User inputs (unique)
- Generated content (unique)
```

## Logging Format

```yaml
session_log:
  session_id: "uuid"
  timestamp_start: "2026-03-17T13:00:00Z"
  timestamp_end: "2026-03-17T14:30:00Z"
  
  workflow:
    type: "software-dev"
    detected_from: "user input: 'build a website'"
    
  phases:
    - name: "discovery"
      start_time: "13:00"
      end_time: "13:20"
      completed: true
      artifacts: ["requirements.md"]
      
    - name: "planning"
      start_time: "13:20"
      end_time: "13:45"
      completed: true
      artifacts: ["plan.md", "architecture.md"]
      
    - name: "execution"
      start_time: "13:45"
      end_time: "14:20"
      completed: true
      artifacts: ["source code"]
      
    - name: "review"
      start_time: "14:20"
      end_time: "14:25"
      completed: true
      issues_found: 2
      issues_resolved: 2
      
    - name: "delivery"
      start_time: "14:25"
      end_time: "14:30"
      completed: true
      artifacts: ["final deliverables"]
  
  files_accessed:
    - "workflows/software-dev.yaml"
    - "phases/discovery.md"
    - "phases/planning.md"
    - "phases/execution.md"
    - "phases/review.md"
    - "phases/delivery.md"
    - "templates/AGENTS-web-development.md"
    
  user_satisfaction: "high"
  notes: "User was pleased with structured approach"
```

## Extension Points

### Adding Custom Workflows

```
1. Create workflows/custom.yaml
2. Define phases and criteria
3. Add detection keywords
4. Update orchestrator
5. Test with sample task
```

### Adding Custom Phases

```
1. Create phases/custom.md
2. Define entry/exit criteria
3. Add to workflow YAML
4. Update transitions
5. Test flow
```

### Adding Custom Specialists

```
1. Create templates/AGENTS-custom.md
2. Follow template structure
3. Add to workflow's specialist list
4. Update loading logic
5. Test integration
```
