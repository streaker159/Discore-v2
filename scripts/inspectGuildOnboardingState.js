"use strict";

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const prisma = require("../src/lib/prisma");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    console.log("CLIENT_ID", process.env.CLIENT_ID);
    console.log("BOT_USER", client.user.tag, client.user.id);
    console.log(
      "LIVE_GUILDS",
      client.guilds.cache.size,
      [...client.guilds.cache.values()]
        .map((guild) => `${guild.name} (${guild.id})`)
        .join(", "),
    );

    const dbGuilds = await prisma.guild.findMany({
      select: {
        id: true,
        allianceName: true,
        onboardingSentAt: true,
        onboardingCompletedAt: true,
        onboardingSkippedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    console.log("DB_GUILDS", dbGuilds.length);
    for (const guild of dbGuilds) {
      console.log(
        `${guild.allianceName || "Unknown"} (${guild.id}) sent=${Boolean(
          guild.onboardingSentAt,
        )} complete=${Boolean(guild.onboardingCompletedAt)} skipped=${Boolean(
          guild.onboardingSkippedAt,
        )} live=${client.guilds.cache.has(guild.id)}`,
      );
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
