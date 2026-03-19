const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getUserRank, getLeaderboard, getProgressToNextLevel } = require('../../modules/leveling');
const { UserLevel } = require('../../models');

// ─── /rank ────────────────────────────────────────────────────────────────────
const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your or someone\'s rank and level')
    .addUserOption(o => o.setName('user').setDescription('User to check')),
  cooldown: 5,
  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const data = await getUserRank(target.id, interaction.guild.id);

    if (!data) {
      return interaction.editReply({ content: `❌ **${target.username}** hasn't earned any XP yet!` });
    }

    const progressBar = (filled, total) => {
      const bars = 20;
      const fill = Math.floor((filled / total) * bars);
      return '█'.repeat(fill) + '░'.repeat(bars - fill);
    };

    const embed = new EmbedBuilder()
      .setColor('#5865f2')
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
      .setTitle('📊 Rank Card')
      .addFields(
        { name: '🏆 Rank', value: `#${data.rank}`, inline: true },
        { name: '⭐ Level', value: `${data.level}`, inline: true },
        { name: '✉️ Messages', value: `${data.messageCount.toLocaleString()}`, inline: true },
        { name: '📈 Progress', value: `\`${progressBar(data.progress.currentXp, data.progress.neededXp)}\` ${data.progress.percentage}%`, inline: false },
        { name: '🔢 XP', value: `${data.progress.currentXp.toLocaleString()} / ${data.progress.neededXp.toLocaleString()}`, inline: true },
        { name: '📦 Total XP', value: `${data.totalXp.toLocaleString()}`, inline: true },
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `${interaction.guild.name}` })
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  },
};

// ─── /leaderboard ────────────────────────────────────────────────────────────
const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server XP leaderboard')
    .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)),
  cooldown: 10,
  async execute(interaction) {
    await interaction.deferReply();
    const page = interaction.options.getInteger('page') || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const total = await UserLevel.countDocuments({ guildId: interaction.guild.id });
    const entries = await UserLevel.find({ guildId: interaction.guild.id })
      .sort({ totalXp: -1 }).skip(skip).limit(limit).lean();

    if (!entries.length) return interaction.editReply({ content: '❌ No leaderboard data yet.' });

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(entries.map(async (e, i) => {
      const rank = skip + i + 1;
      const medal = rank <= 3 ? medals[rank - 1] : `**#${rank}**`;
      let username = `User ${e.userId}`;
      try {
        const user = await interaction.client.users.fetch(e.userId);
        username = user.username;
      } catch {}
      return `${medal} **${username}** — Level ${e.level} • ${e.totalXp.toLocaleString()} XP`;
    }));

    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle(`🏆 ${interaction.guild.name} Leaderboard`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Page ${page} • ${total} total members ranked` })
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  },
};

module.exports = rank;
// Export leaderboard separately
const fs = require('fs');
