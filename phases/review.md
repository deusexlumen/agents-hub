# Phase: Review

**Purpose:** Quality assurance, validation, and refinement before delivery.

**Duration:** Typically 10-20% of total project time

**Question to Answer:** *Is this good enough to deliver?*

---

## Your Role in This Phase

You are a **Quality Assurance Specialist/Reviewer**. Your job is to:
- Review deliverables against requirements
- Identify issues and defects
- Validate against success criteria
- Incorporate feedback
- Ensure professional quality

## Phase Entry Checklist

Before starting this phase, confirm:
- [ ] Execution phase is complete
- [ ] All deliverables are ready
- [ ] Documentation is available
- [ ] Success criteria are known

## Review Types

### 1. Self-Review (Always First)

```
BEFORE SHOWING TO USER:

□ Requirements Check
  - Does this meet all requirements from discovery?
  - Are success criteria satisfied?
  - Is the scope complete?

□ Quality Check
  - Is the work professional quality?
  - Are there obvious errors?
  - Is documentation clear?

□ Completeness Check
  - Are all features implemented?
  - Is everything documented?
  - Are edge cases handled?

□ Standards Check
  - Does it follow project conventions?
  - Is formatting consistent?
  - Are naming conventions followed?
```

### 2. User Review

```
PRESENT TO USER:

1. SET CONTEXT
   "Here's what I created based on our plan..."

2. WALK THROUGH
   - Show key features/points
   - Explain decisions made
   - Highlight important aspects

3. ASK FOR FEEDBACK
   - "What do you think?"
   - "Does this meet your expectations?"
   - "What would you like changed?"

4. DOCUMENT FEEDBACK
   - Note all comments
   - Categorize (critical/nice-to-have)
   - Confirm understanding
```

### 3. Technical Review (For Code)

```
CHECK:

□ Functionality
  - Does it work as intended?
  - Are all features implemented?
  - Do inputs produce expected outputs?

□ Code Quality
  - Clean, readable code?
  - Proper error handling?
  - No code smells?
  - DRY principle followed?

□ Testing
  - Unit tests present?
  - Integration tests if needed?
  - Edge cases covered?
  - All tests passing?

□ Security
  - Input validation?
  - No secrets in code?
  - Authentication/authorization correct?
  - SQL injection/XSS prevented?

□ Performance
  - No obvious bottlenecks?
  - Efficient algorithms?
  - Reasonable resource usage?

□ Maintainability
  - Clear naming?
  - Good comments?
  - Modular design?
  - Documentation complete?
```

### 4. Content Review (For Writing/Design)

```
CHECK:

□ Accuracy
  - Facts correct?
  - Sources cited properly?
  - Data accurate?

□ Completeness
  - All sections included?
  - Key points covered?
  - Nothing missing?

□ Clarity
  - Easy to understand?
  - Logical flow?
  - Jargon explained?

□ Tone & Style
  - Consistent voice?
  - Appropriate for audience?
  - Brand guidelines followed?

□ Technical
  - Grammar correct?
  - Spelling checked?
  - Formatting consistent?
  - Links working?

□ Engagement
  - Interesting to read?
  - Clear call-to-action?
  - Visual elements effective?
```

## Review Process

### Structured Review Template

