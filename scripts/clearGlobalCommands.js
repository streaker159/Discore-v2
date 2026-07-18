"use strict";

const { rest, Routes } = require("./_commandDeployUtil");

console.log("Clearing all global commands...");

rest()
  .put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [] })
  .then(() => {
    console.log("✅ All global commands cleared.");
  })
  .catch((err) => {
    console.error("❌ Failed to clear commands:", err.message);
    process.exit(1);
  });
