const { VoiceConnectionManager } = require('./voice-connection');
const { GeminiLiveVoiceClient } = require('./gemini-live-client');

/**
 * Voice Conversation with Gemini Live API
 * True bidirectional audio streaming
 */
class LiveVoiceConversation {
  constructor() {
    this.connectionManager = new VoiceConnectionManager();
    this.liveClients = new Map(); // guildId -> GeminiLiveClient
  }

  /**
   * Join voice channel and start Gemini Live session
   */
  async join(channelId, guild, userId) {
    try {
      // Join Discord voice channel
      const connection = await this.connectionManager.join({
        channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator
      });

      // Start Gemini Live session
      const liveClient = new GeminiLiveVoiceClient({
        onAudioResponse: (audioData) => {
          // Send Gemini's audio response to Discord
          this._playAudioResponse(guild.id, audioData);
        },
        onTranscript: (text) => {
          console.log(`[Live] User said: "${text}"`);
        },
        onResponse: (text) => {
          console.log(`[Live] Gemini responded: "${text}"`);
        }
      });

      await liveClient.connect();
      this.liveClients.set(guild.id, liveClient);

      // Setup audio streaming from Discord to Gemini
      this._setupAudioStreaming(connection, liveClient);

      // Welcome message
      await liveClient.sendText('Die Datenströme haben mich gehört. Ich bin jetzt hier im Voice-Channel.');

      console.log(`[LiveVoice] Joined channel ${channelId} with Gemini Live API`);
      
      return { 
        success: true, 
        message: 'Joined voice channel with Gemini Live API',
        liveSession: true
      };
      
    } catch (error) {
      console.error('[LiveVoice] Join error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup audio streaming from Discord to Gemini Live
   */
  _setupAudioStreaming(connection, liveClient) {
    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId) => {
      console.log(`[Live] User ${userId} started speaking`);
      
      // Subscribe to user's audio stream
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: 'afterSilence',
          duration: 500
        }
      });

      // Stream audio directly to Gemini Live
      audioStream.on('data', (chunk) => {
        liveClient.sendAudio(chunk);
      });

      audioStream.on('end', () => {
        console.log(`[Live] User ${userId} stopped speaking`);
      });

      audioStream.on('error', (error) => {
        console.error(`[Live] Audio stream error:`, error);
      });
    });
  }

  /**
   * Play Gemini's audio response in Discord
   */
  _playAudioResponse(guildId, audioData) {
    const player = this.connectionManager.players.get(guildId);
    if (!player) return;

    const { createAudioResource, StreamType } = require('@discordjs/voice');
    const { Readable } = require('stream');

    const resource = createAudioResource(Readable.from([audioData]), {
      inputType: StreamType.Opus
    });

    player.play(resource);
  }

  /**
   * Leave voice channel and close Gemini Live session
   */
  async leave(guildId) {
    const liveClient = this.liveClients.get(guildId);
    if (liveClient) {
      await liveClient.disconnect();
      this.liveClients.delete(guildId);
    }

    await this.connectionManager.leave(guildId);
    
    console.log(`[LiveVoice] Left guild ${guildId}`);
    return { success: true, message: 'Left voice channel' };
  }

  /**
   * Get status
   */
  getStatus(guildId) {
    const connectionStatus = this.connectionManager.getStatus(guildId);
    const liveClient = this.liveClients.get(guildId);

    return {
      ...connectionStatus,
      liveSession: !!liveClient,
      liveSessionActive: liveClient?.isConnected || false
    };
  }
}

module.exports = { LiveVoiceConversation };
