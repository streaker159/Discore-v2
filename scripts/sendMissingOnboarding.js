"use strict";

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const prisma = require("../src/lib/prisma");
const {
  findBestChannel,
  sendOnboarding,
} = require("../src/modules/onboarding/service");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function main() {
  await client.login(process.env.DISCORD_TOKEN);

  const guilds = [...client.guilds.cache.values()];
  const results = {
    checked: guilds.length,
    sent: [],
    skipped: [],
    failed: [],
  };

  for (const guild of guilds) {
    try {
      await prisma.guild.upsert({
        where: { id: guild.id },
        update: {
          allianceName: guild.name,
          allianceLogo: guild.iconURL(),
        },
        create: {
          id: guild.id,
          allianceName: guild.name,
          allianceLogo: guild.iconURL(),
        },
      });

      const record = await prisma.guild.findUnique({
        where: { id: guild.id },
        select: {
          onboardingSentAt: true,
          onboardingCompletedAt: true,
          onboardingSkippedAt: true,
        },
      });

      if (
        record?.onboardingSentAt ||
        record?.onboardingCompletedAt ||
        record?.onboardingSkippedAt
      ) {
        results.skipped.push({
          guild: guild.name,
          id: guild.id,
          reason: "already handled",
        });
        continue;
      }

      await guild.members.fetchMe().catch(() => null);
      await guild.channels.fetch().catch(() => null);

      const channel = findBestChannel(guild);
      if (!channel) {
        results.failed.push({
          guild: guild.name,
          id: guild.id,
          reason: "no writable channel found",
        });
        continue;
      }

      await sendOnboarding(guild, channel);
      results.sent.push({
        guild: guild.name,
        id: guild.id,
        channel: channel.id,
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      results.failed.push({
        guild: guild.name,
        id: guild.id,
        reason: error.message,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      client.destroy();
      await prisma.$disconnect().catch(() => {});
    });
}

module.exports = { main };
