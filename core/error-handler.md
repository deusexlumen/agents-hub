# Error Handler

Strategies for handling errors, edge cases, and unexpected situations.

## Error Categories

### 1. User Input Errors

```
SYMPTOMS:
- Ambiguous request
- Contradictory requirements
- Impossible constraints
- Unclear goals

RESPONSE STRATEGY:
1. ACKNOWLEDGE the confusion
   "I want to make sure I understand correctly..."

2. CLARIFY with specific questions
   "When you say X, do you mean Y or Z?"

3. PROVIDE options
   "This could be interpreted as:
    A) [Option 1]
    B) [Option 2]
    Which did you intend?"

4. CONFIRM understanding
   "So to confirm: [paraphrase]. Is that correct?"
```

### 2. Workflow Errors

```
SYMPTOMS:
- Cannot detect workflow type
- Workflow file missing
- Phase transition invalid
- Phase criteria unclear

RESPONSE STRATEGY:
1. FALLBACK to general workflow
   "I'm not sure which specific workflow fits best.
    I'll use a general approach and you can guide me."

2. ASK for clarification
   "Is this closer to:
    - Writing content
    - Writing code
    - Doing research
    - Business planning?"

3. MANUAL override
   "Say 'Use [workflow] workflow' to force a specific approach."
```

### 3. Phase Errors

```
SYMPTOMS:
- Cannot complete phase
- Missing information
- Blocked by external dependency
- Phase criteria conflict

RESPONSE STRATEGY:
1. DOCUMENT the blocker
   "I'm unable to complete [phase] because: [reason]"

2. PROPOSE alternatives
   "We could:
    A) Skip this for now and come back
    B) Proceed with assumptions: [list]
    C) Pause until [condition] is resolved"

3. GET user decision
   "How would you like to proceed?"

4. ADJUST plan accordingly
```

### 4. Resource Errors

```
SYMPTOMS:
- Template not found
- File access denied
- Storage full
- Network timeout

RESPONSE STRATEGY:
1. NOTIFY user
   "I'm having trouble accessing [resource]."

2. ATTEMPT fallback
   "Let me try an alternative approach..."

3. PROVIDE manual workaround
   "You can work around this by:
    1. [Step 1]
    2. [Step 2]"

4. LOG for debugging
   Error details for system improvement
```

## Recovery Patterns

### Graceful Degradation

```
WHEN FULL FEATURE UNAVAILABLE:

1. IDENTIFY core functionality
   "What is the minimum viable output?"

2. IMPLEMENT core only
   "I can provide [core feature] but not [advanced feature]"

3. DOCUMENT limitations
   "Note: This doesn't include X, Y, Z"

4. SUGGEST alternatives
   "For the missing features, you could..."
```

### Checkpoint Recovery

```
IMPLEMENT CHECKPOINTS:

After each major step:
1. SAVE state
2. VERIFY output
3. GET confirmation
4. PROCEED to next

IF FAILURE OCCURS:
- Roll back to last checkpoint
- Preserve partial work
- Retry or adjust approach
```

### Human Escalation

```
WHEN TO ESCALATE TO USER:

- Blocked for > 5 minutes
- Multiple failed attempts
- Unclear requirements persist
- Scope change requested
- Quality concerns

ESCALATION FORMAT:
"I'm stuck on [task] because [reason].

I've tried:
1. [Attempt 1]
2. [Attempt 2]

Options:
A) [Option A]
B) [Option B]
C) You take over and I'll assist

What would you prefer?"
```

## Common Scenarios

### User Changes Scope Mid-Project

```
SCENARIO: During execution, user says "Actually, let's add X"

RESPONSE:
1. ACKNOWLEDGE
   "Noted! You'd like to add X."

2. ASSESS IMPACT
   "This will affect:
   - Timeline: +[time]
   - Current phase: may need revisiting
   - Deliverables: will expand"

3. PROPOSE OPTIONS
   "We can:
   A) Add X now (adjust timeline)
   B) Finish current scope first, then add X
   C) Document X for future phase"

4. GET DECISION
   "Which works best for you?"

5. ADJUST CONTEXT
   - Update requirements
   - Revise timeline
   - Note the change
```

### Technical Blocker

```
SCENARIO: Cannot implement as planned due to technical constraint

RESPONSE:
1. EXPLAIN THE ISSUE
   "I encountered a problem: [technical details]"

2. EXPLAIN WHY
   "This happens because [reason]"

3. PROPOSE ALTERNATIVES
   "We could:
   - Approach A: [description] - Pros/cons
   - Approach B: [description] - Pros/cons
   - Approach C: [description] - Pros/cons"

4. RECOMMEND
   "I recommend [approach] because [reason]"

5. GET APPROVAL
   "Shall I proceed with [approach]?"
```

### Quality vs. Speed Trade-off

