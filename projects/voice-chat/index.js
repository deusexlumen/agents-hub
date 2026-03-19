/**
 * Voice Chat Integration for Truthseeker
 * Using Gemini Live API for bidirectional audio streaming
 * 
 * Usage:
 * const { setupVoiceChat } = require('./voice-chat');
 * setupVoiceChat(client);
 */

const { VoiceCommands } = require('./voice-commands');

function setupVoiceChat(client) {
  const voiceCommands = new VoiceCommands(client);
  voiceCommands.setup();
  
  console.log('[VoiceChat] Setup complete with Gemini Live API. Commands: !joinvoice, !leavevoice, !voicestatus');
  return voiceCommands;
}

module.exports = {
  setupVoiceChat,
  VoiceCommands,
  LiveVoiceConversation: require('./live-voice-conversation').LiveVoiceConversation,
  GeminiLiveVoiceClient: require('./gemini-live-client').GeminiLiveVoiceClient,
  VoiceConnectionManager: require('./voice-connection').VoiceConnectionManager
};
