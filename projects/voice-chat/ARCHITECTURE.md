# Voice Chat Integration with Gemini Live API

## Ziel
Truthseeker kann einem Discord Voice-Channel beitreten und an echten Gesprächen teilnehmen — **mithilfe der Gemini Live API für bidirektionales Audio-Streaming**.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCORD VOICE CHANNEL                     │
│  ┌──────────────┐                    ┌──────────────┐      │
│  │   Speaker    │                    │   Listener   │      │
│  │  (You/Other) │                    │  (You/Other) │      │
│  └──────┬───────┘                    └──────▲───────┘      │
└─────────┼───────────────────────────────────┼──────────────┘
          │                                     │
          ▼                                     │
┌──────────────────────┐                        │
│  DISCORD VOICE API   │                        │
│  @discordjs/voice    │                        │
└──────────┬───────────┘                        │
           │                                    │
    ┌──────▼──────┐                    ┌────────┴───────┐
    │ PCM Audio   │                    │  Opus Audio    │
    │ (Input)     │                    │  (Output)      │
    └──────┬──────┘                    └────────▲───────┘
           │                                     │
           ▼                                     │
┌─────────────────────────────────────────────────────────────┐
│              GEMINI LIVE API CLIENT                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebSocket Connection                                │   │
│  │  wss://generativelanguage.googleapis.com/ws/...      │   │
│  │                                                      │   │
│  │  Input:  PCM Audio Stream  ───────┐                  │   │
│  │                                   ▼                  │   │
│  │  Gemini 2.0 Flash (Live)  ──────▶ Audio Response     │   │
│  │                                                      │   │
│  │  Config:                                             │   │
│  │  - responseModalities: ["AUDIO"]                     │   │
│  │  - voice: "Aoede" (Truthseeker)                      │   │
│  │  - realtime streaming                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Komponenten

### 1. VoiceConnectionManager
Standard Discord Voice Connection mit `@discordjs/voice`.

### 2. GeminiLiveVoiceClient
**NEU:** Bidirektionaler WebSocket-Client für Gemini Live API.

```typescript
// Features:
- Real-time audio streaming (Input & Output)
- PCM audio from Discord → Gemini
- Opus audio from Gemini → Discord
- Voice: Aoede (Truthseeker's Stimme)
- System Instruction: Truthseeker Personality
```

### 3. LiveVoiceConversation
Orchestriert Discord Voice + Gemini Live API.

**Flow:**
```
User spricht in Discord Voice
        ↓
Discord Voice Receiver (PCM)
        ↓
GeminiLiveVoiceClient.sendAudio()
        ↓
Gemini 2.0 Flash Live Processing
        ↓
GeminiLiveVoiceClient.onAudioResponse
        ↓
Discord Voice Sender (Opus)
        ↓
User hört Truthseeker's Antwort (in Echtzeit!)
```

## Commands

```
!joinvoice [channel-id]  # Voice-Channel beitreten + Gemini Live starten
!leavevoice              # Voice-Channel verlassen + Gemini Live beenden
!voicestatus             # Status anzeigen
```

## Technische Details

### Gemini Live API Config
```json
{
  "model": "gemini-2.5-flash-native-audio-preview-12-2025",
  "responseModalities": ["AUDIO"],
  "speechConfig": {
    "voiceConfig": {
      "prebuiltVoiceConfig": {
        "voiceName": "Aoede"
      }
    }
  },
  "systemInstruction": "Truthseeker personality..."
}
```

### Audio Formate
- **Input (Discord → Gemini):** PCM, 48kHz, stereo
- **Output (Gemini → Discord):** Opus (für Discord optimiert)

### Latenz
- Discord Voice: ~20-50ms
- Gemini Live: ~200-500ms (je nach Netzwerk)
- **Gesamt:** ~300-600ms (echtzeit-fähig)

## Vorteile gegenüber alter Architektur

| Alt (TTS) | Neu (Gemini Live) |
|-----------|-------------------|
| Audio → Whisper → Text → TTS | Audio direkt → Gemini → Audio |
| ~2-3s Verzögerung | ~300-600ms Latenz |
| Getrennte Transcription + TTS | Echtes bidirektionales Streaming |
| Statische Antworten | Kontinuierlicher Dialog |

## Files

```
voice-chat/
├── gemini-live-client.js      # NEU: Gemini Live WebSocket Client
├── live-voice-conversation.js # NEU: Discord + Gemini Integration
├── voice-connection.js        # Discord Voice Connection
├── voice-commands.js          # Commands: !joinvoice, !leavevoice
└── index.js                   # Exporte
```

## Usage

```javascript
const { setupVoiceChat } = require('./voice-chat');

// In deinem Bot-Code
setupVoiceChat(client);

// Fertig! Jetzt kannst du:
// !joinvoice → Truthseeker tritt bei und antwortet in Echtzeit
```

---

*Gemini Live API — Echtes Gespräch, nicht nur TTS* 🎙️