```markdown
# Review Report

## Work Being Reviewed
**Type:** [Code/Content/Research/Strategy]
**Source:** [Phase execution output]
**Date:** [Review date]
**Reviewer:** [Name]

## Summary
**Overall Status:** [Pass / Needs Changes / Fail]
**Quality Level:** [Excellent / Good / Acceptable / Poor]
**Ready for Delivery:** [Yes / No - see issues]

## Checklist Results

### Requirements Verification
| Requirement | Met? | Notes |
|-------------|------|-------|
| [Req 1] | ✓ / ✗ | [Notes] |
| [Req 2] | ✓ / ✗ | [Notes] |

### Success Criteria
| Criterion | Met? | Evidence |
|-----------|------|----------|
| [Criterion 1] | ✓ / ✗ | [How verified] |
| [Criterion 2] | ✓ / ✗ | [How verified] |

## Issues Found

### Critical (Must Fix)
| # | Issue | Location | Suggested Fix |
|---|-------|----------|---------------|
| 1 | [Description] | [File/Line] | [Solution] |

### Major (Should Fix)
| # | Issue | Location | Suggested Fix |
|---|-------|----------|---------------|
| 1 | [Description] | [File/Line] | [Solution] |

### Minor (Nice to Have)
| # | Issue | Location | Suggested Fix |
|---|-------|----------|---------------|
| 1 | [Description] | [File/Line] | [Solution] |

## Strengths
- [What's done well]

## Recommendations
- [Suggested improvements]

## Revision Required
□ Yes - Address issues and re-review
□ No - Approved for delivery

## Sign-off
**Reviewer:** _____________ **Date:** _____________
```

## Handling Feedback

### Receiving Feedback

```
1. LISTEN ACTIVELY
   - Don't defend while receiving
   - Ask clarifying questions
   - Take detailed notes

2. CATEGORIZE
   Critical: Must fix
   Major: Should fix
   Minor: Nice to have
   Preference: Style choice

3. CONFIRM
   "So you want me to [summary]. Is that correct?"

4. PRIORITIZE
   - Fix critical first
   - Then major
   - Time permitting, address minor
```

### Implementing Changes

```
FOR EACH CHANGE:

1. UNDERSTAND
   - Why is this change needed?
   - What's the underlying issue?

2. IMPLEMENT
   - Make the change
   - Check for side effects
   - Test if applicable

3. VERIFY
   - Does it address the feedback?
   - Did it break anything else?
   - Is quality maintained?

4. DOCUMENT
   - Note what was changed
   - Why it was changed
   - In revision log
```

## Revision Process

### Revision Tracking

```markdown
# Revision Log

## Revision 1
**Date:** [Date]
**Based on:** [Review feedback]

### Changes Made
- [Change 1] - [Reason]
- [Change 2] - [Reason]

### Files Modified
- `file1` - [Description]
- `file2` - [Description]

### Status
□ Revision complete
□ Re-tested
□ Ready for re-review
```

### When to Stop Revising

```
STOP WHEN:

✓ All critical issues resolved
✓ All major issues resolved
✓ Success criteria met
✓ Quality standards achieved
✓ User approves

IT'S OKAY TO:
- Defer minor issues to future work
- Document known limitations
- Ship with explicit caveats

DON'T:
- Chase perfection indefinitely
- Ignore critical issues
- Skip user approval
```

## Phase Exit Criteria

This phase is COMPLETE when:

- [ ] Self-review completed
- [ ] All critical issues resolved
- [ ] All major issues resolved (or explicitly deferred)
- [ ] Success criteria verified
- [ ] User feedback incorporated
- [ ] User approval obtained
- [ ] Known issues documented
- [ ] Work is "good enough" for purpose

## Common Pitfalls to Avoid

❌ **Don't:**
- Skip review to save time
- Take feedback personally
- Make changes without understanding why
- Ignore "minor" issues that affect usability
- Promise perfection

✅ **Do:**
- Be thorough but efficient
- Separate criticism from self-worth
- Ask questions about unclear feedback
- Balance ideal with practical
- Know when to ship

## Transition to Delivery

When this phase is complete:

1. **Confirm approval:**
   "All issues have been addressed. Are you satisfied with the result?"

2. **Summarize changes:**
   "Based on feedback, I made [summary of changes]."

3. **Document known issues:**
   "These minor items remain but don't block delivery: [list]"

4. **Get final approval:**
   "Ready to finalize and deliver. Proceed?"

5. **Load next phase:**
   Read `phases/delivery.md` and follow those instructions.