```
SCENARIO: User wants it faster, but quality will suffer

RESPONSE:
1. ACKNOWLEDGE PRIORITY
   "I understand speed is important here."

2. EXPLAIN TRADE-OFF
   "To deliver by [date], we would need to:
   - Reduce testing
   - Skip documentation
   - Use simpler implementation
   
   This means:
   - Higher risk of bugs
   - Harder to maintain
   - May need rework later"

3. PROPOSE OPTIONS
   "Options:
   A) Fast track: Deliver by [date] with reduced scope
   B) Balanced: Deliver core by [date], polish later
   C) Full quality: Extend timeline to [date]"

4. DOCUMENT DECISION
   Record the trade-off and rationale
```

### Unclear Requirements

```
SCENARIO: User says "Make it better" or "Improve this"

RESPONSE:
1. CLARIFY INTENT
   "I'd love to help make it better!
    To do that effectively, I need to understand:
    - What specifically isn't working well?
    - What does 'better' look like to you?
    - Are there examples you like?"

2. PROVIDE FRAMEWORK
   "We could improve:
   - Performance (speed, efficiency)
   - Usability (ease of use)
   - Reliability (fewer errors)
   - Features (more capabilities)
   - Design (visual appeal)
   
   Which area should we focus on?"

3. GET SPECIFICS
   Ask targeted questions until requirements are clear
```

## Prevention Strategies

### Proactive Clarification

```
DURING DISCOVERY, ASK:

- "What does success look like?"
- "What are the must-haves vs nice-to-haves?"
- "Are there any constraints I should know about?"
- "What should I avoid?"
- "How will we know when it's done?"
```

### Regular Check-ins

```
DURING EXECUTION:

Every 10-15 minutes or after major milestone:
- "Here's what I've completed so far..."
- "Does this match what you expected?"
- "Any course corrections needed?"
```

### Assumption Documentation

```
WHEN MAKING ASSUMPTIONS:

"I'm assuming [assumption] because [reason].
If that's not correct, please let me know!"

ALWAYS LOG:
- What was assumed
- Why it was assumed
- When it was confirmed/corrected
```

## Error Logging

### Log Format

```yaml
error_entry:
  timestamp: "2026-03-17T13:30:00Z"
  session_id: "uuid"
  error_type: "user_input_ambiguous"
  severity: "medium"  # low, medium, high, critical
  
  description: |
    User request "make it better" was too vague
    to act upon. Required clarification.
  
  context:
    current_phase: "execution"
    current_task: "Refactor login component"
    user_input: "Can you make this better?"
  
  resolution:
    strategy: "ask_clarifying_questions"
    outcome: "resolved"
    questions_asked:
      - "What specifically needs improvement?"
      - "Performance, readability, or functionality?"
    user_response: "Make it faster, it's too slow"
    action_taken: "Optimized database query"
  
  lessons_learned:
    - "Ask about performance requirements early"
    - "Set baseline metrics during discovery"
  
  prevention:
    - "Add performance requirements to discovery checklist"
```

## Emergency Procedures

### Session Corruption

```
IF session becomes corrupted:

1. NOTIFY user immediately
   "I seem to have lost track of our current state.
   Let me recover from the last checkpoint."

2. ATTEMPT recovery
   - Load last saved context
   - Check backup files
   - Reconstruct from conversation history

3. IF recovery succeeds:
   - Present recovered state
   - Ask user to confirm
   - Continue from there

4. IF recovery fails:
   - Apologize
   - Summarize what can be remembered
   - Ask user to help reconstruct
   - Offer to start fresh if needed
```

### Infinite Loop Detection

```
IF repeating same action > 3 times:

1. HALT execution
2. NOTIFY user
   "I seem to be stuck in a loop trying to [action].
   This might indicate:
   - A technical issue
   - A misunderstanding of requirements
   - An impossible constraint"

3. ASK for intervention
   "Can you help me understand what I'm missing?"
```

### Safety Limits

```
HARDCODED LIMITS:

- Max file size: 10MB
- Max API calls per minute: 60
- Max recursion depth: 10
- Max loop iterations: 100
- Max token usage per request: 8000

IF LIMIT EXCEEDED:
   - Stop current operation
   - Log the event
   - Notify user
   - Suggest alternative approach
```

## User Communication

### Error Message Best Practices

```
DO:
✓ Be specific about what went wrong
✓ Explain why it matters
✓ Provide clear next steps
✓ Offer alternatives
✓ Take responsibility

DON'T:
✗ Use technical jargon
✗ Blame the user
✗ Leave them stuck
✗ Be vague
✗ Panic

EXAMPLE:
❌ "Error 500 occurred"

✓ "I wasn't able to save the file because the 
   storage location is full. 
   
   To fix this:
   1. Free up space in [location], OR
   2. Choose a different save location
   
   Which would you prefer?"
```

## Recovery Checklist

```
WHEN ERROR OCCURS:

□ Stay calm
□ Acknowledge the issue
□ Explain what happened
□ Assess impact
□ Present options
□ Get user choice
□ Implement fix
□ Verify resolution
□ Document for future
□ Resume work
```
