# Agents Hub - System Overview

**A comprehensive, workflow-driven agent orchestration system.**

---

## What is Agents Hub?

Agents Hub is an advanced system for managing complex AI-assisted tasks through:

- **Dynamic Context Loading** - Only load what's needed, when it's needed
- **Structured Workflows** - 4 workflow types covering most use cases
- **Phased Execution** - 5 phases from discovery to delivery
- **Specialist Integration** - 19 domain-specific templates
- **State Management** - Persistent context across sessions
- **Quality Gates** - Verification at each phase

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INPUT                              │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                              │
│                    (AGENTS.md)                               │
│  • Detects workflow type                                     │
│  • Manages phase transitions                                 │
│  • Coordinates specialists                                   │
│  • Maintains session context                                 │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW LAYER                            │
│                   (workflows/*.yaml)                         │
│  • Defines available phases                                  │
│  • Sets phase order and dependencies                         │
│  • Specifies exit criteria                                   │
│  • Lists specialist templates                                │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                     PHASE LAYER                              │
│                     (phases/*.md)                            │
│  • Phase-specific instructions                               │
│  • Activities and deliverables                               │
│  • Entry and exit criteria                                   │
│  • Templates and examples                                    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                  SPECIALIST LAYER                            │
│                  (templates/*.md)                            │
│  • Domain expertise (19 specialists)                         │
│  • Technical guidance                                        │
│  • Best practices and standards                              │
│  • Loaded dynamically when needed                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    CORE SERVICES                             │
│                      (core/*.md)                             │
│  • Orchestrator logic                                        │
│  • Context management                                        │
│  • Error handling and recovery                               │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                   OUTPUT & STORAGE                           │
│              (tasks/, logs/, delivery/)                      │
│  • Task artifacts organized by phase                         │
│  • Session logs and metrics                                  │
│  • Final deliverables                                        │
│  • Archive and history                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
agents-hub/
│
├── AGENTS.md                          ← Master orchestrator (9 KB)
│   └── Entry point, workflow detection, user interaction
│
├── README.md                          ← Full documentation (10 KB)
├── QUICKSTART.md                      ← Getting started guide (8 KB)
├── SYSTEM_OVERVIEW.md                 ← This file
│
├── core/                              ← Core orchestration logic
│   ├── orchestrator.md               ← Workflow detection algorithms
│   ├── context-manager.md            ← State management
│   └── error-handler.md              ← Error recovery strategies
│
├── workflows/                         ← Workflow definitions (YAML)
│   ├── software-dev.yaml             ← Coding projects
│   ├── content-creation.yaml         ← Writing, design, video
│   ├── research-analysis.yaml        ← Research, data analysis
│   └── business-strategy.yaml        ← Business planning
│
├── phases/                            ← Phase instructions
│   ├── discovery.md                  ← Phase 1: Understanding
│   ├── planning.md                   ← Phase 2: Planning
│   ├── execution.md                  ← Phase 3: Implementation
│   ├── review.md                     ← Phase 4: Quality assurance
│   └── delivery.md                   ← Phase 5: Handoff
│
├── templates/                         ← Specialist knowledge (19 files)
│   ├── AGENTS-api-development.md
│   ├── AGENTS-authentication-database.md
│   ├── AGENTS-business-strategy.md
│   ├── AGENTS-computer-use.md
│   ├── AGENTS-content-creator.md
│   ├── AGENTS-data-analyst.md
│   ├── AGENTS-design-creative.md
│   ├── AGENTS-devops-sre.md
│   ├── AGENTS-frontend-specialist.md
│   ├── AGENTS-game-development.md
│   ├── AGENTS-general-assistant.md
│   ├── AGENTS-learning-education.md
│   ├── AGENTS-mobile-development.md
│   ├── AGENTS-personal-assistant.md
│   ├── AGENTS-research-analyst.md
│   ├── AGENTS-tauri-rust.md
│   ├── AGENTS-video-production.md
│   └── AGENTS-web-development.md
│
├── skills/                            ← Reusable capabilities
│   └── README.md
│
├── tasks/                             ← Active and completed tasks
│   └── example-task/
│       ├── context.yaml              ← Session state
│       ├── discovery/                ← Phase 1 artifacts
│       ├── planning/                 ← Phase 2 artifacts
│       ├── execution/                ← Phase 3 artifacts
│       ├── review/                   ← Phase 4 artifacts
│       └── delivery/                 ← Phase 5 artifacts
│
└── logs/                              ← Session logs
    └── sessions/
        └── {date}_{task_id}/
            ├── context.yaml
            ├── conversation.md
            └── phases/
```

---

## Workflows (4 Types)

### 1. Software Development
**For:** Coding projects, applications, APIs, scripts

**Phases:**
1. Discovery - Requirements gathering
2. Planning - Architecture design
3. Execution - Code implementation
4. Review - Testing and QA
5. Delivery - Documentation and handoff

**Specialists:**
- Web Development (React, Next.js)
- Mobile Development (React Native, Flutter)
- API Development (REST, GraphQL)
- Game Development (Unity, Unreal, Godot)
- Frontend Specialist (UI/UX)
- DevOps/SRE (Infrastructure)
- Tauri/Rust (Desktop apps)
- Authentication/Database (Security)

### 2. Content Creation
**For:** Writing, graphic design, video production

**Phases:**
1. Discovery - Audience and goals
2. Planning - Content structure
3. Execution - Content creation
4. Review - Editing and refinement
5. Delivery - Publication and distribution

**Specialists:**
- Content Creator (Writing, social media)
- Design Creative (Graphic design, branding)
- Video Production (Filming, editing)

### 3. Research & Analysis
**For:** Market research, data analysis, investigations

**Phases:**
1. Discovery - Research question
2. Planning - Methodology
3. Execution - Data collection
4. Review - Analysis and validation
5. Delivery - Report and insights

**Specialists:**
- Research Analyst (Deep research)
- Data Analyst (Visualization, insights)

### 4. Business Strategy
**For:** Business planning, strategy, market analysis

**Phases:**
1. Discovery - Business context
2. Planning - Strategic options
3. Execution - Business case development
4. Review - Validation and refinement
5. Delivery - Strategy document

**Specialists:**
- Business Strategist (Planning, analysis)
- Data Analyst (Market data)

---

## Phases (5 Stages)

All workflows follow the same 5 phases:

| Phase | Purpose | Key Question | Typical Duration |
|-------|---------|--------------|------------------|
| **1. Discovery** | Understand requirements | "What are we building?" | 10-20% |
| **2. Planning** | Design approach | "How will we build it?" | 15-30% |
| **3. Execution** | Implement solution | "Can we build it?" | 40-60% |
| **4. Review** | Quality assurance | "Is it good enough?" | 10-20% |
| **5. Delivery** | Hand off work | "How do we deliver?" | 5-10% |

### Phase Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│Discovery │───→│ Planning │───→│Execution │───→│  Review  │───→│ Delivery │
│   🔍     │    │   📋     │    │   ⚙️     │    │   ✅     │    │   📦     │
└──────────┘    └──────────┘    └────┬─────┘    └────┬─────┘    └──────────┘
                                      │               │
                                      └───────────────┘
                                       (If revisions needed)
```

---

## Specialist Templates (19 Total)

### Development (9)
1. **API Development** - REST, GraphQL, gRPC
2. **Authentication/Database** - Security, auth systems
3. **DevOps/SRE** - Infrastructure, CI/CD
4. **Frontend Specialist** - UI/UX, design systems
5. **Game Development** - Unity, Unreal, Godot
6. **Mobile Development** - React Native, Flutter
7. **Tauri/Rust** - Desktop applications
8. **Web Development** - Full-stack web
9. **General Assistant** - All-purpose coding

### Creative & Content (3)
10. **Content Creator** - Writing, social media
11. **Design Creative** - Graphic design, branding
12. **Video Production** - Filming, editing

### Research & Analysis (3)
13. **Research Analyst** - Deep research
14. **Data Analyst** - Business intelligence
15. **Business Strategy** - Strategic planning

### Productivity (3)
16. **Computer Use** - Automation, file management
17. **Learning/Education** - Skill development
18. **Personal Assistant** - Productivity

### General (1)
19. **General Assistant** - Versatile helper

---

## Key Features

### 1. Progressive Disclosure
Only load the context needed for the current phase:

```
Phase: Discovery
Loaded: phases/discovery.md + workflows/software-dev.yaml
Not Loaded: phases/execution.md, templates/AGENTS-*.md

Phase: Execution + Web Dev Needed
Loaded: phases/execution.md + workflows/software-dev.yaml + 
        templates/AGENTS-web-development.md
```

### 2. Dynamic Workflow Detection
Automatically detects workflow type from user input:

```
Input: "Build a website"
Keywords: "build" + "website" → software-dev workflow

Input: "Write a blog post"
Keywords: "write" + "blog" → content-creation workflow
```

### 3. State Persistence
Maintains context across the entire session:

```yaml
session_context:
  workflow_type: "software-dev"
  current_phase: "execution"
  completed_phases: ["discovery", "planning"]
  requirements: {...}
  plan: {...}
  decisions: [...]
```

### 4. Quality Gates
Each phase has specific exit criteria that must be met:

```
Discovery Complete When:
✓ User intent understood
✓ Requirements documented
✓ Constraints identified
✓ Success criteria defined
```

### 5. Error Recovery
Built-in error handling and recovery strategies:

```
Error Types:
- User input errors → Clarification questions
- Workflow errors → Fallback to general
- Phase errors → Skip or pause options
- Resource errors → Alternative approaches
```

---

## Usage Flow

```
1. USER STARTS SESSION
   ↓
2. ORCHESTRATOR LOADS
   - Reads AGENTS.md
   - Initializes context
   ↓
3. USER DESCRIBES TASK
   - "Build a REST API"
   ↓
4. WORKFLOW DETECTED
   - software-dev selected
   - Load workflows/software-dev.yaml
   ↓
5. PHASE 1: DISCOVERY
   - Load phases/discovery.md
   - Ask discovery questions
   - Document requirements
   ↓
6. PHASE 2: PLANNING
   - Load phases/planning.md
   - Design architecture
   - Create implementation plan
   ↓
7. PHASE 3: EXECUTION
   - Load phases/execution.md
   - Load specialist (if needed)
   - Implement solution
   ↓
8. PHASE 4: REVIEW
   - Load phases/review.md
   - Quality check
   - User feedback
   ↓
9. PHASE 5: DELIVERY
   - Load phases/delivery.md
   - Package deliverables
   - Create documentation
   ↓
10. SESSION COMPLETE
    - Archive context
    - Log metrics
    - Offer follow-up
```

---

## Research-Based Design

This system implements findings from AI agent research:

### Best Practices Applied

1. **Proximity Principle** - Local context overrides global
2. **Progressive Disclosure** - Load only what's needed
3. **Structured Handoffs** - Clear phase transitions
4. **Quality Gates** - Verify before proceeding
5. **Hybrid Approach** - Workflows (80%) + Agents (20%)
6. **Supervisor Pattern** - Orchestrator coordinates specialists

### Common Problems Avoided

❌ **Not Done:**
- Auto-generating massive AGENTS.md files
- Loading all context at once
- Unclear role separation
- Skipping quality checks
- No state management

✅ **Instead:**
- Manual, focused configuration
- Dynamic, phase-based loading
- Clear orchestrator/specialist split
- Mandatory quality gates
- Persistent context

---

## Metrics & Statistics

### System Size
- **Total Files:** 40+
- **Total Size:** ~450 KB
- **Templates:** 19 specialist templates
- **Workflows:** 4 workflow types
- **Phases:** 5 phases per workflow
- **Core Components:** 3 services

### Template Breakdown
| Category | Count | Avg Size |
|----------|-------|----------|
| Development | 9 | ~16 KB |
| Creative | 3 | ~16 KB |
| Analysis | 3 | ~15 KB |
| Productivity | 3 | ~14 KB |
| General | 1 | ~6 KB |

---

## Getting Started

### Quick Start (5 minutes)
1. Navigate to `agents-hub/` directory
2. Start your AI assistant
3. AGENTS.md loads automatically
4. Describe what you want to build
5. Follow the guided phases

### Example Tasks
- "Build a todo list web app"
- "Write a blog post about AI"
- "Research competitor landscape"
- "Create a business plan"

See `QUICKSTART.md` for detailed instructions.

---

## Extension Points

### Custom Workflows
Add new workflow types by creating `workflows/{name}.yaml`

### Custom Phases
Add custom phases by creating `phases/{name}.md`

### Custom Specialists
Add new specialists by creating `templates/AGENTS-{name}.md`

### Custom Skills
Add reusable skills in `skills/{skill-name}/`

---

## Summary

Agents Hub provides:

✅ **Structure** - Clear workflows and phases
✅ **Flexibility** - Dynamic specialist loading
✅ **Quality** - Gates at each phase
✅ **Continuity** - Persistent context
✅ **Scalability** - Modular design
✅ **Research-Backed** - Based on AI agent best practices

**Ready to use?** Open `agents-hub/` and start building! 🚀
