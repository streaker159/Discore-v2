# Discore V2

Discore V2 is a modular Discord.js v14 bot for strategy-game communities.

## Core stack

- Node.js
- Discord.js v14
- PostgreSQL
- Prisma
- DeepSeek AI placeholder
- Stripe-ready premium structure

## Quick start

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run deploy:global
npm run deploy:admin
npm run dev
```

## Command deployment

Public commands are deployed globally with:

```bash
npm run deploy:global
```

Owner-only admin commands are deployed only to `ADMIN_GUILD_ID` with:

```bash
npm run deploy:admin
```

## Branding rule

Every standard Discore embed uses:

- Top: alliance logo / alliance name
- Bottom: Powered by Discore

This is handled by `src/lib/embedBuilder.js`.

## Current status

This is a strong V2 foundation/skeleton. Many modules already have working starter logic, and the rest contain placeholders ready to expand.
