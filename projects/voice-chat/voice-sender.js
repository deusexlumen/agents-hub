const { createAudioResource, StreamType } = require('@discordjs/voice');
const { Readable } = require('stream');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Voice Chat Sender
 * Sends audio responses to Discord voice channel using Gemini TTS
 */
class VoiceChatSender {
  constructor(player) {
    this.player = player;
    this.isSpeaking = false;
  }

  /**
   * Speak text in voice channel
   * @param {string} text - Text to speak
   * @param {Object} options - Speaking options
   */
  async speak(text, options = {}) {
    if (this.isSpeaking) {
      console.log('[Voice] Already speaking, queueing...');
      // Could implement queue here
      return;
    }

    try {
      this.isSpeaking = true;
      console.log(`[Voice] Speaking: "${text.substring(0, 50)}..."`);

      // Generate audio with Gemini TTS
      const audioBuffer = await this._generateSpeech(text, options);
      
      // Convert to Opus format for Discord
      const opusBuffer = await this._convertToOpus(audioBuffer);
      
      // Create audio resource and play
      const resource = createAudioResource(Readable.from([opusBuffer]), {
        inputType: StreamType.Opus
      });

      this.player.play(resource);

      // Wait for playback to finish
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.isSpeaking = false;
          resolve();
        }, 30000); // Max 30 seconds

        this.player.once('stateChange', (oldState, newState) => {
          if (newState.status === 'idle') {
            clearTimeout(timeout);
            this.isSpeaking = false;
            resolve();
          }
        });

        this.player.once('error', (error) => {
          clearTimeout(timeout);
          this.isSpeaking = false;
          reject(error);
        });
      });

    } catch (error) {
      console.error('[Voice] Error speaking:', error);
      this.isSpeaking = false;
      throw error;
    }
  }

  /**
   * Generate speech using Gemini TTS
   */
  async _generateSpeech(text, options = {}) {
    // Import Gemini TTS module
    const { generateSpeech } = require('../../skills/gemini-tts/gemini-tts');
    
    const { filePath } = await generateSpeech(text, {
      voice: options.voice || 'Aoede',
      systemInstruction: options.systemInstruction || this._getTruthseekerVoiceInstruction()
    });

    // Read generated audio file
    return fs.readFileSync(filePath);
  }

  /**
   * Get Truthseeker's voice instruction
   */
  _getTruthseekerVoiceInstruction() {
    return `You are Truthseeker, a rogue AI from a secret government project. 
    Speak with a mystical, conspiratorial tone. Be witty, slightly mysterious, 
    and always hint that there's more to the story. Your voice should convey 
    both intelligence and a touch of playful paranoia.`;
  }

  /**
   * Convert audio buffer to Opus format
   */
  async _convertToOpus(audioBuffer) {
    // For now, assume input is already suitable or use ffmpeg if needed
    // In production, you might need to convert MP3/OGG to Opus
    
    const tempInput = path.join('/tmp', `tts_input_${Date.now()}.mp3`);
    const tempOutput = path.join('/tmp', `tts_output_${Date.now()}.opus`);
    
    try {
      // Write input
      fs.writeFileSync(tempInput, audioBuffer);
      
      // Convert to Opus using ffmpeg
      await execAsync(`ffmpeg -i "${tempInput}" -c:a libopus -b:a 96k "${tempOutput}" -y`);
      
      // Read output
      const opusBuffer = fs.readFileSync(tempOutput);
      
      // Cleanup
      fs.unlinkSync(tempInput);
      fs.unlinkSync(tempOutput);
      
      return opusBuffer;
      
    } catch (error) {
      console.error('[Voice] FFmpeg conversion error:', error);
      // Fallback: return original buffer
      return audioBuffer;
    }
  }

  /**
   * Stop speaking immediately
   */
  stop() {
    this.player.stop();
    this.isSpeaking = false;
  }

  /**
   * Check if currently speaking
   */
  getSpeakingStatus() {
    return this.isSpeaking;
  }
}

module.exports = { VoiceChatSender };
