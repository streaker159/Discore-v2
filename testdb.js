require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.guild
  .upsert({
    where: { id: "1366566263048110125" },
    update: {},
    create: { id: "1366566263048110125" },
  })
  .then(() => console.log("✅ Guild registered"))
  .catch((e) => console.error("❌", e.message))
  .finally(() => p.$disconnect());
