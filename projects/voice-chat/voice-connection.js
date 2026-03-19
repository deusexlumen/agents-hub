const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource,
  VoiceConnectionStatus,
  AudioPlayerStatus
} = require('@discordjs/voice');
const { Readable } = require('stream');

/**
 * Voice Connection Manager
 * Handles Discord Voice Channel connections
 */
class VoiceConnectionManager {
  constructor() {
    this.connections = new Map(); // guildId -> connection
    this.players = new Map();     // guildId -> audioPlayer
  }

  /**
   * Join a voice channel
   * @param {Object} options - Join options
   * @param {string} options.channelId - Voice channel ID
   * @param {string} options.guildId - Guild ID  
   * @param {Function} options.adapterCreator - Guild voice adapter creator
   * @returns {Promise<Object>} Voice connection
   */
  async join({ channelId, guildId, adapterCreator }) {
    // Check if already connected
    if (this.connections.has(guildId)) {
      const existing = this.connections.get(guildId);
      if (existing.joinConfig.channelId === channelId) {
        console.log(`[Voice] Already connected to ${channelId}`);
        return existing;
      }
      // Disconnect from previous channel
      await this.leave(guildId);
    }

    console.log(`[Voice] Joining channel ${channelId} in guild ${guildId}`);

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    // Create audio player for this connection
    const player = createAudioPlayer();
    connection.subscribe(player);

    // Store references
    this.connections.set(guildId, connection);
    this.players.set(guildId, player);

    // Setup event handlers
    this._setupConnectionEvents(connection, guildId);
    this._setupPlayerEvents(player, guildId);

    // Wait for ready
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Voice connection timeout'));
      }, 30000);

      connection.on(VoiceConnectionStatus.Ready, () => {
        clearTimeout(timeout);
        console.log(`[Voice] Connection ready for guild ${guildId}`);
        resolve(connection);
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        clearTimeout(timeout);
        reject(new Error('Voice connection disconnected'));
      });
    });
  }

  /**
   * Leave a voice channel
   * @param {string} guildId - Guild ID
   */
  async leave(guildId) {
    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    if (player) {
      player.stop();
      this.players.delete(guildId);
    }

    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
    }

    console.log(`[Voice] Left channel in guild ${guildId}`);
  }

  /**
   * Play audio in voice channel
   * @param {string} guildId - Guild ID
   * @param {Buffer} audioBuffer - Audio data
   */
  play(guildId, audioBuffer) {
    const player = this.players.get(guildId);
    if (!player) {
      throw new Error('Not connected to voice channel');
    }

    const resource = createAudioResource(Readable.from([audioBuffer]));
    player.play(resource);
  }

  /**
   * Get connection status
   * @param {string} guildId - Guild ID
   * @returns {Object} Status info
   */
  getStatus(guildId) {
    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    return {
      connected: !!connection,
      connectionState: connection?.state?.status || 'disconnected',
      playerState: player?.state?.status || 'idle',
      channelId: connection?.joinConfig?.channelId || null
    };
  }

  _setupConnectionEvents(connection, guildId) {
    connection.on(VoiceConnectionStatus.Ready, () => {
      console.log(`[Voice] Ready in guild ${guildId}`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`[Voice] Disconnected from guild ${guildId}`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (error) {
        this.leave(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`[Voice] Destroyed in guild ${guildId}`);
      this.connections.delete(guildId);
    });
  }

  _setupPlayerEvents(player, guildId) {
    player.on(AudioPlayerStatus.Playing, () => {
      console.log(`[Voice] Playing audio in guild ${guildId}`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[Voice] Finished playing in guild ${guildId}`);
    });

    player.on('error', (error) => {
      console.error(`[Voice] Player error in guild ${guildId}:`, error);
    });
  }
}

module.exports = { VoiceConnectionManager };
