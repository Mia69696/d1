const { Reminder, Guild } = require('../models');
const logger = require('../utils/logger');

async function startReminderChecker(client) {
  setInterval(async () => {
    try {
      const now = new Date();
      const due = await Reminder.find({ expiresAt: { $lte: now } });
      for (const reminder of due) {
        try {
          const user = await client.users.fetch(reminder.userId).catch(() => null);
          if (user) {
            user.send(`⏰ **Reminder:** ${reminder.message}`).catch(() => {});
          }
          await Reminder.deleteOne({ _id: reminder._id });
        } catch (err) {
          logger.error('Reminder send error:', err.message);
        }
      }
    } catch (err) {
      logger.error('Reminder checker error:', err.message);
    }
  }, 10000);
}

module.exports = { startReminderChecker };
