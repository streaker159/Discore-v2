"use strict";

const { commandJsonFromDir, rest, Routes } = require("./_commandDeployUtil");

const commands = commandJsonFromDir("src/commands/admin");
if (!commands.length) {
  console.log("No admin-only commands found. Skipping.");
  process.exit(0);
}

console.log(`Deploying ${commands.length} admin commands...`);

rest()
  .put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.ADMIN_GUILD_ID,
    ),
    { body: commands },
  )
  .then((res) => {
    console.log(`✅ Deployed ${res.length} admin commands.`);
    for (const cmd of res) {
      console.log(`  /${cmd.name}`);
    }
  })
  .catch((err) => {
    console.error("❌ Failed to deploy admin commands:", err.message);
    process.exit(1);
  });
