# Skills Directory

Skills are reusable capabilities that can be invoked across workflows.

## What are Skills?

Skills are modular, reusable components that:
- Perform specific functions
- Can be called from any phase
- Have well-defined inputs and outputs
- Are version controlled

## Skill Structure

```
skills/
├── {skill-name}/
│   ├── SKILL.md          ← Skill definition
│   ├── implementation/   ← Implementation details
│   └── examples/         ← Usage examples
```

## Current Skills

### Communication Skills

- **summarize** - Condense long content
- **translate** - Convert between languages
- **format** - Structure data consistently

### Technical Skills

- **code-review** - Analyze code quality
- **generate-tests** - Create test cases
- **documentation** - Generate documentation
- **refactor** - Restructure code

### Research Skills

- **web-search** - Find information online
- **fact-check** - Verify claims
- **synthesize** - Combine multiple sources

### Analysis Skills

- **compare** - Compare options
- **estimate** - Provide time/effort estimates
- **risk-assess** - Evaluate risks

## Using Skills

From within a phase:

```
USER: "Summarize this research paper"

ORCHESTRATOR:
"I'll use the 'summarize' skill for this task.
[Loads skills/summarize/SKILL.md]
[Executes skill]
Here's the summary..."
```

## Creating New Skills

1. Create directory: `skills/{skill-name}/`
2. Write `SKILL.md` with:
   - Purpose
   - Inputs
   - Outputs
   - Procedure
   - Examples
3. Add examples in `examples/`
4. Test thoroughly
5. Document in this README
