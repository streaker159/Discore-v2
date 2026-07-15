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

        // Check memberJoinEnabled — if explicitly false, skip
        if (post.memberJoinEnabled === false) {
          if (process.env.DEBUG_AUTOPOST === "true") {
            console.log(
              `[AutoPost] Skipping member-join post "${post.name}" — memberJoinEnabled is false`,
            );
          }
          continue;
        }

        const result = await sendAutoPost(client, post, {
          serverName: member.guild.name,
          memberCount: String(member.guild.memberCount),
          userMention: `<@${member.id}>`,
          userId: member.id,
          username: member.user.username,
          displayName:
            member.displayName ||
            member.user.displayName ||
            member.user.username,
          joinDate: member.joinedAt
            ? member.joinedAt.toLocaleString()
            : new Date().toLocaleString(),
        });

        if (!result.success) {
          await recordFailure(post.id);
        }
      }
    } catch (err) {
      if (process.env.DEBUG_AUTOPOST === "true") {
        console.error("[AutoPost] guildMemberAdd error:", err);
      }
      // Non-critical, don't block member join processing
    }
  },
};
