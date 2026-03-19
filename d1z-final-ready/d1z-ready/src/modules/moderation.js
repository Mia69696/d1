const { ModAction, Guild } = require('../models');
const logger = require('../utils/logger');

async function startPunishmentChecker(client) {
  // Check every 30 seconds for expired punishments
  setInterval(async () => {
    try {
      const now = new Date();
      const expired = await ModAction.find({
        active: true,
        expiresAt: { $lte: now },
        type: { $in: ['tempmute', 'tempban'] },
      });

      for (const action of expired) {
        try {
          const guild = client.guilds.cache.get(action.guildId);
          if (!guild) continue;

          if (action.type === 'tempban') {
            await guild.members.unban(action.targetId, 'Temp-ban expired').catch(() => {});
          }

          await ModAction.updateOne({ _id: action._id }, { $set: { active: false } });
          logger.info(`Expired punishment removed: ${action.type} for ${action.targetId}`);
        } catch (err) {
          logger.error('Error removing expired punishment:', err.message);
        }
      }
    } catch (err) {
      logger.error('Punishment checker error:', err.message);
    }
  }, 30000);
}

async function getNextCaseNumber(guildId) {
  const last = await ModAction.findOne({ guildId }).sort({ caseNumber: -1 });
  return (last?.caseNumber || 0) + 1;
}

module.exports = { startPunishmentChecker, getNextCaseNumber };
