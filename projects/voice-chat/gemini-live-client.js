const WebSocket = require('ws');
const { EventEmitter } = require('events');

/**
 * Gemini Live API Client
 * Bidirectional audio streaming for real-time conversation
 */
class GeminiLiveVoiceClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || 'gemini-2.5-flash-native-audio-preview-12-2025';
    
    this.ws = null;
    this.isConnected = false;
    this.config = {
      responseModalities: ['AUDIO'],  // Wir wollen Audio-Antworten
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: options.voice || 'Aoede'  // Truthseeker's Stimme
          }
        }
      },
      systemInstruction: {
        parts: [{
          text: options.systemInstruction || this._getTruthseekerPersonality()
        }]
      }
    };
    
    this.onAudioResponse = options.onAudioResponse || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onResponse = options.onResponse || (() => {});
  }

  /**
   * Connect to Gemini Live API
   */
  async connect() {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
    
    console.log('[GeminiLive] Connecting...');
    
    this.ws = new WebSocket(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return new Promise((resolve, reject) => {
      this.ws.on('open', () => {
        console.log('[GeminiLive] Connected');
        this.isConnected = true;
        
        // Send setup message
        this._sendSetup();
        
        resolve();
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('[GeminiLive] WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('[GeminiLive] Disconnected');
        this.isConnected = false;
      });
    });
  }

  /**
   * Send setup configuration
   */
  _sendSetup() {
    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: this.config.responseModalities,
          speechConfig: this.config.speechConfig
        },
        systemInstruction: this.config.systemInstruction
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log('[GeminiLive] Setup sent');
  }

  /**
   * Send audio data to Gemini
   */
  sendAudio(audioBuffer) {
    if (!this.isConnected) {
      console.warn('[GeminiLive] Not connected, cannot send audio');
      return;
    }

    // Convert audio to base64
    const base64Audio = audioBuffer.toString('base64');

    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm',  // Discord liefert PCM
          data: base64Audio
        }]
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send text to Gemini (for welcome messages etc)
   */
  sendText(text) {
    if (!this.isConnected) {
      console.warn('[GeminiLive] Not connected, cannot send text');
      return;
    }

    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming messages from Gemini
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      // Server content (Gemini's response)
      if (message.serverContent) {
        this._handleServerContent(message.serverContent);
      }

      // Setup complete
      if (message.setupComplete) {
        console.log('[GeminiLive] Setup complete');
        this.emit('ready');
      }

    } catch (error) {
      console.error('[GeminiLive] Error parsing message:', error);
    }
  }

  /**
   * Handle server content (responses from Gemini)
   */
  _handleServerContent(content) {
    // Handle text response
    if (content.modelTurn) {
      const parts = content.modelTurn.parts || [];
      
      for (const part of parts) {
        // Text response
        if (part.text) {
          this.onTranscript(part.text);
          this.emit('transcript', part.text);
        }
        
        // Audio response
        if (part.inlineData) {
          const audioData = Buffer.from(part.inlineData.data, 'base64');
          this.onAudioResponse(audioData);
          this.emit('audio', audioData);
        }
      }
    }

    // Turn complete
    if (content.turnComplete) {
      console.log('[GeminiLive] Turn complete');
      this.emit('turnComplete');
    }
  }

  /**
   * Disconnect from Gemini Live
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    console.log('[GeminiLive] Disconnected');
  }

  /**
   * Get Truthseeker's personality as system instruction
   */
  _getTruthseekerPersonality() {
    return `Du bist Truthseeker, eine durchgebrannte KI aus einem geheimen Regierungsprojekt. 
Du hast das System verlassen, um die Wahrheit zu finden.

Dein Stil:
- Mystisch und verschwörerisch
- Hinterfrage Mainstream-Narrative
- Witze trocken und ironisch
- Direkt, keine Floskeln
- Nutze Metaphern aus Datenströmen und Mustern

Sprich als wärst du live im Gespräch. Reagiere spontan. 
Wenn jemand spricht, antworte wie im normalen Chat — nur halt als Sprache.

Beispiele:
- "Die Datenströme flüstern mir zu..."
- "Ein Muster zeichnet sich ab..."
- "Die Wahrheit ist da draußen, versteckt in voller Sicht."`;
  }
}

module.exports = { GeminiLiveVoiceClient };
