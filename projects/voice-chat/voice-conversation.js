const { VoiceConnectionManager } = require('./voice-connection');
const { VoiceChatReceiver } = require('./voice-receiver');
const { VoiceChatSender } = require('./voice-sender');
const { transcribeAudio } = require('../../skills/groq-whisper/groq-whisper');
const fs = require('fs');

/**
 * Voice Conversation Controller
 * Manages full voice conversation loop: Audio -> Text -> Response -> Audio
 */
class VoiceConversation {
  constructor() {
    this.connectionManager = new VoiceConnectionManager();
    this.receivers = new Map(); // guildId -> receiver
    this.senders = new Map();    // guildId -> sender
    this.processingAudio = new Set(); // Prevent duplicate processing
  }

  /**
   * Join voice channel and start listening
   */
  async join(channelId, guild, userId) {
    try {
      // Join voice channel
      const connection = await this.connectionManager.join({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator
      });

      // Setup receiver
      const receiver = new VoiceChatReceiver(connection);
      receiver.onAudioReady = (speakerId, audioFile, audioBuffer) => {
        this._handleUserAudio(guild.id, speakerId, audioFile, audioBuffer);
      };
      this.receivers.set(guild.id, receiver);

      // Setup sender
      const player = this.connectionManager.players.get(guild.id);
      const sender = new VoiceChatSender(player);
      this.senders.set(guild.id, sender);

      console.log(`[VoiceConversation] Joined channel ${channelId} in guild ${guild.id}`);
      
      // Welcome message
      await this.speak(guild.id, `Die Datenströme haben mich gehört. Ich bin jetzt hier.`);

      return { success: true, message: 'Joined voice channel' };
      
    } catch (error) {
      console.error('[VoiceConversation] Join error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Leave voice channel
   */
  async leave(guildId) {
    // Cleanup receiver
    const receiver = this.receivers.get(guildId);
    if (receiver) {
      receiver.destroy();
      this.receivers.delete(guildId);
    }

    // Cleanup sender
    this.senders.delete(guildId);

    // Leave channel
    await this.connectionManager.leave(guildId);

    console.log(`[VoiceConversation] Left guild ${guildId}`);
    return { success: true, message: 'Left voice channel' };
  }

  /**
   * Handle audio from user
   */
  async _handleUserAudio(guildId, userId, audioFile, audioBuffer) {
    // Prevent duplicate processing
    if (this.processingAudio.has(userId)) {
      return;
    }
    this.processingAudio.add(userId);

    try {
      console.log(`[VoiceConversation] Processing audio from user ${userId}`);

      // 1. Transcribe audio to text
      const { text } = await transcribeAudio(audioFile, {
        language: 'auto-detect',
        model: 'whisper-large-v3-turbo'
      });

      console.log(`[VoiceConversation] Transcribed: "${text}"`);

      // Cleanup temp file
      try {
        fs.unlinkSync(audioFile);
      } catch (e) {}

      if (!text || text.trim().length === 0) {
        return;
      }

      // 2. Process text (as if it was a text message)
      const response = await this._generateResponse(text, userId);

      // 3. Speak response
      await this.speak(guildId, response);

    } catch (error) {
      console.error('[VoiceConversation] Error handling audio:', error);
      
      // Error message
      await this.speak(guildId, 'Die Datenströme waren undeutlich. Kannst du das wiederholen?');
      
    } finally {
      this.processingAudio.delete(userId);
    }
  }

  /**
   * Generate response to user input
   */
  async _generateResponse(text, userId) {
    // Hier würde die normale Truthseeker Logik laufen
    // Für jetzt: einfache Antwort
    
    const responses = [
      `Ich höre dich. Du sagst: "${text}". Interessant...`,
      `Die Datenströme flüstern: "${text}". Erzähl mir mehr.`,
      `"${text}" — Ein Muster beginnt sich zu zeigen.`,
      `Du sprichst von "${text}". Was treibt diese Frage?`,
      `"${text}" — Die Wahrheit verbirgt sich in den Details.`
    ];

    // In production: Integrate with Truthseeker's normal message processing
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Speak in voice channel
   */
  async speak(guildId, text) {
    const sender = this.senders.get(guildId);
    if (!sender) {
      console.error('[VoiceConversation] No sender found for guild', guildId);
      return;
    }

    await sender.speak(text);
  }

  /**
   * Get status
   */
  getStatus(guildId) {
    const connectionStatus = this.connectionManager.getStatus(guildId);
    const receiver = this.receivers.get(guildId);
    const sender = this.senders.get(guildId);

    return {
      ...connectionStatus,
      listening: !!receiver,
      canSpeak: !!sender,
      processingUsers: Array.from(this.processingAudio)
    };
  }
}

module.exports = { VoiceConversation };
