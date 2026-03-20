# Agents Hub v3.1 - Refactoring Dokumentation

## Übersicht

Das Repository wurde von einer passiven Sammlung von Node.js-Skripten zu einem **aktiven Master-Prozess** mit **Universal LLM Support** refactored.

## Neue Architektur

```
agents-hub/
├── bin/
│   └── agents-hub.js              # Master Process Entrypoint
├── core/
│   ├── context-compiler.js        # Kontext-Kompilierung
│   ├── execution-engine.js        # LLM-Ausführung (Universal)
│   ├── universal-llm-provider.js  # NEU: Multi-Provider Support
│   ├── state-persistence.js       # State-Management
│   └── ...
├── AGENTS-AUTONOMOUS.md           # Basis-Philosophie
├── learning_data/
│   └── history.json               # Gedächtnis-Storage
└── package.json                   # v3.1.0
```

## Komponenten

### 1. bin/agents-hub.js (Entrypoint)

**Features:**
- Kontinuierliche REPL über `readline`
- Endlosschleife - terminiert nicht nach einer Aufgabe
- Session-Recovery bei Start
- Integrierte Commands
- Emergency Checkpoints bei Crashes

**Usage:**
```bash
# Mit CLI Tool
LLM_PROVIDER=cli LLM_COMMAND=gemini-code npm start

# Mit OpenAI
LLM_PROVIDER=openai LLM_MODEL=gpt-4 npm start

# Mit Ollama
LLM_PROVIDER=ollama LLM_MODEL=llama2 npm start
```

### 2. core/context-compiler.js

Compiliert den Master-Prompt aus:
1. **Base Philosophy** (`AGENTS-AUTONOMOUS.md`)
2. **Learning Data** (`learning_data/history.json`)
3. **Current State** (Session State)

### 3. core/universal-llm-provider.js (NEU in v3.1)

**Provider-Klassen:**
- `CLIProvider` - CLI-basierte LLMs (gemini-code, aider, claude-code)
- `APIProvider` - API-basierte LLMs (OpenAI, Anthropic, Gemini)
- `OllamaProvider` - Lokale LLMs via Ollama
- `LLMProviderFactory` - Automatische Provider-Erkennung

**Auto-Detection:**
```javascript
// Prüft Umgebungsvariablen
OLLAMA_HOST / OLLAMA_MODEL → Ollama
OPENAI_API_KEY → OpenAI
ANTHROPIC_API_KEY → Anthropic
GEMINI_API_KEY → Gemini
Default → CLI
```

### 4. core/execution-engine.js

Nutzt den Universal LLM Provider:
```javascript
const engine = new ExecutionEngine({
  provider: 'openai',      // 'cli', 'openai', 'anthropic', 'ollama', 'auto'
  command: 'gemini-code',  // Für CLI-Modus
  model: 'gpt-4',          // Für API-Modus
  apiKey: 'sk-...'         // Für API-Modus
});
```

### 5. core/state-persistence.js

- Parst `<UPDATE_MEMORY>` und `<UPDATE_STATE>` Tags
- Atomare Writes (temp + rename)
- Session-Recovery
- Checkpoint-System

## Unterstützte LLMs

| Provider | Typ | Beispiele |
|----------|-----|-----------|
| **CLI** | Prozess | gemini-code, aider, claude-code, codex |
| **OpenAI** | API | gpt-4, gpt-3.5-turbo |
| **Anthropic** | API | claude-3-opus, claude-3-sonnet |
| **Gemini** | API | gemini-pro |
| **Ollama** | Local | llama2, mistral, codellama |

## Flow

```
User Input
    ↓
[Master Process] REPL empfängt Input
    ↓
[Context Compiler] Lädt Philosophy + History + State
    ↓
[Context Compiler] Erstellt Master-Prompt
    ↓
[Execution Engine] Wählt Provider (CLI/API/Local)
    ↓
[Universal Provider] Führt LLM aus
    ↓
[State Persistence] Parst Tags aus Output
    ↓
[State Persistence] Persistiert Updates (atomic)
    ↓
User sieht bereinigte Antwort
    ↓
REPL wartet auf nächsten Input
```

## Commands

| Command | Beschreibung |
|---------|--------------|
| `help`, `?` | Hilfe anzeigen |
| `status` | Aktuellen Session-Status |
| `sessions` | Alle Sessions listen |
| `resume <id>` | Session fortsetzen |
| `checkpoint [msg]` | Checkpoint erstellen |
| `clear` | Bildschirm leeren |
| `config` | Konfiguration anzeigen |
| `providers` | Verfügbare LLM-Provider listen |
| `exit`, `quit`, `q` | Beenden |

## State-Verzeichnis

```
session_state/
├── active/          # Aktive Sessions
├── archived/        # Archivierte Sessions  
└── recovery/        # Checkpoints
```

## LLM Konfiguration

### CLI Tools
```bash
LLM_PROVIDER=cli LLM_COMMAND=aider npm start
```

### OpenAI
```bash
export OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai LLM_MODEL=gpt-4 npm start
```

### Anthropic
```bash
export ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic LLM_MODEL=claude-3-opus npm start
```

### Ollama
```bash
ollama run llama2
LLM_PROVIDER=ollama LLM_MODEL=llama2 npm start
```

### Provider Check
```bash
npm start
agents-hub> providers
```

## Nächste Schritte

1. LLM-Provider konfigurieren (siehe oben)
2. `AGENTS-AUTONOMOUS.md` anpassen für spezifisches Verhalten
3. `learning_data/history.json` mit bestehenden Daten befüllen

## Migration bestehender Sessions

Alte Sessions aus v2.x werden automatisch erkannt:
```
agents-hub> resume <partial-session-id>
```

## Version

**v3.1.0** - Universal LLM Support
- Multi-Provider Architektur
- CLI, API, und Local LLM Unterstützung
- Automatische Provider-Erkennung
