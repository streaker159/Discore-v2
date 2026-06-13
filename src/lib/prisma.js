const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global.__discorePrisma) {
  global.__discorePrisma = new PrismaClient();
}

prisma = global.__discorePrisma;

module.exports = prisma;
