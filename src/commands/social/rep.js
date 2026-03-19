const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserProfile } = require('../../models');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Give reputation to a user')
    .addUserOption(o => o.setName('user').setDescription('User to give rep to').setRequired(true)),
  cooldown: 3,
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot rep yourself.', ephemeral: true });
    if (target.bot) return interaction.reply({ content: '❌ You cannot rep bots.', ephemeral: true });

    await interaction.deferReply();

    let giver = await UserProfile.findOne({ userId: interaction.user.id });
    if (!giver) giver = await UserProfile.create({ userId: interaction.user.id });

    // 12-hour cooldown
    const now = Date.now();
    if (giver.lastRepGiven && now - giver.lastRepGiven.getTime() < 12 * 60 * 60 * 1000) {
      const next = new Date(giver.lastRepGiven.getTime() + 12 * 60 * 60 * 1000);
      return interaction.editReply({ content: `⏱️ You can give rep again <t:${Math.floor(next.getTime() / 1000)}:R>.` });
    }

    let receiver = await UserProfile.findOne({ userId: target.id });
    if (!receiver) receiver = await UserProfile.create({ userId: target.id });

    receiver.reputation += 1;
    receiver.repReceived.push({ fromUserId: interaction.user.id, timestamp: new Date() });
    await receiver.save();

    giver.lastRepGiven = new Date();
    await giver.save();

    const embed = new EmbedBuilder()
      .setColor('#43b581')
      .setTitle('⭐ Reputation Given!')
      .setDescription(`**${interaction.user.tag}** gave a reputation point to **${target.tag}**!\n${target.tag} now has **${receiver.reputation}** rep.`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  },
};
