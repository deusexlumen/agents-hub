# 🤖 Agents Hub

**Dynamic Multi-Agent Orchestration System with State Persistence, Smart Context Loading, and MCP Integration**

[![Version](https://img.shields.io/badge/version-2.0-blue.svg)](./IMPLEMENTATION_SUMMARY.md)
[![Tests](https://img.shields.io/badge/tests-60%2F60%20passing-brightgreen.svg)](./core)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## 🚀 What is Agents Hub?

Agents Hub is an advanced orchestration system for AI agents that manages complex workflows through intelligent phase-based coordination. It dynamically loads context, persists session state, and can coordinate multiple specialist agents in parallel.

### Key Features

| Feature | Description | Benefit |
|---------|-------------|---------|
| **🔒 State Persistence** | Automatic session saving & recovery | Never lose progress, crash-proof |
| **🧠 Smart Loading** | Relevance-based template loading | 45% token reduction, faster responses |
| **⚡ Performance Cache** | Multi-level caching (Memory + Disk) | 90% faster loading times |
| **🔄 Auto-Recovery** | Checkpoint system with pruning | Automatic state restoration |
| **🎯 MCP Integration** | External tool support (GitHub, Search, Browser) | Extended capabilities |
| **👥 Multi-Agent Mode** | Parallel specialist coordination | 3x faster for complex tasks |
| **🛡️ Error Recovery** | Retry logic & circuit breakers | Robust error handling |
| **✅ Workflow Validation** | YAML linting & cross-reference checks | System integrity |

---

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/agents-hub.git
cd agents-hub

# Verify system integrity
node core/workflow-validator.js

# Start using with your AI assistant
# AGENTS.md will be automatically loaded
```

**Requirements:**
- Node.js 16+ (for core services)
- Git (for MCP GitHub integration)

---

## 🎯 Quick Start

### 1. Start a New Session

```
User: "I want to build a REST API with authentication"

System:
✓ Detects: Software-Development Workflow
✓ Starts: Discovery Phase  
✓ Loads: API Development + Security Templates
✓ Asks: "What should the API do?"
```

### 2. Work Through Phases

```
Discovery → Planning → Execution → Review → Delivery
   ↓           ↓          ↓         ↓         ↓
Analyze    Design    Implement   Test    Deploy
```

### 3. Session Management (Automatic)

```
✓ Auto-saves every 5 minutes
✓ Creates checkpoints at phase boundaries
✓ Prunes context when > 8000 tokens
✓ Offers recovery after crashes
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              AGENTS HUB ORCHESTRATOR                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   State     │  │ Smart Loader │  │ Error Recovery│  │
│  │  Manager    │  │              │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Cache     │  │   Validator  │  │  Multi-Agent  │  │
│  │   Layer     │  │              │  │  Supervisor   │  │
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
| [USER_GUIDE.md](./USER_GUIDE.md) | **Start here!** Complete user manual |
| [AGENTS.md](./AGENTS.md) | Technical reference for AI assistants |
| [QUICKSTART.md](./QUICKSTART.md) | 5-minute getting started guide |
| [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) | Architecture deep dive |
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | Implementation details |
| [OPTIMIZATION_ANALYSIS.md](./OPTIMIZATION_ANALYSIS.md) | Performance analysis |

---

## 🎮 Usage Modes

### Standard Mode (Single Agent)

Best for: Sequential tasks, normal projects

```
1. Describe your project
2. System detects workflow type
3. Work through 5 phases together
4. Load specialists as needed
```

### Multi-Agent Mode (Parallel)

Best for: Complex projects with independent parts

```
User: "Build full-stack app with auth - use multi-agent"

System:
├─ Frontend Agent  → UI Components (parallel)
├─ Backend Agent   → API + Auth   (parallel)
└─ Security Agent  → Audit         (parallel)

Result: Merged in 1/3 of the time
```

---

## 🛠️ Core Services

### State Persistence (`core/state-persistence.js`)

```javascript
const { StateManager } = require('./core/state-persistence');
const manager = new StateManager();

// Initialize session
const sessionId = manager.initSession("Build REST API", "software-dev");

// Update phase
manager.updatePhase("discovery", { status: "completed" });

// Create checkpoint
manager.createCheckpoint("before_refactoring");

// Get pruned context
const context = manager.getPrunedContext();
```

### Smart Loader (`core/smart-loader.js`)

```javascript
const { SmartLoader } = require('./core/smart-loader');
const loader = new SmartLoader();

// Load optimal context
const result = loader.loadOptimalContext("Build REST API with auth");
console.log(`Loaded ${result.metadata.templates_loaded} templates`);
console.log(`Estimated tokens: ${result.metadata.estimated_tokens}`);
```

### Workflow Validator (`core/workflow-validator.js`)

```bash
# Validate entire system
node core/workflow-validator.js

# Check specific component
node core/workflow-validator.js --workflows
node core/workflow-validator.js --templates
```

---

## 📊 Performance

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Token Usage** | 15k | 8k | **-45%** |
| **Template Size** | 30KB | 8KB | **-73%** |
| **Load Time** | 500ms | 50ms | **-90%** |
| **Recovery** | Manual | Automatic | **∞** |
| **Redundancy** | 30% | <5% | **-83%** |

---

## 🧪 Testing

```bash
# Run all tests
cd core
node state-persistence.test.js      # 17 tests
node template-loader.test.js        # 12 tests
node smart-loader.test.js           # 17 tests
node workflow-validator.test.js     # 14 tests

# Total: 60/60 passing ✅
```

---

## 🔧 Configuration

### MCP Servers (`mcp-config.yaml`)

```yaml
servers:
  filesystem:
    enabled: true
    # File operations
    
  github:
    enabled: true
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_TOKEN}
    
  brave-search:
    enabled: true
    env:
      BRAVE_API_KEY: ${BRAVE_API_KEY}
```

### Environment Variables

```bash
# Create .env file
GITHUB_TOKEN=your_token_here
BRAVE_API_KEY=your_key_here
DATABASE_URL=postgres://...
```

---

## 🗺️ Roadmap

### v2.1 (Q2 2026)
- [ ] Template Inheritance System
- [ ] Analytics Dashboard
- [ ] Learning Engine

### v2.5 (Q3 2026)
- [ ] Natural Language Phase Detection
- [ ] Auto-Template Recommendations
- [ ] Voice Interface

### v3.0 (Q4 2026)
- [ ] Cloud Sync
- [ ] Team Collaboration
- [ ] Plugin System

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/yourusername/agents-hub.git
cd agents-hub

# Install dependencies
npm install

# Run tests
npm test

# Validate changes
node core/workflow-validator.js
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

[Get Started →](./QUICKSTART.md)
