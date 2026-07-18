"use strict";

const { rest, Routes } = require("./_commandDeployUtil");

console.log("Clearing all admin guild commands...");

rest()
  .put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.ADMIN_GUILD_ID,
    ),
    { body: [] },
  )
  .then(() => {
    console.log("✅ All admin guild commands cleared.");
  })
  .catch((err) => {
    console.error("❌ Failed to clear admin commands:", err.message);
    process.exit(1);
  });
