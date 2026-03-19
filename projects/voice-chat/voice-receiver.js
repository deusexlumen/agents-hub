const { EndBehaviorType } = require('@discordjs/voice');
const { OpusEncoder } = require('@discordjs/opus');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const pipelineAsync = promisify(pipeline);

/**
 * Voice Chat Receiver
 * Receives and processes audio from Discord voice channel users
 */
class VoiceChatReceiver {
  constructor(connection, options = {}) {
    this.connection = connection;
    this.receiver = connection.receiver;
    this.encoder = new OpusEncoder(48000, 2); // 48kHz, stereo
    
    this.options = {
      bufferDuration: options.bufferDuration || 3000, // 3 seconds
      silenceThreshold: options.silenceThreshold || 100, // ms
      ...options
    };
    
    this.userBuffers = new Map(); // userId -> audio chunks
    this.processingUsers = new Set();
    
    this._setupReceiver();
  }

  /**
   * Setup the voice receiver to listen for user speech
   */
  _setupReceiver() {
    this.receiver.speaking.on('start', (userId) => {
      console.log(`[Voice] User ${userId} started speaking`);
      this._handleUserStartSpeaking(userId);
    });

    this.receiver.speaking.on('end', (userId) => {
      console.log(`[Voice] User ${userId} stopped speaking`);
      this._handleUserStopSpeaking(userId);
    });
  }

  /**
   * Handle user starts speaking
   */
  _handleUserStartSpeaking(userId) {
    if (this.processingUsers.has(userId)) {
      return; // Already processing this user
    }

    this.processingUsers.add(userId);
    this.userBuffers.set(userId, []);

    // Subscribe to audio stream for this user
    const audioStream = this.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: this.options.silenceThreshold
      }
    });

    const chunks = [];
    
    audioStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    audioStream.on('end', async () => {
      console.log(`[Voice] Audio stream ended for user ${userId}`);
      await this._processAudio(userId, chunks);
      this.processingUsers.delete(userId);
      this.userBuffers.delete(userId);
    });

    audioStream.on('error', (error) => {
      console.error(`[Voice] Audio stream error for user ${userId}:`, error);
      this.processingUsers.delete(userId);
      this.userBuffers.delete(userId);
    });
  }

  /**
   * Handle user stops speaking
   */
  _handleUserStopSpeaking(userId) {
    // Stream will end automatically due to AfterSilence behavior
    console.log(`[Voice] Waiting for silence to process user ${userId}`);
  }

  /**
   * Process collected audio
   */
  async _processAudio(userId, chunks) {
    try {
      if (chunks.length === 0) {
        return;
      }

      // Combine chunks
      const audioBuffer = Buffer.concat(chunks);
      
      console.log(`[Voice] Processing ${audioBuffer.length} bytes from user ${userId}`);

      // Decode Opus to PCM
      const pcmBuffer = this._decodeOpus(audioBuffer);
      
      // Convert to WAV format for transcription
      const wavBuffer = this._createWavBuffer(pcmBuffer);
      
      // Save temporarily (for debugging)
      const tempFile = path.join('/tmp', `voice_${userId}_${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);
      
      // Emit event for transcription
      this.onAudioReady?.(userId, tempFile, wavBuffer);
      
    } catch (error) {
      console.error(`[Voice] Error processing audio for user ${userId}:`, error);
    }
  }

  /**
   * Decode Opus audio to PCM
   */
  _decodeOpus(opusBuffer) {
    // Opus frames sind 960 samples (20ms) bei 48kHz
    const frames = [];
    let offset = 0;
    
    while (offset < opusBuffer.length) {
      // Opus frame header: 2 bytes length
      const frameLength = opusBuffer.readUInt16BE(offset);
      offset += 2;
      
      if (offset + frameLength > opusBuffer.length) break;
      
      const frame = opusBuffer.slice(offset, offset + frameLength);
      offset += frameLength;
      
      try {
        const decoded = this.encoder.decode(frame);
        frames.push(decoded);
      } catch (e) {
        // Skip invalid frames
      }
    }
    
    return Buffer.concat(frames);
  }

  /**
   * Create WAV buffer from PCM data
   */
  _createWavBuffer(pcmBuffer) {
    const sampleRate = 48000;
    const channels = 2;
    const bitsPerSample = 16;
    
    const wavHeader = Buffer.alloc(44);
    
    // RIFF chunk
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
    wavHeader.write('WAVE', 8);
    
    // fmt chunk
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
    wavHeader.writeUInt16LE(1, 20); // AudioFormat (PCM)
    wavHeader.writeUInt16LE(channels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); // ByteRate
    wavHeader.writeUInt16LE(channels * bitsPerSample / 8, 32); // BlockAlign
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(pcmBuffer.length, 40);
    
    return Buffer.concat([wavHeader, pcmBuffer]);
  }

  /**
   * Destroy receiver
   */
  destroy() {
    this.receiver = null;
    this.userBuffers.clear();
    this.processingUsers.clear();
  }
}

module.exports = { VoiceChatReceiver };
