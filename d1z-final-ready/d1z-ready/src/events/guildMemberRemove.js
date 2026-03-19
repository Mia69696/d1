const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { Guild, GuildStats } = require('../models');
const logger = require('../utils/logger');

// ─── guildMemberRemove ────────────────────────────────────────────────────────
const guildMemberRemove = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      const guildData = await Guild.findOne({ guildId: member.guild.id });
      if (!guildData) return;

      // Goodbye message
      if (guildData.goodbye?.enabled && guildData.goodbye.channelId) {
        const channel = member.guild.channels.cache.get(guildData.goodbye.channelId);
        if (channel) {
          const msg = guildData.goodbye.message
            .replace('{user}', member.user.tag)
            .replace('{server}', member.guild.name);
          channel.send(msg).catch(() => {});
        }
      }

      // Logging
      if (guildData.logging?.enabled && guildData.logging.events.memberLeave && guildData.logging.channelId) {
        const logChannel = member.guild.channels.cache.get(guildData.logging.channelId);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor('#f04747')
            .setTitle('📤 Member Left')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
              { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
              { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
              { name: 'Roles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).join(', ') || 'None', inline: false }
            )
            .setTimestamp();
          logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }

      const today = new Date(); today.setHours(0, 0, 0, 0);
      await GuildStats.findOneAndUpdate(
        { guildId: member.guild.id, date: today },
        { $inc: { leftMembers: 1 }, $set: { memberCount: member.guild.memberCount } },
        { upsert: true }
      ).catch(() => {});

    } catch (err) {
      logger.error('guildMemberRemove error:', err.message);
    }
  },
};

// ─── messageDelete ────────────────────────────────────────────────────────────
const messageDelete = {
  name: 'messageDelete',
  async execute(message, client) {
    if (!message.guild || message.author?.bot) return;
    try {
      const guildData = await Guild.findOne({ guildId: message.guild.id });
      if (!guildData?.logging?.enabled || !guildData.logging.events.messageDelete || !guildData.logging.channelId) return;

      const logChannel = message.guild.channels.cache.get(guildData.logging.channelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setColor('#faa61a')
        .setTitle('🗑️ Message Deleted')
        .addFields(
          { name: 'Author', value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown', inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Content', value: message.content?.slice(0, 1024) || '*Empty / attachment*', inline: false }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      logger.error('messageDelete log error:', err.message);
    }
  },
};

// ─── messageUpdate ────────────────────────────────────────────────────────────
const messageUpdate = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    try {
      const guildData = await Guild.findOne({ guildId: newMessage.guild.id });
      if (!guildData?.logging?.enabled || !guildData.logging.events.messageEdit || !guildData.logging.channelId) return;

      const logChannel = newMessage.guild.channels.cache.get(guildData.logging.channelId);
      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setColor('#7289da')
        .setTitle('✏️ Message Edited')
        .setURL(newMessage.url)
        .addFields(
          { name: 'Author', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
          { name: 'Channel', value: `${newMessage.channel}`, inline: true },
          { name: 'Before', value: oldMessage.content?.slice(0, 512) || '*Unknown*', inline: false },
          { name: 'After', value: newMessage.content?.slice(0, 512) || '*Empty*', inline: false }
        )
        .setTimestamp();

      logChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      logger.error('messageUpdate log error:', err.message);
    }
  },
};

// ─── voiceStateUpdate ─────────────────────────────────────────────────────────
const voiceStateUpdate = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    try {
      const guildData = await Guild.findOne({ guildId: oldState.guild.id });
      if (!guildData) return;

      // Logging
      if (guildData.logging?.enabled && guildData.logging.channelId) {
        const logChannel = oldState.guild.channels.cache.get(guildData.logging.channelId);
        if (logChannel) {
          let embed = null;
          if (!oldState.channel && newState.channel && guildData.logging.events.voiceJoin) {
            embed = new EmbedBuilder()
              .setColor('#43b581')
              .setTitle('🎙️ Voice Channel Joined')
              .addFields(
                { name: 'Member', value: `${newState.member.user.tag}`, inline: true },
                { name: 'Channel', value: newState.channel.name, inline: true }
              ).setTimestamp();
          } else if (oldState.channel && !newState.channel && guildData.logging.events.voiceLeave) {
            embed = new EmbedBuilder()
              .setColor('#f04747')
              .setTitle('🔇 Voice Channel Left')
              .addFields(
                { name: 'Member', value: `${oldState.member.user.tag}`, inline: true },
                { name: 'Channel', value: oldState.channel.name, inline: true }
              ).setTimestamp();
          } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id && guildData.logging.events.voiceMove) {
            embed = new EmbedBuilder()
              .setColor('#7289da')
              .setTitle('🔀 Moved Voice Channels')
              .addFields(
                { name: 'Member', value: `${newState.member.user.tag}`, inline: true },
                { name: 'From', value: oldState.channel.name, inline: true },
                { name: 'To', value: newState.channel.name, inline: true }
              ).setTimestamp();
          }
          if (embed) logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }

      // Voice XP tracking
      if (guildData.leveling?.enabled) {
        const { handleVoiceState } = require('../modules/leveling');
        await handleVoiceState(oldState, newState, guildData);
      }

    } catch (err) {
      logger.error('voiceStateUpdate error:', err.message);
    }
  },
};

// ─── guildMemberUpdate (role changes, nickname) ───────────────────────────────
const guildMemberUpdate = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    try {
      const guildData = await Guild.findOne({ guildId: newMember.guild.id });
      if (!guildData?.logging?.enabled || !guildData.logging.channelId) return;

      const logChannel = newMember.guild.channels.cache.get(guildData.logging.channelId);
      if (!logChannel) return;

      // Role changes
      if (guildData.logging.events.memberRoleUpdate) {
        const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

        if (addedRoles.size > 0 || removedRoles.size > 0) {
          const embed = new EmbedBuilder()
            .setColor('#7289da')
            .setTitle('🏷️ Member Roles Updated')
            .addFields(
              { name: 'Member', value: `${newMember.user.tag}`, inline: true },
              ...(addedRoles.size > 0 ? [{ name: '✅ Roles Added', value: addedRoles.map(r => r.name).join(', '), inline: false }] : []),
              ...(removedRoles.size > 0 ? [{ name: '❌ Roles Removed', value: removedRoles.map(r => r.name).join(', '), inline: false }] : [])
            ).setTimestamp();
          logChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }

      // Nickname change
      if (guildData.logging.events.nicknameChange && oldMember.nickname !== newMember.nickname) {
        const embed = new EmbedBuilder()
          .setColor('#faa61a')
          .setTitle('📝 Nickname Changed')
          .addFields(
            { name: 'Member', value: `${newMember.user.tag}`, inline: true },
            { name: 'Before', value: oldMember.nickname || '*None*', inline: true },
            { name: 'After', value: newMember.nickname || '*None*', inline: true }
          ).setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      logger.error('guildMemberUpdate error:', err.message);
    }
  },
};

module.exports = guildMemberRemove;
// Export others as separate files
const fs = require('fs');
const path = require('path');
// These will be auto-loaded as separate event files
