"use strict";

const {
  checkPremiumActive,
  getPosts,
  sendAutoPost,
  recordFailure,
} = require("../modules/autopost/autoPostService");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    if (!member.guild) return;

    try {
      const isPremium = await checkPremiumActive(member.guild.id);
      if (!isPremium) return;

      const autoPosts = await getPosts(member.guild.id);
      for (const post of autoPosts) {
        if (post.triggerType !== "MEMBER_JOIN") continue;
        if (post.status !== "ACTIVE" || !post.enabled) continue;

        const result = await sendAutoPost(client, post, {
          serverName: member.guild.name,
          memberCount: String(member.guild.memberCount),
          userMention: `<@${member.id}>`,
          username: member.user.username,
          displayName:
            member.displayName ||
            member.user.displayName ||
            member.user.username,
        });

        if (!result.success) {
          await recordFailure(post.id);
        }
      }
    } catch {
      // Non-critical, don't block member join processing
    }
  },
};
