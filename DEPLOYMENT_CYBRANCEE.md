# Discore V2 — Cybrancee Hosting Deployment Guide

## Current Production Setup (Working)

| Setting | Value |
|---------|-------|
| Host | Cybrancee Discord Bot Hosting |
| Runtime | NodeJS 24 |
| Bot JS File | `src/index.js` |
| Auto Update | OFF (manual upload) |
| User Uploaded Files | ON |
| NPM Install | ON |
| Database | Supabase / PostgreSQL via Prisma |
| Bot Identity | Discore Official#8611 |

## Startup Flow

```bash
npm install
node ./node_modules/prisma/build/index.js generate
node src/index.js
```

## Prisma Fix (Critical)

Do NOT use `prisma generate` or `npx prisma generate` as `postinstall` — permission errors on Cybrancee.

Use the Node invocation path instead:

```json
"postinstall": "node ./node_modules/prisma/build/index.js generate"
```

The schema generator must include Linux binary targets:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

## Manual Upload Deployment

1. Commit local changes to GitHub
2. Create ZIP from project root contents
3. **Exclude from ZIP:** `node_modules`, `.env`, `.git`
4. Upload/extract to `/home/container` via Cybrancee dashboard
5. Server `.env` stays in `/home/container/.env` (never in ZIP)
6. Restart bot

## GitHub Auto-Update (Future)

Cybrancee auto-update requires a `.git` folder to already exist on the server.

Current startup check:
```bash
if [[ -d .git ]] && [[ ${AUTO_UPDATE} == "1" ]]; then git pull; fi
```

### To Enable Auto-Update

First, convert the manual upload into a Git working copy:

```bash
cd /home/container
git init
git remote add origin https://<GITHUB_TOKEN>@github.com/streaker159/Discore-v2.git
git fetch origin main
git reset --hard origin/main
```

Then set in Cybrancee dashboard:

| Setting | Value |
|---------|-------|
| Git Repo Address | `https://github.com/streaker159/Discore-v2` |
| Install Branch | `main` |
| Git Username | `streaker159` |
| Git Access Token | GitHub classic token with `repo` scope |
| Auto Update | ON |

**Never commit the token to the repo.**

## Files Never Uploaded / Committed

- `.env` (contains secrets)
- `node_modules/` (server installs via `npm install`)
- `.git/` (for manual ZIP uploads)

## Known Non-Fatal Warning

```
Failed to load component file createBattle.js
Identifier 'ModalBuilder' has already been declared
```

Fixed in local repo (duplicate import removed). Will not appear after next deployment.
