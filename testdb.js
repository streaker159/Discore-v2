require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.$queryRaw`SELECT 1`
  .then(() => console.log("✅ DB connection OK"))
  .catch((e) => console.error("❌ DB FAIL:", e.message))
  .finally(() => p.$disconnect());
