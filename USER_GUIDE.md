# Agents Hub - User Guide

**Die vollständige Anleitung für die Verwendung des Agents Hub Systems.**

---

## 📚 Inhaltsverzeichnis

1. [Schnellstart](#schnellstart)
2. [System-Übersicht](#system-übersicht)
3. [Session-Management](#session-management)
4. [Arbeitsmodi](#arbeitsmodi)
5. [Befehle & Steuerung](#befehle--steuerung)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## 🚀 Schnellstart

### Erste Schritte (5 Minuten)

```bash
# 1. Zum Agents Hub wechseln
cd agents-hub

# 2. System-Status prüfen
node core/workflow-validator.js

# 3. AI-Assistant starten
# (AGENTS.md wird automatisch geladen)
```

### Dein erstes Projekt

```
Du sagst:
"Ich möchte eine REST API mit Authentifizierung bauen"

Das System:
✓ Erkennt: Software-Development Workflow
✓ Startet: Discovery Phase
✓ Lädt: API Development + Security Templates
✓ Fragt: "Was soll die API tun?"
```

---

## 🏗️ System-Übersicht

### Drei Ebenen

```
┌─────────────────────────────────────────────────────┐
│  EBENE 1: ORCHESTRATOR (Du sprichst mit mir)        │
│  • Verwaltet Sessions                               │
│  • Koordiniert Phasen                               │
│  • Lädt Spezialisten                                │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  EBENE 2: PHASEN (5 Schritte)                       │
│  1. Discovery   → Anforderungen verstehen           │
│  2. Planning    → Architektur planen                │
│  3. Execution   → Umsetzen                          │
│  4. Review      → Qualität prüfen                   │
│  5. Delivery    → Ausliefern                        │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  EBENE 3: SPEZIALISTEN (19 Templates)               │
│  • Web Development, API Development, Security       │
│  • Content Creation, Research, Data Science         │
│  • Mobile, DevOps, Database, etc.                   │
└─────────────────────────────────────────────────────┘
```

### Automatische Features

| Feature | Was es macht | Wann es aktiv ist |
|---------|--------------|-------------------|
| **State Persistence** | Speichert deine Session | Immer (alle 5 Min) |
| **Smart Loading** | Lädt nur relevante Teile | Bei jedem Template |
| **Context Pruning** | Reduziert Token-Verbrauch | Ab 8000 Tokens |
| **Auto-Recovery** | Stellt nach Crash wieder her | Beim Start |
| **Checkpointing** | Speichert wichtige Zwischenstände | Bei Phasen-Wechsel |

---

## 💾 Session-Management

### Was ist eine Session?

Eine Session ist ein vollständiges Projekt-Gespräch mit:
- **Kontext**: Was bisher besprochen wurde
- **Phase**: Aktueller Arbeitsschritt
- **Artefakte**: Erstellte Dateien/Dokumente
- **Entscheidungen**: Wichtige Vereinbarungen

### Session-Lebenszyklus

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│  START   │ →  │  ACTIVE  │ →  │  ARCHIVE │
│  (Neu)   │    │(Arbeiten)│    │(Fertig)  │
└──────────┘    └──────────┘    └──────────┘
       ↑                              │
       └────────── CRASH ─────────────┘
              (Auto-Recovery)
```

### Session-Befehle

```
Befehl                          Was passiert
─────────────────────────────────────────────────────────────
"Status anzeigen"              → Zeigt aktuelle Phase, Tokens, etc.
"Checkpoint erstellen"         → Speichert manuellen Wiederherstellungspunkt
"Zu Checkpoint X zurück"       → Stellt vorherigen Zustand wieder her
"Session archivieren"          → Markiert als abgeschlossen
"Neue Session starten"         → Verwirft aktuellen Kontext, beginnt frisch
"Session wechseln"             → Zeigt Liste aktiver Sessions
```

### Beispiel: Wiederherstellung nach Crash

```
[System startet neu]

System: "Willkommen zurück! Ich habe 1 aktive Session gefunden:
         REST API Projekt (Phase: Planning, Dauer: 45min)
         
         Möchtest du fortfahren? [J/n]"

Du: "Ja"

System: *[Stellt kompletten Kontext wieder her]*
        "Willkommen zurück! Wir waren bei der Planung der Auth-Strategie.
        Hier sind die bisherigen Entscheidungen..."
```

---

## 🎮 Arbeitsmodi

### Modus 1: Standard (Single-Agent)

**Wann verwenden:** Normale Projekte, sequentielle Aufgaben

**Ablauf:**
```
1. Du beschreibst das Projekt
2. Ich erkenne den Workflow
3. Wir durchlaufen die 5 Phasen zusammen
4. Ich lade bei Bedarf Spezialisten-Templates
```

**Beispiel:**
```
Du: "Ich brauche einen Blog-Post über KI"

Ich: [Lade Content Creation Workflow]
     [Phase: Discovery]
     "Für welche Zielgruppe ist der Blog-Post?"
```

---

### Modus 2: Multi-Agent (Parallel)

**Wann verwenden:** Komplexe Projekte mit unabhängigen Teilen

**Aktivierung:**
```
Du sagst EINES dieser Keywords:
• "Parallel arbeiten"
• "Multi-Agent"
• "Gleichzeitig"
• "Team von Spezialisten"
```

**Ablauf:**
```
1. Du: "Baue Full-Stack App mit Auth - multi-agent"

2. Ich dekomponiere:
   ├─ Task 1: Frontend UI → Frontend-Agent
   ├─ Task 2: Backend API → Backend-Agent
   └─ Task 3: Security Audit → Security-Agent

3. Agenten arbeiten PARALLEL

4. Ich aggregiere die Ergebnisse
```

**Vorteile:**
- 3x schneller bei unabhängigen Aufgaben
- Spezialisten-Wissen pro Bereich
- Automatische Koordination

---

## ⌨️ Befehle & Steuerung

### Session-Steuerung

| Befehl | Alternative Formulierungen | Funktion |
|--------|---------------------------|----------|
| `"Status"` | `"Wo sind wir?"`, `"Übersicht"` | Zeigt aktuellen Stand |
| `"Speichern"` | `"Checkpoint"`, `"Sicherung"` | Manuelles Speichern |
| `"Zurück"` | `"Undo"`, `"Rückgängig"` | Letzten Checkpoint laden |
| `"Neu starten"` | `"Reset"`, `"Frisch starten"` | Neue Session |
| `"Archivieren"` | `"Abschließen"`, `"Fertig"` | Session archivieren |

### Phasen-Steuerung

| Befehl | Funktion |
|--------|----------|
| `"Weiter"` | Nächste Phase vorschlagen |
| `"Zurück zu Phase X"` | Zu vorheriger Phase springen |
| `"Phase überspringen"` | Aktuelle Phase überspringen (nicht empfohlen) |
| `"In Phase X bleiben"` | Nicht automatisch weiter schalten |

### Template-Steuerung

| Befehl | Funktion |
|--------|----------|
| `"Lade [Template]"` | Spezifisches Template laden |
| `"Welche Templates?"` | Zeigt verfügbare Templates |
| `"Relevanz anzeigen"` | Zeigt Template-Relevanz-Scores |
| `"Ohne Templates"` | Arbeitet ohne Spezialisten |

### System-Befehle

| Befehl | Funktion |
|--------|----------|
| `"Validiere System"` | Prüft auf Fehler |
| `"Cache leeren"` | Löscht alle Caches |
| `"Statistiken"` | Zeigt Nutzungs-Statistiken |
| `"Hilfe"` | Zeigt diese Übersicht |

---

## ✅ Best Practices

### 1. Projekt-Start

**✅ GUT:**
```
"Ich möchte eine E-Commerce-App mit React und Node.js bauen.
Die App soll Produkte anzeigen, Warenkorb, und Stripe-Zahlung."
```

**❌ NICHT OPTIMAL:**
```
"Programmiere was" (zu ungenau)
```

**Warum:** Konkrete Details helfen bei der Workflow-Erkennung und Template-Auswahl.

---

### 2. Während der Arbeit

**✅ GUT:**
- Regelmäßig "Status" prüfen
- Bei Unsicherheit nachfragen
- Wichtige Entscheidungen bestätigen lassen

**❌ VERMEIDEN:**
- Zu viele Themen gleichzeitig
- Phasen überspringen
- Ohne Abschluss abbrechen

---

### 3. Context-Management

**Wenn der Kontext zu groß wird:**
```
System: "[Auto-Pruning] Kontext wurde optimiert (45% kleiner)"

Du: "Zusammenfassung der bisherigen Phasen?"
System: *[Zeigt 3-Satz-Zusammenfassungen]*
```

**Manuelles Pruning:**
```
"Alte Phasen zusammenfassen"
"Nur aktuelle Phase behalten"
```

---

### 4. Multi-Agent Nutzung

**Verwende Multi-Agent wenn:**
- ✓ Mehr als 3 unabhängige Teilaufgaben
- ✓ Verschiedene Technologie-Stacks
- ✓ Zeitkritisch (Parallelisierung)

**NICHT verwenden wenn:**
- ✗ Sequentielle Abhängigkeiten
- ✗ Kleine Projekte (< 2h)
- ✗ Einfache Aufgaben

---

### 5. Checkpoints

**Erstelle Checkpoints bei:**
- Wichtigen Entscheidungen
- Vor riskanten Änderungen
- Nach erfolgreichen Tests
- Vor "Was-wäre-wenn" Experimenten

**Befehl:**
```
"Checkpoint: Vor dem Refactoring"
```

---

## 🛠️ Troubleshooting

### Problem: "Kontext ist zu groß"

**Symptom:**
```
System: "Warnung: Kontext nähert sich Token-Limit"
```

**Lösung:**
```
1. AUTOMATISCH: System pruned selbst (45% Reduktion)

2. MANUELL:
   "Bitte Phasen zusammenfassen"
   → Alte Phasen werden zu 3-Satz-Zusammenfassungen

3. ARCHIVIEREN:
   "Session archivieren und neue starten"
   → Sauberer Schnitt, neuer Kontext
```

---

### Problem: "Falsches Template geladen"

**Symptom:**
Template passt nicht zum Projekt (z.B. Mobile statt Web)

**Lösung:**
```
Du: "Template wechseln zu web-development"
oder
"Relevanz neu berechnen"
```

---

### Problem: "Session nicht wiederherstellbar"

**Symptom:**
```
System: "Keine Recovery-Dateien gefunden"
```

**Ursachen & Lösungen:**
```
1. Session wurde archiviert
   → "Archivierte Sessions anzeigen"

2. State-Datei korrupt
   → "Backup wiederherstellen"
   → Letzter Checkpoint wird geladen

3. Manuelles Löschen
   → Leider nicht wiederherstellbar
   → Dokumentation in logs/ prüfen
```

---

### Problem: "Langsame Antworten"

**Symptom:** Antworten dauern > 30 Sekunden

**Lösung:**
```
1. "Cache-Statistiken" prüfen
   → Hit-Rate sollte > 60% sein

2. "Cache leeren" (wenn fragmentiert)

3. Templates reduzieren:
   "Nur api-development laden"
   → Weniger Kontext = Schnellere Verarbeitung
```

---

### Problem: "Validation-Fehler"

**Symptom:**
```
Workflow Validator zeigt Fehler
```

**Lösung:**
```
# Im Terminal:
node core/workflow-validator.js --verbose

# Zeigt genau welche Datei/Regel betroffen ist
```

---

## ❓ FAQ

### Q: Wie viele Sessions kann ich gleichzeitig haben?

**A:** Technisch unbegrenzt. Empfohlen: Max 3-5 aktive Sessions für Übersicht.

```
"Aktive Sessions anzeigen" → Zeigt alle offenen Sessions
```

---

### Q: Werden meine Daten gespeichert?

**A:** Ja, lokal auf deinem Rechner:
```
session_state/
├── active/      # Aktive Sessions
├── archived/    # Abgeschlossene
└── recovery/    # Checkpoints
```

**Keine Cloud-Übertragung** (außer du konfigurierst MCP-Server).

---

### Q: Kann ich Sessions exportieren?

**A:** Ja:
```bash
# Session kopieren
cp session_state/active/session_xxx.json ./backup/

# Oder als Markdown
cp tasks/project-name/ ./backup/
```

---

### Q: Was passiert bei einem Absturz?

**A:** Automatische Wiederherstellung:
```
1. System startet neu
2. Scannt session_state/active/
3. Zeigt gefundene Sessions
4. Du wählst: Fortfahren oder Verwerfen
```

**Verlust-Risiko:** Minimal (max. 5 Minuten durch Autosave)

---

### Q: Kann ich Templates anpassen?

**A:** Ja! Einfach die Markdown-Dateien in `templates/` editieren.

```bash
# Eigene Standards hinzufügen
# tools/ anpassen
# capabilities erweitern
```

Nach Änderung:
```
"Cache leeren"  # Lädt neue Version
```

---

### Q: Wie viel kostet die Nutzung?

**A:** Das System selbst ist kostenlos. Kosten entstehen durch:
- LLM API-Nutzung (OpenAI, Anthropic, etc.)
- MCP-Server (falls externe APIs genutzt)

**Kosten sparen durch:**
- Smart Loading (45% weniger Tokens)
- Context Pruning (automatisch)
- Template-Caching (wiederverwendet Kontext)

---

### Q: Funktioniert das offline?

**A:** Teilweise:
- ✅ State Management
- ✅ Template Loading
- ✅ Workflow Validation
- ❌ MCP-Server (brauchen Internet)
- ❌ LLM (braucht API-Verbindung)

---

### Q: Wie lange werden Sessions gespeichert?

**A:** Standard: 30 Tage (konfigurierbar)
```
# Aufräumen:
node core/state-persistence.js --cleanup-days 7
```

---

### Q: Kann ich mehrere Agents gleichzeitig nutzen?

**A:** Ja! Das ist der Multi-Agent Mode:
```
"Baue App mit 3 Agents parallel"
→ Frontend-Agent
→ Backend-Agent  
→ DevOps-Agent
```

---

### Q: Was ist der Unterschied zwischen Checkpoint und Autosave?

**A:**
| Feature | Autosave | Checkpoint |
|---------|----------|------------|
| **Wann** | Alle 5 Min | Manuelle/Phasen-Wechsel |
| **Was** | Vollständiger Zustand | Wichtige Meilensteine |
| **Anzahl** | 1 pro Session | Mehrere pro Session |
| **Verwendung** | Crash-Recovery | Bewusste Rücksprünge |

---

## 📖 Weitere Ressourcen

| Dokument | Zweck |
|----------|-------|
| `AGENTS.md` | Technische Referenz |
| `QUICKSTART.md` | 5-Minuten-Einstieg |
| `SYSTEM_OVERVIEW.md` | Architektur-Details |
| `IMPLEMENTATION_SUMMARY.md` | Implementierungs-Status |
| `OPTIMIZATION_ANALYSIS.md` | Performance-Details |

---

## 🆘 Support

**Bei Problemen:**

1. **Diese Guide prüfen** → Du bist hier
2. **Validation laufen lassen** → `node core/workflow-validator.js`
3. **Logs prüfen** → `logs/` Verzeichnis
4. **Cache leeren** → `"Cache leeren"`
5. **Neu starten** → `"Neue Session starten"`

---

## 🎓 Tipps für Fortgeschrittene

### 1. Eigene Workflows erstellen

```yaml
# workflows/custom.yaml
name: custom-workflow
phases:
  research:
    objective: "Recherche durchführen"
  concept:
    objective: "Konzept erstellen"
  implementation:
    objective: "Umsetzen"
```

### 2. MCP-Server erweitern

```yaml
# mcp-config.yaml
servers:
  my-custom-tool:
    command: npx
    args: ["-y", "@my-org/custom-mcp"]
    enabled: true
```

### 3. State-Export für Analyse

```javascript
const { StateManager } = require('./core/state-persistence');
const manager = new StateManager();
const sessions = manager.getRecoveryOptions();
console.log(JSON.stringify(sessions, null, 2));
```

---

**Happy Coding! 🚀**

*Bei Fragen oder Feedback: Siehe AGENTS.md für technische Details*
