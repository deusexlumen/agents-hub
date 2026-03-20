# 🤖 Agents Hub v3.1

**Autonomous LLM Orchestration System with Persistent State, Context Injection, and Universal LLM Support**

[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## 🚀 What's New in v3.1

| Feature | Description | Impact |
|---------|-------------|--------|
| **🔌 Universal LLM** | Works with any LLM: CLI, API, or local | Use your preferred LLM |
| **🔄 Master Process** | Continuous REPL loop that never terminates | True autonomous operation |
| **🧠 Context Compiler** | Forces Philosophy + History + State injection | LLM never forgets context |
| **⚡ Execution Engine** | Universal provider abstraction | Physical encapsulation |
| **🏷️ Structured Tags** | `<UPDATE_MEMORY>` / `<UPDATE_STATE>` parsing | Automatic persistence |

---

## 🚀 What is Agents Hub?

Agents Hub is an **active orchestration system** that controls LLM execution through a persistent Master Process. Unlike passive CLI tools, it:

1. **Runs continuously** in a REPL loop
2. **Injects context** before every LLM call (Philosophy + History + State)
3. **Encapsulates the LLM** as a subprocess
4. **Parses structured output** for automatic state updates
5. **Persists state atomically** with checkpoint recovery

### Key Features

| Feature | Description | Benefit |
|---------|-------------|---------|
| **🔒 Master Process** | Continuous REPL, never terminates | True autonomy |
| **📥 Context Injection** | Forces Philosophy + History loading | No context loss |
| **⚙️ LLM Encapsulation** | Spawns LLM as subprocess | Controlled execution |
| **🏷️ Structured Tags** | Parses `<UPDATE_*>` tags | Auto state updates |
| **💾 Atomic Persistence** | Temp + rename pattern | No corruption |
| **🎯 Checkpoint System** | Named recovery points | Safe experimentation |
| **🔄 Session Recovery** | Resume any previous session | Never lose progress |
| **📊 State Management** | Full session lifecycle | Complete visibility |

---

## 📦 Installation

### Via Git

```bash
# Clone the repository
git clone https://github.com/deusexlumen/agents-hub.git
cd agents-hub

# Install dependencies
npm install
```

### Verify Installation

```bash
# Check version
npm start -- --version

# Show help
npm start -- --help
```

**Requirements:**
- Node.js 16+
- Any LLM: CLI tool, API access, or local server

**Supported LLM Providers:**
- **CLI-based**: `gemini-code`, `aider`, `claude-code`, `codex`, any CLI tool
- **API-based**: OpenAI, Anthropic (Claude), Google (Gemini)
- **Local**: Ollama, llama.cpp

---

## 🔌 LLM Provider Configuration

Agents Hub works with **any** LLM. Configure via environment variables:

### CLI Tools
```bash
# Default (gemini-code)
npm start

# Aider
LLM_PROVIDER=cli LLM_COMMAND=aider npm start

# Claude Code
LLM_PROVIDER=cli LLM_COMMAND=claude-code npm start

# Custom CLI tool
LLM_PROVIDER=cli LLM_COMMAND="my-llm" LLM_ARGS="--flag" npm start
```

### API Providers
```bash
# OpenAI
export OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai LLM_MODEL=gpt-4 npm start

# Anthropic Claude
export ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic LLM_MODEL=claude-3-opus npm start

# Google Gemini
export GEMINI_API_KEY=...
LLM_PROVIDER=gemini npm start
```

### Local LLMs (Ollama)
```bash
# Start Ollama first
ollama run llama2

# Then
LLM_PROVIDER=ollama LLM_MODEL=llama2 npm start
```

### Check Available Providers
```bash
npm start
agents-hub> providers
```

---

## 🎯 Quick Start

### 1. Start the Master Process

```bash
npm start
```

### 2. Type any task

```
🤖 AGENTS HUB MASTER PROCESS v3.0

agents-hub> Build a REST API with authentication
[Compiling context...]
[Executing LLM...]
────────────────────────────────────────
I'll create a REST API with authentication...

<UPDATE_MEMORY>
{"key_decisions": ["Express.js framework", "JWT authentication"]}
</UPDATE_MEMORY>

<UPDATE_STATE>
{"current_phase": "execution"}
</UPDATE_STATE>

Here's the implementation...
────────────────────────────────────────

agents-hub>
```

### 3. Check status anytime

```
agents-hub> status

📊 Session Status:
  Session ID: abc-123...
  Phase: execution
  Duration: 15 minutes
  Messages: 3
```

### 4. Create checkpoints

```
agents-hub> checkpoint before-database-refactor
✓ Checkpoint created: checkpoint_abc-123_...
```

### 5. Resume later

```bash
npm start
```
```
⚠️ Recoverable sessions found:
   1. Build REST API (execution) - 15min

Type "resume <id>" to continue, or press Enter for new session.

agents-hub> resume abc
✓ Resumed session: abc-123...
```

---

## 🖥️ REPL Commands

| Command | Description |
|---------|-------------|
| `help`, `?` | Show available commands |
| `status` | Display current session status |
| `sessions` | List all active sessions |
| `resume <id>` | Resume a specific session |
| `checkpoint [msg]` | Create a named checkpoint |
| `clear` | Clear the screen |
| `config` | Show current configuration |
| `providers` | List available LLM providers |
| `exit`, `quit`, `q` | Exit the master process |

**Any other input is treated as a task for the LLM.**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MASTER PROCESS (REPL)                    │
│                   bin/agents-hub.js                         │
│                                                             │
│  • Continuous loop (never terminates)                       │
│  • Command parsing                                          │
│  • Session management                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Context     │  │   Execution   │  │     State     │
│   Compiler    │  │    Engine     │  │  Persistence  │
│               │  │               │  │               │
│ • Philosophy  │  │ • Universal   │  │ • Parse Tags  │
│ • History     │  │   Provider    │  │ • Persist     │
│ • State       │  │ • Stream I/O  │  │ • Recover     │
└───────────────┘  └───────┬───────┘  └───────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐      ┌──────────┐      ┌──────────┐
   │  CLI    │      │   API    │      │  Local   │
   │ gemini- │      │ OpenAI/  │      │  Ollama  │
   │  code   │      │ Anthropic│      │          │
   └─────────┘      └──────────┘      └──────────┘
```

### Flow

```
User Input
    ↓
[Master Process] RELoop empfängt Input
    ↓
[Context Compiler] Lädt AGENTS-AUTONOMOUS.md
                   Lädt learning_data/history.json
                   Kombiniert mit aktuellem State
    ↓
[Context Compiler] Erstellt Master-Prompt
    ↓
[Execution Engine] Spawnt LLM als Subprozess
                   Streamt Output → Terminal
    ↓
[State Persistence] Parst <UPDATE_*> Tags
                    Persistiert Updates (atomic)
    ↓
User sieht bereinigte Antwort
    ↓
REPL wartet auf nächsten Input (Endlosschleife)
```

---

## 📚 Core Components

### Context Compiler (`core/context-compiler.js`)

Compiles the Master-Prompt from all context sources:

1. **Base Philosophy** (`AGENTS-AUTONOMOUS.md`)
   - Core principles for the LLM
   - Phase definitions
   - Output rules

2. **Learning Data** (`learning_data/history.json`)
   - Past interactions
   - Learned patterns
   - User preferences

3. **Current State** (Session State)
   - Current phase
   - Previous decisions
   - Metrics

### Execution Engine (`core/execution-engine.js`)

Controls the LLM execution through a universal provider system:

- **Universal Provider** (`core/universal-llm-provider.js`)
  - CLI-based tools (gemini-code, aider, claude-code)
  - API providers (OpenAI, Anthropic, Gemini)
  - Local LLMs (Ollama)
- Streams stdout/stderr in real-time
- Handles timeouts (5 min default)
- Graceful abort

**Environment Variables:**
```bash
# CLI Mode
export LLM_PROVIDER=cli
export LLM_COMMAND=gemini-code
export LLM_ARGS="--timeout 300"

# API Mode
export LLM_PROVIDER=openai
export LLM_MODEL=gpt-4
export OPENAI_API_KEY=sk-...

# Ollama Mode
export LLM_PROVIDER=ollama
export LLM_MODEL=llama2
```

**Check available providers:**
```bash
npm start
agents-hub> providers
```

### State Persistence (`core/state-persistence.js`)

Manages session state with structured tag parsing:

**Input Tags (from LLM):**
```xml
<UPDATE_MEMORY>
{
  "key_decisions": ["Use Express.js", "JWT auth"],
  "user_preferences": {"theme": "dark"},
  "learned_patterns": [{"name": "pattern1", "description": "..."}]
}
</UPDATE_MEMORY>

<UPDATE_STATE>
{
  "current_phase": "execution",
  "phase_data": {
    "execution": {
      "status": "active",
      "data": {"current_task": "Setup project"}
    }
  }
}
</UPDATE_STATE>
```

**Features:**
- Atomic writes (temp + rename)
- Automatic checkpoint creation
- Session recovery
- Autosave every 5 minutes

---

## 📁 Project Structure

```
agents-hub/
├── bin/
│   └── agents-hub.js          # Master Process Entrypoint
├── core/
│   ├── context-compiler.js    # Context compilation
│   ├── execution-engine.js    # LLM subprocess control
│   ├── state-persistence.js   # State management
│   ├── orchestrator.js        # High-level orchestration
│   └── ...
├── AGENTS-AUTONOMOUS.md       # Base philosophy for LLM
├── learning_data/
│   └── history.json           # Memory storage
├── session_state/             # State storage
│   ├── active/                # Active sessions
│   ├── archived/              # Archived sessions
│   └── recovery/              # Checkpoints
├── workflows/                 # Workflow definitions
├── phases/                    # Phase instructions
├── templates/                 # Agent templates
├── package.json
└── README.md
```

---

## 💻 Programmatic API

While the Master Process is the primary interface, you can also use components programmatically:

```javascript
const { ContextCompiler } = require('./core/context-compiler');
const { ExecutionEngine } = require('./core/execution-engine');
const { StatePersistence } = require('./core/state-persistence');

// Initialize components
const compiler = new ContextCompiler();
const engine = new ExecutionEngine({
  llmCommand: 'gemini-code'
});
const state = new StatePersistence();

// Start session
const sessionId = state.initSession('Build REST API');

// Compile context
const masterPrompt = await compiler.compile({
  sessionId,
  userInput: 'Add authentication',
  currentState: state.getCurrentState()
});

// Execute LLM
const output = await engine.execute(masterPrompt, {
  onData: (chunk) => process.stdout.write(chunk)
});

// Parse and persist updates
const updates = parseStructuredOutput(output);
state.updateMemory(updates.memory);
state.applyStateUpdates(updates.state);
```

---

## 🎯 Usage Examples

### Example 1: Standard Session

```bash
$ npm start

🤖 AGENTS HUB MASTER PROCESS v3.0

agents-hub> Build a todo app
[New session: abc-123...]
[Compiling context...]
[Executing LLM...]
────────────────────────────────────────
I'll help you build a todo app. Let me start by understanding
the requirements...

<UPDATE_STATE>
{"current_phase": "discovery"}
</UPDATE_STATE>

What specific features do you need?
────────────────────────────────────────

agents-hub> Basic CRUD, local storage, responsive UI
[Compiling context...]
[Executing LLM...]
────────────────────────────────────────
Perfect. I'll create a responsive todo app with CRUD operations
and local storage...

<UPDATE_MEMORY>
{
  "key_decisions": [
    "Vanilla JavaScript (no framework)",
    "LocalStorage for persistence",
    "Mobile-first responsive design"
  ]
}
</UPDATE_MEMORY>

<UPDATE_STATE>
{"current_phase": "execution"}
</UPDATE_STATE>

Here's the implementation...
────────────────────────────────────────

agents-hub>
```

### Example 2: Session Recovery

```bash
$ npm start

⚠️  Recoverable sessions found:
   1. Build REST API (execution) - 45min

Type "resume <id>" to continue, or press Enter for new session.

agents-hub> resume abc
✓ Resumed session: abc-123-def-456
  Current phase: execution
  Duration so far: 45 minutes

agents-hub> status
📊 Session Status:
  Session ID: abc-123-def-456
  Phase: execution
  Duration: 45 minutes
  Messages: 12

agents-hub>
```

### Example 3: Checkpoints

```
agents-hub> checkpoint before-database-change
✓ Checkpoint created: checkpoint_abc-123_...
  Reason: before-database-change

agents-hub> Switch to PostgreSQL
[Compiling context...]
...

# If something goes wrong, restore checkpoint
agents-hub> resume checkpoint_abc-123_...
```

---

## 📊 State Structure

```json
{
  "metadata": {
    "session_id": "uuid",
    "created_at": "2026-03-20T...",
    "updated_at": "2026-03-20T...",
    "checkpoint_count": 5
  },
  "context": {
    "workflow_type": "software-dev",
    "current_phase": "execution",
    "completed_phases": ["discovery", "planning"],
    "user_intent": "Build REST API",
    "session_duration_minutes": 45
  },
  "phases": {
    "discovery": {
      "status": "completed",
      "data": {"requirements": [...]},
      "completed_at": "2026-03-20T..."
    },
    "planning": {
      "status": "completed",
      "data": {"architecture": {...}},
      "completed_at": "2026-03-20T..."
    },
    "execution": {
      "status": "active",
      "data": {"current_task": "Implement auth"},
      "started_at": "2026-03-20T..."
    },
    "review": {"status": "pending", "data": {}},
    "delivery": {"status": "pending", "data": {}}
  },
  "memory": {
    "key_decisions": [...],
    "user_preferences": {"theme": "dark"},
    "technical_constraints": ["Node.js 18+"],
    "learned_patterns": [...]
  },
  "metrics": {
    "total_tokens_used": 15000,
    "total_messages": 12,
    "phases_completed": 2,
    "checkpoints_created": 5
  }
}
```

---

## 🔧 Configuration

### LLM Provider Selection

```bash
# Auto-detect (default)
LLM_PROVIDER=auto

# CLI Tools
LLM_PROVIDER=cli
LLM_COMMAND=gemini-code        # or: aider, claude-code, codex
LLM_ARGS="--flag1 --flag2"

# OpenAI
LLM_PROVIDER=openai
LLM_MODEL=gpt-4                # or: gpt-3.5-turbo, gpt-4-turbo
OPENAI_API_KEY=sk-...

# Anthropic Claude
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-opus-20240229
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=...

# Ollama (Local)
LLM_PROVIDER=ollama
LLM_MODEL=llama2               # or: mistral, codellama, etc.
OLLAMA_HOST=http://localhost:11434
```

### State Configuration

```bash
STATE_DIR=./session_state              # State storage directory
AUTOSAVE_INTERVAL=300000               # Autosave interval (ms)
```

### Context Configuration

```bash
PHILOSOPHY_PATH=./AGENTS-AUTONOMOUS.md # Base philosophy
HISTORY_PATH=./learning_data/history.json # Learning data
```

### Customizing AGENTS-AUTONOMOUS.md

Edit `AGENTS-AUTONOMOUS.md` to customize the LLM's behavior:

- Change core principles
- Modify phase definitions
- Adjust output rules
- Add custom instructions

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [REFACTORING_v3.0.md](./REFACTORING_v3.0.md) | **v3.0 architecture overview** |
| [AGENTS-AUTONOMOUS.md](./AGENTS-AUTONOMOUS.md) | LLM instructions & philosophy |
| [AGENTS.md](./AGENTS.md) | Legacy technical reference |
| [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) | Architecture deep dive |

---

## 🗺️ Roadmap

### v3.1 (Q2 2026)
- [ ] Natural Language Phase Detection
- [ ] Advanced Auto-Recommendations
- [ ] Plugin System

### v3.5 (Q3 2026)
- [ ] Multi-LLM Support
- [ ] Cloud Sync
- [ ] Team Collaboration

### v4.0 (Q4 2026)
- [ ] Distributed Multi-Agent
- [ ] AI-Powered Planning
- [ ] Advanced Analytics

---

## 🤝 Contributing

Contributions are welcome!

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

- Built for autonomous LLM orchestration
- Inspired by persistent state management patterns
- Created with ❤️ for the AI community

---

## 📞 Support

- 📖 [Documentation](./REFACTORING_v3.0.md)
- 🐛 [Issue Tracker](../../issues)
- 💬 [Discussions](../../discussions)

---

**Ready for truly autonomous AI workflows?** 🚀

```bash
git clone https://github.com/deusexlumen/agents-hub.git
cd agents-hub
npm install
npm start
```

[Get Started →](./REFACTORING_v3.0.md)
