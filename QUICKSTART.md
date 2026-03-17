# Agents Hub - Quick Start Guide

**Get started with the Agents Hub in 5 minutes.**

---

## What is Agents Hub?

Agents Hub is a **dynamic task orchestration system** that helps AI assistants manage complex projects by:
- Breaking work into phases (discovery → planning → execution → review → delivery)
- Loading only the context needed for the current phase
- Dynamically pulling in specialist knowledge when required
- Maintaining state across the entire project lifecycle

---

## Step 1: Start the Orchestrator

Navigate to the `agents-hub` directory and start your AI assistant. The `AGENTS.md` file will load automatically.

```bash
cd agents-hub
# Start your AI assistant (Kimi, Claude, etc.)
```

---

## Step 2: First Interaction

The orchestrator will greet you and ask what you want to work on:

```
Welcome to Agents Hub! 🎯

I'm your orchestrator - I coordinate complex tasks by dynamically loading 
the right instructions for each phase of work.

Current Status: Starting fresh

To get started, tell me:
1. What would you like to work on?
2. Is this a new task or continuing something?

Based on your answer, I'll:
- Select the appropriate workflow
- Load the right context
- Guide you through each phase

What are we building today?
```

---

## Step 3: Describe Your Task

Simply describe what you want to do. The orchestrator will detect the workflow type:

**Example inputs:**
- *"I need to build a website for my business"* → Software Development workflow
- *"Write a blog post about AI"* → Content Creation workflow  
- *"Research the competitive landscape"* → Research & Analysis workflow
- *"Create a business plan"* → Business Strategy workflow

---

## Step 4: Follow the Phases

The orchestrator will guide you through each phase:

### Phase 1: Discovery 🔍
**Goal:** Understand what you're building

The orchestrator will ask questions like:
- "What problem are we solving?"
- "Who is this for?"
- "What are the constraints?"

**You provide:** Requirements and context

---

### Phase 2: Planning 📋
**Goal:** Design the approach

The orchestrator will:
- Design the architecture/structure
- Create an implementation plan
- Identify resources needed

**You review and approve:** The plan

---

### Phase 3: Execution ⚙️
**Goal:** Build the solution

The orchestrator will:
- Implement according to plan
- Load specialist templates if needed
- Show progress regularly

**You provide:** Feedback and approvals

---

### Phase 4: Review ✅
**Goal:** Ensure quality

The orchestrator will:
- Review deliverables
- Check against requirements
- Incorporate your feedback

**You review:** And request changes if needed

---

### Phase 5: Delivery 📦
**Goal:** Hand off completed work

The orchestrator will:
- Package deliverables
- Create documentation
- Provide setup instructions

**You receive:** The final product

---

## Example Session

```
User: "I need to build a todo list app"

Orchestrator: "Great! I'll help you build a todo list app.
This will use the 'software-dev' workflow.

Let's start with discovery to understand your requirements...

1. What platform? (Web, mobile, desktop)
2. What features do you need?
3. Any technology preferences?"

User: "Web app, basic CRUD, I like React"

Orchestrator: "Perfect! I'll document these requirements and 
move to planning. [Proceeds through phases]

... [Time passes, work gets done] ...

Orchestrator: "Your todo app is complete! 🎉

Deliverables:
- Source code in tasks/todo-app/execution/
- README with setup instructions
- All tests passing

Next steps:
1. cd tasks/todo-app/execution
2. npm install
3. npm start

Questions? I'm here to help!"
```

---

## Commands You Can Use

During any session, say:

| Command | What Happens |
|---------|--------------|
| `"Start new task"` | Begin fresh workflow |
| `"Continue [task name]"` | Resume previous work |
| `"Show status"` | See current progress |
| `"Switch to [phase]"` | Jump to specific phase |
| `"Load [specialist]"` | Add specialist knowledge |
| `"What's next?"` | Get recommendations |
| `"Help"` | Show all commands |

---

## Directory Structure

```
agents-hub/
├── AGENTS.md              ← Orchestrator loads first
├── workflows/             ← Workflow definitions
│   ├── software-dev.yaml
│   ├── content-creation.yaml
│   ├── research-analysis.yaml
│   └── business-strategy.yaml
├── phases/                ← Phase instructions
│   ├── discovery.md
│   ├── planning.md
│   ├── execution.md
│   ├── review.md
│   └── delivery.md
├── templates/             ← Specialist knowledge
│   ├── AGENTS-web-development.md
│   ├── AGENTS-content-creator.md
│   └── ... (19 templates)
├── core/                  ← Orchestration logic
├── tasks/                 ← Your projects
│   └── {task-name}/
│       ├── context.yaml
│       ├── discovery/
│       ├── planning/
│       ├── execution/
│       ├── review/
│       └── delivery/
└── logs/                  ← Session logs
```

---

## Tips for Success

### 1. Be Clear About Goals
The better you describe what you want, the better the results:
- ❌ "Build something"
- ✅ "Build a mobile app for tracking workouts"

### 2. Provide Feedback
Don't wait until the end to speak up:
- "That's not quite what I meant..."
- "Can we try a different approach?"
- "This looks great, proceed!"

### 3. Use Phases Appropriately
Each phase has a purpose:
- Don't rush through discovery
- Don't skip planning
- Don't deliver without review

### 4. Load Specialists When Needed
If your task needs specific expertise:
- "Load web development specialist"
- "Load content creator specialist"
- "Load data analyst specialist"

### 5. Review Deliverables
Always check the work:
- Does it meet requirements?
- Is the quality acceptable?
- Are there any issues?

---

## Workflows Explained

### Software Development
For coding projects: websites, apps, APIs, scripts
- **Phases:** 5 (discovery → delivery)
- **Specialists:** Web, mobile, API, game dev, DevOps
- **Output:** Working code with tests

### Content Creation
For creative work: writing, design, video
- **Phases:** 5 (discovery → delivery)
- **Specialists:** Writer, designer, video producer
- **Output:** Published-ready content

### Research & Analysis
For investigations: market research, data analysis
- **Phases:** 5 (discovery → delivery)
- **Specialists:** Researcher, data analyst
- **Output:** Reports with insights

### Business Strategy
For planning: strategy, business plans, growth
- **Phases:** 5 (discovery → delivery)
- **Specialists:** Business strategist, analyst
- **Output:** Strategic plans and recommendations

---

## Troubleshooting

### "Orchestrator didn't load"
- Make sure you're in the `agents-hub` directory
- Check that `AGENTS.md` exists
- Try reloading your AI assistant

### "Wrong workflow selected"
- Be more specific in your request
- Or say explicitly: "Use [workflow] workflow"

### "Want to skip a phase"
- Say: "Skip to [phase name]"
- Note: This bypasses quality checks

### "Need to change something"
- Say: "Let's go back to [phase]"
- Or: "I need to revise [requirement]"

---

## Next Steps

1. **Try it out:** Start with a simple task
2. **Explore:** Look at the example task structure
3. **Customize:** Edit workflows for your needs
4. **Extend:** Add your own specialist templates

---

## Getting Help

- **Read the docs:** See `README.md` for full documentation
- **Check examples:** Look at `tasks/example-task/`
- **Review templates:** Browse `templates/` directory
- **Ask the orchestrator:** Say "Help" anytime

---

**Ready to start?** Open `agents-hub` and tell the orchestrator what you want to build! 🚀
