const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { ModAction } = require('../../models');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cases')
    .setDescription('View moderation history for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  cooldown: 5,
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    await interaction.deferReply();

    const cases = await ModAction.find({ guildId: interaction.guild.id, targetId: target.id }).sort({ caseNumber: -1 }).limit(15);

    if (!cases.length) {
      return interaction.editReply({ content: `✅ No moderation history for **${target.tag}**.` });
    }

    const embed = new EmbedBuilder()
      .setColor('#7289da')
      .setTitle(`📋 Moderation History — ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setDescription(cases.map(c =>
        `**Case #${c.caseNumber}** • \`${c.type.toUpperCase()}\`\n👮 ${c.moderatorTag} • 📝 ${c.reason}\n<t:${Math.floor(c.createdAt.getTime() / 1000)}:R>`
      ).join('\n\n'))
      .setFooter({ text: `Total: ${cases.length} case(s)` })
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  },
};
