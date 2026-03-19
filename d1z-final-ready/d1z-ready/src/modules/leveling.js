const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { UserLevel, Guild } = require('../models');
const logger = require('../utils/logger');

// ─── XP Calculation ──────────────────────────────────────────────────────────
function getXpForLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level));
}

function getLevelFromXp(totalXp) {
  let level = 0;
  let xpNeeded = 0;
  while (xpNeeded <= totalXp) {
    xpNeeded += getXpForLevel(level);
    if (xpNeeded > totalXp) break;
    level++;
  }
  return level;
}

function getProgressToNextLevel(totalXp) {
  let level = 0;
  let accumulated = 0;
  while (true) {
    const needed = getXpForLevel(level);
    if (accumulated + needed > totalXp) {
      return {
        currentXp: totalXp - accumulated,
        neededXp: needed,
        percentage: Math.floor(((totalXp - accumulated) / needed) * 100),
      };
    }
    accumulated += needed;
    level++;
  }
}

// ─── Process Message XP ──────────────────────────────────────────────────────
async function processXp(message, guildData, client) {
  try {
    const { leveling } = guildData;
    if (!leveling?.enabled) return;

    // Check ignored channels/roles
    if (leveling.ignoredChannels?.includes(message.channel.id)) return;
    const memberRoles = message.member.roles.cache.map(r => r.id);
    if (leveling.noXpRoles?.some(r => memberRoles.includes(r))) return;

    let userData = await UserLevel.findOne({ userId: message.author.id, guildId: message.guild.id });
    if (!userData) {
      userData = new UserLevel({ userId: message.author.id, guildId: message.guild.id });
    }

    // Cooldown check
    const now = Date.now();
    const cooldown = (leveling.xpCooldown || 60) * 1000;
    if (userData.lastXpGain && (now - userData.lastXpGain.getTime()) < cooldown) return;

    const xpGain = leveling.xpPerMessage || 15;
    const oldLevel = userData.level;

    userData.xp += xpGain;
    userData.totalXp += xpGain;
    userData.messageCount += 1;
    userData.lastXpGain = new Date();
    userData.level = getLevelFromXp(userData.totalXp);
    userData.updatedAt = new Date();

    await userData.save();

    // Level up!
    if (userData.level > oldLevel) {
      await handleLevelUp(message.member, userData, guildData, client);
    }

  } catch (err) {
    logger.error('processXp error:', err.message);
  }
}

// ─── Handle Level Up ─────────────────────────────────────────────────────────
async function handleLevelUp(member, userData, guildData, client) {
  const { leveling } = guildData;

  // Send level up message
  if (leveling.levelUpMessage) {
    const channel = leveling.levelUpChannelId
      ? member.guild.channels.cache.get(leveling.levelUpChannelId)
      : member.guild.systemChannel;

    if (channel) {
      const text = (leveling.levelUpText || 'Congrats {user}, you reached level {level}! 🎉')
        .replace('{user}', member.toString())
        .replace('{level}', userData.level)
        .replace('{tag}', member.user.tag);

      channel.send(text).catch(() => {});
    }
  }

  // Role rewards
  if (leveling.roleRewards?.length > 0) {
    const rewards = leveling.roleRewards.filter(r => r.level <= userData.level);
    for (const reward of rewards) {
      const role = member.guild.roles.cache.get(reward.roleId);
      if (role && !member.roles.cache.has(reward.roleId)) {
        member.roles.add(role).catch(() => {});
      }
    }
  }
}

// ─── Voice XP Tracking ───────────────────────────────────────────────────────
const voiceJoinTimes = new Map();

async function handleVoiceState(oldState, newState, guildData) {
  const userId = newState.id || oldState.id;
  const guildId = (newState.guild || oldState.guild).id;
  const key = `${guildId}:${userId}`;

  if (!oldState.channel && newState.channel) {
    // User joined a voice channel
    voiceJoinTimes.set(key, Date.now());
  } else if (oldState.channel && !newState.channel) {
    // User left a voice channel
    const joinTime = voiceJoinTimes.get(key);
    if (!joinTime) return;

    const minutesInVoice = Math.floor((Date.now() - joinTime) / 60000);
    voiceJoinTimes.delete(key);

    if (minutesInVoice < 1) return;

    const xpGain = (guildData.leveling?.voiceXpPerMinute || 5) * minutesInVoice;
    const userData = await UserLevel.findOneAndUpdate(
      { userId, guildId },
      { $inc: { voiceXp: xpGain, totalXp: xpGain }, $set: { updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    const newLevel = getLevelFromXp(userData.totalXp);
    if (newLevel > userData.level) {
      await UserLevel.updateOne({ userId, guildId }, { $set: { level: newLevel } });
    }
  }
}

// ─── Background tasks ─────────────────────────────────────────────────────────
function startVoiceXpTracker(client) {
  // Award XP every 5 minutes to people currently in voice channels
  setInterval(async () => {
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        const guildData = await Guild.findOne({ guildId });
        if (!guildData?.leveling?.enabled) continue;

        for (const [channelId, channel] of guild.channels.cache) {
          if (channel.type !== 2) continue; // Only voice channels
          for (const [memberId, member] of channel.members) {
            if (member.user.bot) continue;
            const key = `${guildId}:${memberId}`;
            if (!voiceJoinTimes.has(key)) {
              voiceJoinTimes.set(key, Date.now());
            }
          }
        }
      }
    } catch (err) {
      logger.error('Voice XP tracker error:', err.message);
    }
  }, 5 * 60 * 1000);
}

// ─── Get Leaderboard ─────────────────────────────────────────────────────────
async function getLeaderboard(guildId, limit = 10) {
  return UserLevel.find({ guildId }).sort({ totalXp: -1 }).limit(limit).lean();
}

// ─── Get User Rank ────────────────────────────────────────────────────────────
async function getUserRank(userId, guildId) {
  const userData = await UserLevel.findOne({ userId, guildId });
  if (!userData) return null;

  const rank = await UserLevel.countDocuments({ guildId, totalXp: { $gt: userData.totalXp } });
  const progress = getProgressToNextLevel(userData.totalXp);

  return {
    ...userData.toObject(),
    rank: rank + 1,
    progress,
    nextLevelXp: getXpForLevel(userData.level),
  };
}

module.exports = {
  processXp,
  handleVoiceState,
  startVoiceXpTracker,
  getLeaderboard,
  getUserRank,
  getXpForLevel,
  getLevelFromXp,
  getProgressToNextLevel,
};
