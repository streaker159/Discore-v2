require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  console.log("Connecting to database using Prisma Client...");
  try {
    // Attempt a simple query to see if connection works
    const result = await p.$queryRaw`SELECT 1 as connected`;
    console.log("Database connection successful:", result);

    // Check some tables or models if needed
    console.log("Testing model access (Guild)...");
    const guildCount = await p.guild.count();
    console.log(
      `Successfully connected and queried Guild table. Guild count: ${guildCount}`,
    );
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error);
  } finally {
    await p.$disconnect();
  }
}

main();
