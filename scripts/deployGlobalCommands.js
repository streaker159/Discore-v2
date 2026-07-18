"use strict";

const { commandJsonFromDir, rest, Routes } = require("./_commandDeployUtil");

const commands = commandJsonFromDir("src/commands/public");
if (!commands.length) {
  console.error("No public commands found.");
  process.exit(1);
}

console.log(`Deploying ${commands.length} public commands globally...`);

rest()
  .put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands,
  })
  .then((res) => {
    console.log(`✅ Deployed ${res.length} global commands.`);
    for (const cmd of res) {
      console.log(`  /${cmd.name}`);
    }
  })
  .catch((err) => {
    console.error("❌ Failed to deploy commands:", err.message);
    process.exit(1);
  });
