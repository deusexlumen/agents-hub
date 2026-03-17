# State Manager Core Service

**Zustandsverwaltung mit Persistenz und Recovery.**

---

## Überblick

Der State Manager persistiert Session-Zustände zwischen Interaktionen und ermöglicht Recovery nach Abstürzen oder Unterbrechungen.

---

## Architektur

```
session_state/
├── active/                    # Aktive Sessions
│   └── session_{id}.json      # Aktueller Zustand
├── archived/                  # Abgeschlossene Sessions
│   └── YYYY-MM/               # Monatliche Archivierung
├── recovery/                  # Recovery-Checkpoints
│   └── checkpoint_{id}.json   # Wichtige Zwischenstände
└── index.json                 # Session-Index
```

---

## State-Struktur

```json
{
  "metadata": {
    "session_id": "uuid",
    "created_at": "2026-03-17T12:00:00Z",
    "updated_at": "2026-03-17T12:30:00Z",
    "version": "1.0",
    "autosave_interval": 300
  },
  "context": {
    "workflow_type": "software-dev",
    "current_phase": "execution",
    "completed_phases": ["discovery", "planning"],
    "user_intent": "Build REST API",
    "session_duration_minutes": 30
  },
  "phases": {
    "discovery": {
      "status": "completed",
      "summary": "3-Satz Zusammenfassung",
      "key_findings": ["finding1", "finding2"],
      "artifacts": ["path/to/file.md"],
      "completed_at": "2026-03-17T12:10:00Z"
    },
    "planning": {
      "status": "completed",
      "summary": "Architecture defined...",
      "artifacts": ["architecture.md"],
      "completed_at": "2026-03-17T12:25:00Z"
    },
    "execution": {
      "status": "active",
      "current_task": "Implement auth",
      "progress_percent": 45
    }
  },
  "memory": {
    "key_decisions": [],
    "user_preferences": {},
    "technical_constraints": [],
    "learned_patterns": []
  },
  "templates": {
    "loaded": ["api-development", "security"],
    "relevant_sections": ["auth", "rest"]
  }
}
```

---

## Operationen

### 1. State Initialisieren
```markdown
ON session_start:
1. Check for recovery files
2. IF recovery exists → Prompt user
3. ELSE create new state
4. Start autosave timer
```

### 2. State Aktualisieren
```markdown
ON phase_complete:
1. Summarize phase to 3 sentences
2. Update state.phases[phase]
3. Update context.current_phase
4. Save to disk
```

### 3. State Recovery
```markdown
ON system_start:
1. Scan recovery/ directory
2. IF files found:
   - List available sessions
   - Show last activity time
   - Prompt: "Resume session X?"
3. IF yes → Restore full context
4. IF no → Archive and start fresh
```

### 4. Autosave
```markdown
EVERY 5 minutes OR on critical events:
1. Serialize current state
2. Write to active/session_{id}.json
3. Create checkpoint if significant progress
```

---

## Recovery-Checkpoints

Checkpoints werden bei wichtigen Meilensteinen erstellt:

- Phase completion
- Critical decision made
- Major artifact created
- User explicitly requests save
- Before risky operations

---

## Pruning-Strategie

```markdown
WHEN context_size > MAX_TOKENS * 0.8:
1. Identify oldest completed phases
2. Summarize to 3 sentences each
3. Keep only summaries + artifacts
4. Archive full details to disk
5. Update state with references
```

---

## Datei-Format

### Primary: JSON
- Schnelles Parsen
- Tool-freundlich
- Klare Struktur

### Secondary: YAML
- Menschenlesbar für Debug
- Hand-editierbar
- Git-freundlich

---

## Integrationspunkte

### Mit Orchestrator
```markdown
Orchestrator calls:
- state_manager.init_session()
- state_manager.update_phase()
- state_manager.get_current_context()
```

### Mit Context Manager
```markdown
Context Manager uses:
- state_manager.load_pruned_context()
- state_manager.get_phase_summary()
```

### Mit Templates
```markdown
Templates receive:
- Current phase only
- Summaries of completed phases
- Never: full historical context
```

---

## Fehlerbehandlung

### Korrupte State-Dateien
```markdown
IF parse_error:
1. Backup corrupted file
2. Try previous checkpoint
3. IF all fail → Start fresh with warning
```

### Speicher-Fehler
```markdown
IF write_error:
1. Retry with exponential backoff
2. IF persistent → Log error, continue in-memory
3. Alert user at session end
```

---

## Implementierung

### Schnittstelle (Pseudocode)

```typescript
interface StateManager {
  // Lifecycle
  initSession(intent: string): SessionState;
  loadSession(sessionId: string): SessionState;
  closeSession(sessionId: string): void;
  
  // Updates
  updatePhase(phase: string, data: PhaseData): void;
  updateContext(updates: Partial<Context>): void;
  addCheckpoint(reason: string): void;
  
  // Queries
  getCurrentContext(): PrunedContext;
  getPhaseSummary(phase: string): string;
  getRecoveryOptions(): RecoveryOption[];
  
  // Maintenance
  pruneOldSessions(maxAge: number): void;
  archiveSession(sessionId: string): void;
}
```

---

## Nutzung in AGENTS.md

```markdown
## State Management

You have access to State Manager:

### On Start
1. Check for recovery: "Scanning for previous sessions..."
2. IF found → Present options
3. ELSE → Start fresh

### During Session
- Context is automatically pruned
- Checkpoints created at phase boundaries
- Autosave every 5 minutes

### On Phase Complete
1. Create phase summary (3 sentences)
2. Persist to state
3. Update context for next phase
```

---

## Migration von File-basiert

### Altes System
```
tasks/
└── project-name/
    ├── phase-discovery.md
    ├── phase-planning.md
    └── ...
```

### Neues System
```
session_state/
├── active/
│   └── session_abc123.json    # All-in-one state
└── artifacts/
    └── project-name/
        ├── discovery-summary.md
        └── planning-summary.md
```

---

## Nächste Schritte

1. ✅ Implement state structure
2. ⏳ Add persistence layer
3. ⏳ Create recovery UI
4. ⏳ Integrate with orchestrator
5. ⏳ Add pruning logic
6. ⏳ Test edge cases

---

*Version: 1.0*  
*Depends on: None*  
*Used by: Orchestrator, Context Manager*
