const { Guild } = require('../models');
const logger = require('../utils/logger');

async function startStatsUpdater(client) {
  const update = async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const guildData = await Guild.findOne({ guildId });
        if (!guildData?.statsChannels?.enabled) continue;

        const { statsChannels } = guildData;
        const totalMembers = guild.memberCount;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = totalMembers - bots;

        if (statsChannels.memberCountChannelId) {
          const ch = guild.channels.cache.get(statsChannels.memberCountChannelId);
          if (ch) ch.setName(`👥 Members: ${humans}`).catch(() => {});
        }
        if (statsChannels.botCountChannelId) {
          const ch = guild.channels.cache.get(statsChannels.botCountChannelId);
          if (ch) ch.setName(`🤖 Bots: ${bots}`).catch(() => {});
        }
        if (statsChannels.onlineCountChannelId) {
          const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
          const ch = guild.channels.cache.get(statsChannels.onlineCountChannelId);
          if (ch) ch.setName(`🟢 Online: ${online}`).catch(() => {});
        }
      } catch (err) {
        logger.error(`Stats channel update error (${guildId}):`, err.message);
      }
    }
  };

  // Update every 10 minutes (respect Discord rate limits)
  setInterval(update, 10 * 60 * 1000);
  setTimeout(update, 5000); // Initial update after 5s
}

module.exports = { startStatsUpdater };
