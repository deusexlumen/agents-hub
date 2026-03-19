const { LiveVoiceConversation } = require('./live-voice-conversation');

/**
 * Voice Commands Integration
 * Adds !joinvoice, !leavevoice, !voicestatus commands
 */
class VoiceCommands {
  constructor(client) {
    this.client = client;
    this.voiceConversation = new LiveVoiceConversation();
  }

  /**
   * Setup command handlers
   */
  setup() {
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      const args = message.content.split(' ');
      const command = args[0].toLowerCase();

      try {
        switch (command) {
          case '!joinvoice':
            await this.handleJoinVoice(message, args);
            break;
            
          case '!leavevoice':
            await this.handleLeaveVoice(message);
            break;
            
          case '!voicestatus':
            await this.handleVoiceStatus(message);
            break;
        }
      } catch (error) {
        console.error('[VoiceCommands] Error:', error);
        await message.reply('❌ Fehler bei Voice Command: ' + error.message);
      }
    });
  }

  /**
   * Handle !joinvoice command
   */
  async handleJoinVoice(message, args) {
    // Check permissions
    if (!message.member.permissions.has('Connect')) {
      return message.reply('❌ Du hast keine Berechtigung für Voice-Channels.');
    }

    // Get voice channel
    let voiceChannel = message.member.voice.channel;
    
    // If user provided channel ID
    if (args[1] && !voiceChannel) {
      voiceChannel = await this.client.channels.fetch(args[1]).catch(() => null);
    }

    if (!voiceChannel) {
      return message.reply('❌ Du bist in keinem Voice-Channel. Trete einem bei oder gib eine Channel-ID an.');
    }

    // Check if bot has permissions
    const permissions = voiceChannel.permissionsFor(this.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return message.reply('❌ Ich habe keine Berechtigung für diesen Voice-Channel.');
    }

    // Join
    await message.reply(`🎙️ Trete Voice-Channel **${voiceChannel.name}** bei mit Gemini Live API...`);
    
    const result = await this.voiceConversation.join(
      voiceChannel.id,
      message.guild,
      message.author.id
    );

    if (result.success) {
      await message.reply('✅ Ich bin jetzt im Voice-Channel mit **Gemini Live**! Sprich mich an — ich höre zu und antworte direkt.');
    } else {
      await message.reply('❌ Fehler: ' + result.error);
    }
  }

  /**
   * Handle !leavevoice command
   */
  async handleLeaveVoice(message) {
    const result = await this.voiceConversation.leave(message.guild.id);
    
    if (result.success) {
      await message.reply('👋 Ich habe den Voice-Channel verlassen. Gemini Live Session beendet.');
    } else {
      await message.reply('❌ Ich war gar nicht in einem Voice-Channel.');
    }
  }

  /**
   * Handle !voicestatus command
   */
  async handleVoiceStatus(message) {
    const status = this.voiceConversation.getStatus(message.guild.id);
    
    if (!status.connected) {
      return message.reply('📵 Ich bin aktuell in keinem Voice-Channel.');
    }

    const embed = {
      title: '🎙️ Voice Status (Gemini Live)',
      fields: [
        { name: 'Verbunden', value: status.connected ? '✅ Ja' : '❌ Nein', inline: true },
        { name: 'Channel', value: status.channelId ? `<#${status.channelId}>` : 'Unbekannt', inline: true },
        { name: 'Verbindung', value: status.connectionState, inline: true },
        { name: 'Gemini Live', value: status.liveSession ? '🟢 Aktiv' : '🔴 Inaktiv', inline: true },
        { name: 'Live Session', value: status.liveSessionActive ? '✅ Verbunden' : '❌ Getrennt', inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Bidirektionales Audio-Streaming' }
    };

    await message.reply({ embeds: [embed] });
  }
}

module.exports = { VoiceCommands };
