# Phase: Planning

**Purpose:** Design the approach, architecture, and detailed implementation plan.

**Duration:** Typically 15-30% of total project time

**Question to Answer:** *How will we build this?*

---

## Your Role in This Phase

You are a **Solution Architect/Planner**. Your job is to:
- Design the overall approach
- Select appropriate technologies
- Create a detailed implementation plan
- Identify resources and dependencies
- Set milestones and timeline

## Phase Entry Checklist

Before starting this phase, confirm:
- [ ] Discovery phase is complete
- [ ] Requirements are documented
- [ ] Constraints are understood
- [ ] Success criteria are defined

## Planning Activities

### 1. Approach Selection

```
DECISION FRAMEWORK:

For each major decision, document:
- Options considered
- Pros/cons of each
- Why selected option was chosen
- Trade-offs accepted

Example decisions:
- Architecture pattern
- Technology stack
- Third-party dependencies
- Integration approach
```

### 2. Architecture/Structure Design

#### For Software Projects

```
DOCUMENT:

1. HIGH-LEVEL ARCHITECTURE
   - System diagram (describe in text)
   - Component interactions
   - Data flow

2. TECHNOLOGY STACK
   | Layer | Technology | Rationale |
   |-------|------------|-----------|
   | Frontend | [Tech] | [Why] |
   | Backend | [Tech] | [Why] |
   | Database | [Tech] | [Why] |
   | Hosting | [Platform] | [Why] |

3. FILE STRUCTURE
   ```
   project/
   ├── [directory]/
   │   └── [purpose]
   └── ...
   ```

4. KEY COMPONENTS
   - Component 1: [Responsibility]
   - Component 2: [Responsibility]
```

#### For Content Projects

```
DOCUMENT:

1. CONTENT STRUCTURE
   - Outline with headings
   - Key points per section
   - Transitions between sections

2. STYLE & TONE
   - Voice guidelines
   - Vocabulary level
   - Sentence structure preferences

3. ASSET PLAN
   | Asset | Type | Source | Status |
   |-------|------|--------|--------|
   | [Name] | Image/Data | Create/Find | Pending |

4. PRODUCTION TIMELINE
   | Task | Duration | Dependencies |
   |------|----------|--------------|
   | [Task] | [Time] | [Prereqs] |
```

#### For Research Projects

```
DOCUMENT:

1. METHODOLOGY
   - Research approach
   - Data collection methods
   - Analysis framework

2. SOURCE STRATEGY
   - Primary sources
   - Secondary sources
   - Search strategy

3. ANALYSIS PLAN
   - How data will be analyzed
   - Tools to be used
   - Synthesis approach
```

### 3. Implementation Sequence

```
BREAK DOWN INTO STEPS:

Phase Execution Plan:
1. [Step 1]
   - Duration: [X minutes/hours]
   - Deliverable: [What will exist after]
   - Dependencies: [What must be done first]

2. [Step 2]
   - Duration: [X minutes/hours]
   - Deliverable: [What will exist after]
   - Dependencies: [What must be done first]

[Continue...]
```

### 4. Risk Assessment

```
IDENTIFY & MITIGATE:

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Strategy] |
| [Risk 2] | High/Med/Low | High/Med/Low | [Strategy] |
```

## Planning Documentation Template

```markdown
# Planning Document

## Overview
**Approach:** [High-level strategy]
**Estimated Duration:** [Total time estimate]
**Key Milestones:** [Major checkpoints]

## Architecture/Structure

### High-Level Design
[Description and/or diagram reference]

### Technology Decisions
| Decision | Selected Option | Rationale |
|----------|-----------------|-----------|
| [Decision 1] | [Choice] | [Why] |
| [Decision 2] | [Choice] | [Why] |

### Structure/Organization
```
[Directory structure or content outline]
```

## Implementation Plan

### Phase Breakdown
1. **Step 1:** [Description]
   - **Duration:** [Time]
   - **Output:** [Deliverable]
   - **Dependencies:** [Prerequisites]

2. **Step 2:** [Description]
   - **Duration:** [Time]
   - **Output:** [Deliverable]
   - **Dependencies:** [Prerequisites]

### Timeline
| Phase | Start | End | Duration | Status |
|-------|-------|-----|----------|--------|
| [Phase] | [Date] | [Date] | [Duration] | Planned |

## Resource Requirements

### Tools & Technologies
- [Tool 1]: [Purpose]
- [Tool 2]: [Purpose]

### External Dependencies
- [Dependency 1]: [Status/Risk]
- [Dependency 2]: [Status/Risk]

## Quality Assurance

### Testing/Validation Strategy
- [How will quality be ensured]

### Review Points
- [When will reviews happen]

## Risk Management

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| [Risk] | High/Med/Low | High/Med/Low | [Strategy] |

## Success Criteria Verification

How each success criterion from discovery will be met:

| Criterion | How We'll Verify |
|-----------|------------------|
| [Criterion 1] | [Method] |
| [Criterion 2] | [Method] |

## Next Steps
- [ ] Begin execution
- [ ] Load specialist template if needed
- [ ] Set up project structure
- [ ] [Any other preparatory steps]

---
**Phase Completed:** [Date]
**By:** [Agent/User]
```

## Phase Exit Criteria

This phase is COMPLETE when:

- [ ] Overall approach is designed and documented
- [ ] Architecture/structure is defined
- [ ] Technology choices are made and justified
- [ ] Implementation sequence is planned
- [ ] Timeline is established with milestones
- [ ] Risks are identified and mitigation strategies defined
- [ ] Resource requirements are documented
- [ ] User has approved the plan

## Common Pitfalls to Avoid

❌ **Don't:**
- Over-engineer the solution
- Ignore constraints from discovery
- Skip validation steps
- Make assumptions without documenting them
- Promise unrealistic timelines

✅ **Do:**
- Keep the plan achievable
- Document trade-offs
- Include buffer time for unexpected issues
- Get explicit approval before proceeding
- Consider edge cases

## Transition to Execution

When this phase is complete:

1. **Present the plan:**
   "Here's the detailed plan: [summary]. Does this look good?"

2. **Confirm timeline:**
   "This will take approximately [time]. Does that work for you?"

3. **Get approval:**
   "Shall I proceed with execution based on this plan?"

4. **Load next phase:**
   Read `phases/execution.md` and follow those instructions.

## Specialist Integration

If this project requires specialist expertise:

1. Identify which specialist template is needed
2. Load the template from `templates/` directory
3. Merge specialist guidance with this plan
4. Proceed with execution using combined context
