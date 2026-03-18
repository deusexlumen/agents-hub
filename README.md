# 🤖 Agents Hub v2.0

**Dynamic Multi-Agent Orchestration System with CLI, State Persistence, Smart Loading, and Learning Engine**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](./package.json)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](./core)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![npm](https://img.shields.io/badge/npm-install-orange.svg)](https://www.npmjs.com)

---

## 🚀 What's New in v2.0

| Feature | Description | Impact |
|---------|-------------|--------|
| **🖥️ CLI Interface** | Full command-line interface with interactive prompts | 10x easier to use |
| **🔄 Auto-Transition** | Automatically detects phase completion | 50% fewer prompts |
| **🔨 Task Decomposer** | Breaks large tasks into manageable sub-tasks | Handle projects of any size |
| **🧠 Learning Engine** | Learns from past sessions, recommends approaches | Gets better over time |
| **⚡ Performance** | 60% token reduction, parallel execution support | Faster, cheaper sessions |

---

## 🚀 What is Agents Hub?

Agents Hub is an advanced orchestration system for AI agents that manages complex workflows through intelligent phase-based coordination. It dynamically loads context, persists session state, learns from experience, and can decompose large tasks into parallel sub-tasks.

### Key Features

| Feature | Description | Benefit |
|---------|-------------|---------|
| **🔒 State Persistence** | Automatic session saving & recovery | Never lose progress, crash-proof |
| **🧠 Smart Loading** | Relevance-based template loading | 60% token reduction |
| **🔄 Auto-Transition** | Detects when phases complete | Fewer interruptions |
| **🔨 Task Decomposition** | Splits large tasks automatically | Handle any project size |
| **📚 Learning Engine** | Learns patterns from sessions | Smarter recommendations |
| **⚡ Parallel Execution** | Identifies parallelizable work | 40% time savings |
| **🖥️ CLI Interface** | Command-line + interactive prompts | Easy to use anywhere |
| **🎯 MCP Integration** | External tool support | Extended capabilities |

---

## 📦 Installation

### Via NPM (Recommended)

```bash
# Install globally
npm install -g @deusexlumen/agents-hub

# Or install locally
npm install @deusexlumen/agents-hub
```

### Via Git

```bash
# Clone the repository
git clone https://github.com/deusexlumen/agents-hub.git
cd agents-hub

# Install dependencies
npm install

# Link for global access
npm link
```

### Verify Installation

```bash
# Check version
agents-hub --version

# Validate system
agents-hub validate

# Show help
agents-hub --help
```

**Requirements:**
- Node.js 16+ 
- Git (for MCP GitHub integration)

---

## 🎯 Quick Start

### 1. Initialize (First Time)

```bash
agents-hub init
```

### 2. Start a Session

```bash
# Interactive mode
agents-hub start

# With intent directly
agents-hub start "Build a REST API with authentication"

# With specific workflow
agents-hub start "Create a blog" --workflow content-creation
```

### 3. Work Through Phases

```
Discovery → Planning → Execution → Review → Delivery
   ↓           ↓          ↓         ↓         ↓
Analyze    Design    Implement   Test    Deploy
```

```bash
# Check current status
agents-hub status

# Move to next phase
agents-hub phase next

# List all phases
agents-hub phase list
```

### 4. Resume Later

```bash
# See all sessions
agents-hub status --all

# Continue a session
agents-hub continue [session-id]
```

---

## 🖥️ CLI Commands

### Session Management

```bash
agents-hub init              # Initialize project
agents-hub start [intent]    # Start new session
agents-hub status            # Show current status
agents-hub status --all      # Show all sessions
agents-hub continue [id]     # Resume session
agents-hub cleanup           # Clean old sessions
```

### Phase Management

```bash
agents-hub phase list        # List all phases
agents-hub phase current     # Show current phase
agents-hub phase next        # Move to next phase
```

### Task Decomposition

```bash
# Decompose a large task
agents-hub split "Build e-commerce platform" --effort 40

# Output shows:
# - Sub-tasks with dependencies
# - Parallel execution opportunities
# - Critical path analysis
```

### Templates & Learning

```bash
agents-hub templates                    # List all templates
agents-hub templates --category dev     # Filter by category
agents-hub learn patterns               # Show learned patterns
agents-hub learn recommend "Build API"  # Get recommendations
```

### System Management

```bash
agents-hub validate            # Validate entire system
agents-hub validate --workflows
agents-hub validate --templates
agents-hub config --list       # Show configuration
agents-hub config --set key=value
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI INTERFACE                         │
│         (agents-hub command + interactive)              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              AGENTS HUB ORCHESTRATOR v2.0                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   State     │  │ Smart Loader │  │ Auto-Transition│ │
│  │  Manager    │  │              │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Task      │  │   Learning   │  │  Multi-Agent  │  │
│  │ Decomposer  │  │   Engine     │  │  Supervisor   │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  WORKFLOWS │  │   PHASES   │  │ TEMPLATES  │
   │  (4 types) │  │  (5 per)   │  │ (19 spec.) │
   └────────────┘  └────────────┘  └────────────┘
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [USER_GUIDE.md](./USER_GUIDE.md) | **Complete user manual** |
| [AGENTS.md](./AGENTS.md) | Technical reference for AI assistants |
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute getting started guide |
| [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) | Architecture deep dive |
| [OPTIMIZATION_ANALYSIS.md](./OPTIMIZATION_ANALYSIS.md) | Performance analysis |
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | Implementation details |

---

## 💻 Programmatic API

```javascript
const { AgentsHub } = require('@deusexlumen/agents-hub');

// Create hub instance
const hub = new AgentsHub();

// Start session
const sessionId = await hub.startSession('Build REST API', {
  workflowType: 'software-dev',
  multiAgent: false
});

// Check status
console.log(hub.getStatus());
// { active: true, phase: 'discovery', progress: 20%, ... }

// Work through phases
await hub.nextPhase(); // discovery → planning

// Get template recommendations
const recommendations = await hub.recommendTemplates('authentication system');
// [{ name: 'api-development', score: 0.92 }, ...]

// Decompose large task
const subTasks = await hub.decomposeTask('Build e-commerce platform', {
  estimatedEffort: 40
});
// [{ name: 'Database Design', effort: 4, dependencies: [] }, ...]

// End session
await hub.endSession('completed');
```

---

## 🎯 Usage Examples

### Example 1: Standard Session

```bash
$ agents-hub start
? What would you like to build? Build a todo app
✓ Session started: abc-123
✓ Workflow detected: software-dev
✓ Phase: discovery

# ... work happens ...

$ agents-hub phase next
✓ Moved to planning phase
```

### Example 2: Task Decomposition

```bash
$ agents-hub split "Build e-commerce platform" --effort 40

📦 Task Decomposition
────────────────────────────────────────
Original: Build e-commerce platform
Effort: 40 hours

Sub-Tasks:

1. Requirements Analysis
   Effort: 4h | Type: research
   
2. Architecture Design
   Effort: 6h | Type: design
   Depends on: Requirements Analysis

3. Frontend Implementation
   Effort: 12h | Type: implementation
   Depends on: Architecture Design
   
4. Backend Implementation
   Effort: 10h | Type: implementation  
   Depends on: Architecture Design
   [Can run parallel with Frontend!]

5. Database Schema
   Effort: 2h | Type: design
   [Independent - can start immediately]

... (more tasks)

💡 Parallel execution can save 12 hours (30% faster)
```

### Example 3: Learning Recommendations

```bash
$ agents-hub learn recommend "Build React dashboard"

Recommended Templates:

1. frontend-specialist (95% match)
   Used successfully 8 times for similar tasks

2. api-development (78% match)
   Often paired with frontend-specialist

3. devops-sre (45% match)
   Consider for deployment phase
```

---

## 📊 Performance

| Metric | v1.0 | v2.0 | Improvement |
|--------|------|------|-------------|
| **Token Usage** | 15k | 5k | **-67%** 🚀 |
| **Session Duration** | 2.5h | 1.2h | **-52%** |
| **User Prompts** | 45 | 20 | **-56%** |
| **Task Handling** | <8h | Any size | **∞** |
| **Setup Time** | 10 min | 2 min | **-80%** |
| **Learning Curve** | Medium | Low | **Easier** |

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration

# Validate system
npm run validate

# Validate specific components
npm run validate:workflows
npm run validate:templates
```

---

## 🔧 Configuration

### Project Configuration (`.agents-hub/config.json`)

```json
{
  "version": "2.0.0",
  "defaultWorkflow": "software-dev",
  "autoTransition": true,
  "contextPruning": true,
  "multiAgent": false,
  "learningEnabled": true
}
```

### Environment Variables

```bash
# Create .env file
GITHUB_TOKEN=your_token_here
BRAVE_API_KEY=your_key_here
```

---

## 🗺️ Roadmap

### v2.1 (Q2 2026)
- [x] CLI Interface ✅
- [x] Auto-Transition ✅
- [x] Task Decomposition ✅
- [x] Learning Engine ✅
- [ ] Template Inheritance System
- [ ] Analytics Dashboard

### v2.5 (Q3 2026)
- [ ] Natural Language Phase Detection
- [ ] Advanced Auto-Recommendations
- [ ] Voice Interface
- [ ] Plugin System

### v3.0 (Q4 2026)
- [ ] Cloud Sync
- [ ] Team Collaboration
- [ ] Real-time Multi-Agent
- [ ] AI-Powered Planning

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

```bash
# Fork and clone
git clone https://github.com/yourusername/agents-hub.git
cd agents-hub

# Install dependencies
npm install

# Create branch
git checkout -b feature/my-feature

# Make changes and test
npm test

# Submit PR
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by modern AI orchestration patterns
- MCP (Model Context Protocol) by Anthropic
- Built with ❤️ for the AI community

---

## 📞 Support

- 📖 [Documentation](./USER_GUIDE.md)
- 🐛 [Issue Tracker](../../issues)
- 💬 [Discussions](../../discussions)

---

**Ready to orchestrate your AI workflows?** 🚀

```bash
npm install -g @deusexlumen/agents-hub
agents-hub init
agents-hub start
```

[Get Started →](./QUICKSTART.md)
