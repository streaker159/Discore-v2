# DISCORE V2 - FULL IMPLEMENTATION STATUS

**Date:** June 22, 2026  
**Option Chosen:** Option A - Full Implementation  
**Status:** IN PROGRESS (Phase 2 Complete)

---

## ✅ COMPLETED WORK

### Phase 1: Command Cleanup ✅

**Files Deleted:**

- `src/commands/public/battle/battle.js` ✅
- `src/commands/public/game/game.js` ✅
- `src/commands/public/match/match.js` ✅
- `src/commands/public/strategy/strategy.js` ✅

**Result:** Old/broken commands removed from codebase

### Phase 2: Database Schema ✅

**File Modified:**

- `prisma/schema.prisma` ✅

**Changes Made:**

1. **Guild Model Updates:**
   - Added `allianceCode` (unique, 1-6 chars A-Z0-9)
   - Added `logChannelId` (replaces adminLogChan)
   - Added AvA fields: `avaCategoryId`, `avaRequestChannelId`, `avaChatChannelId`, `avaAlertRoleId`
   - Added role fields: `discoreManagerRoleId`, `discoreAvaRoleId`, `discoreAppealRoleId`, `discoreMutedRoleId`
   - Added `maintainRolesAndChannels` (boolean, default true)
   - Added relations: moderationCases, appeals, autoModRules, autoModCases, userActivities

2. **New Models Added:**
   - `UserActivity` - Track last message, reaction, interaction, streaks
   - `ModerationCase` - Warn, mute, timeout, ban, probation cases
   - `Appeal` - User appeals for moderation actions
   - `UserRoleSnapshot` - Store roles before removal for restoration
   - `AutoModRule` - Banned words/phrases configuration
   - `AutoModCase` - Flagged messages for review
   - `AiUsage` - Monthly AI credit tracking

3. **New Enums:**
   - `ModActionType`: WARN, MUTE, TIMEOUT, BAN, PROBATION
   - `CaseStatus`: ACTIVE, EXPIRED, REVOKED, APPEALED
   - `AppealStatus`: PENDING, ACCEPTED, REJECTED
   - `MatchType`: EXACT, CONTAINS, STARTS_WITH, REGEX
   - `AutoModAction`: DELETE, REVIEW, MUTE, TIMEOUT
   - `ReviewStatus`: PENDING, APPROVED, DENIED

**Migration Status:** ⚠️ **REQUIRES ATTENTION**

- Drift detected - database already has many tables
- Need to either:
  - Run `prisma db push` to sync without migration
  - Run `prisma migrate reset` (⚠️ WILL DELETE DATA)
  - Create baseline migration with `prisma migrate dev --create-only`

---

## 🚧 REMAINING WORK

### Phase 3: Utility Files (NOT STARTED)

Need to create:

1. `src/lib/publicIdGenerator.js`
   - Generate MOD-xxxxx, APL-xxxxx, AMC-xxxxx IDs
   - Handle collisions
   - Short readable format

2. `src/lib/imageUpload.js`
   - Handle Discord attachment uploads
   - Extract image URLs from attachments
   - Validate image types
   - Support fallback URL input

### Phase 4: Premium Fixes (NOT STARTED)

Files to modify:

1. `src/commands/public/server/server.js` - Fix `/server info`
   - Show LIFETIME tier correctly
   - Display AI credits (used/remaining)
   - Fix premium display bug

2. `src/commands/public/premium/premium.js` - Fix `/premium status`
   - Show LIFETIME properly
   - Add monthly AI credits
   - Show usage this month

3. `src/lib/embedBuilder.js`
   - Fix premium display helpers
   - Support LIFETIME tier display

### Phase 5: AI Premium Lock (NOT STARTED)

Files to modify:

1. `src/commands/public/ask/ask.js`
   - Check tier before Gemini call
   - Check AI credits before request
   - Deduct credits after response
   - Show locked/exhausted messages

2. `src/lib/premiumGate.js`
   - Add `checkAiCredits()` function
   - Add `deductAiCredits()` function
   - Premium tier to credits mapping

3. `src/modules/ai/service.js` or new file
   - Track monthly usage
   - Reset credits monthly
   - Log AI requests

### Phase 6: Server Command Refactor (NOT STARTED)

Major refactor of `src/commands/public/server/server.js`:

**New Subcommands Needed:**

- `/server setup` - Interactive management panel
- `/server set-alliance-code` - Set 1-6 char code
- `/server set-ava-channels` - Configure AvA category/channels
- `/server set-roles` - Configure required roles
- `/server repair` - Fix missing roles/channels
- `/server reset-roles` - Clear and recreate roles

**Features:**

- Alliance code validation (A-Z0-9, 1-6 chars, unique check)
- AvA channel setup
- Role maintenance toggle
- Management panel with buttons

### Phase 7: Moderation System (NOT STARTED)

Create:

1. `src/commands/public/mod/mod.js`
   - Subcommands: warn, mute, timeout, ban, unban, probation, case, cases, revoke, appeal
   - Permission checks
   - DM users with case info
   - Log to channel
   - Create moderation cases

2. `src/modules/moderation/service.js`
   - `createCase()`
   - `revokeCase()`
   - `getCase()`
   - `getCases()`

3. `src/modules/moderation/caseManager.js`
   - Handle case creation
   - Send DMs
   - Apply Discord actions
   - Schedule expiry

4. `src/modules/moderation/appealManager.js`
   - Create appeal
   - Accept/reject appeal
   - Restore roles
   - Create appeal channels

5. `src/jobs/moderationExpiry.js`
   - Check expired cases
   - Remove timeouts/mutes
   - Clear probation
   - Update DB

### Phase 8: Automod System (NOT STARTED)

Create:

1. `src/commands/public/automod/automod.js`
   - Subcommands: add-rule, remove-rule, list-rules, review, settings
   - Add banned words/phrases
   - Configure actions

2. `src/modules/automod/service.js`
   - `addRule()`
   - `removeRule()`
   - `getRules()`
   - `flagMessage()`

3. `src/modules/automod/ruleEngine.js`
   - Check messages against rules
   - Match types (exact, contains, regex)
   - Delete/review/mute actions

4. `src/events/messageCreate.js` - Update
   - Add automod check
   - Flag matched messages
   - Post review embeds
   - DM users

5. `src/jobs/automodCleanup.js`
   - Delete old message excerpts
   - Clean up after retention period

### Phase 9: Player Profiles (NOT STARTED)

Create/modify:

1. `src/commands/public/player/player.js`
   - Add `profile` subcommand
   - Show user stats
   - Show moderation history (admin only)
   - Show probation status (public)

2. `src/modules/activity/tracker.js`
   - Track last message
   - Track last reaction
   - Track last interaction
   - Update activity streaks

3. Update event listeners:
   - `src/events/messageCreate.js` - Track messages
   - `src/events/interactionCreate.js` - Track commands
   - Add reaction tracking if intents allow

### Phase 10: AvA Improvements (NOT STARTED)

Modify:

1. `src/commands/public/ava/ava.js`
   - Add alliance code matching
   - Add logo uploads (home/away)
   - Add game image upload
   - Cross-server challenge flow

2. Add cross-server messaging
3. Add accept/deny/modify buttons
4. Create AvA channels automatically

### Phase 11: Role/Channel Maintenance (NOT STARTED)

Create:

1. `src/modules/maintenance/roleChannelChecker.js`
   - Check required roles exist
   - Check required channels exist
   - Recreate if missing (if enabled)
   - Warn if disabled

2. `src/jobs/roleChannelMaintenance.js`
   - Run hourly
   - Check batches of guilds
   - Don't spam Discord API
   - Log warnings

### Phase 12: Help Updates (NOT STARTED)

Modify:

1. `src/commands/public/help/help.js`
   - Remove old command references
   - Add /ask documentation
   - Add /mod documentation
   - Add /automod documentation
   - Add /player profile documentation
   - Update AvA help
   - Explain alliance codes

### Phase 13: Testing (NOT STARTED)

Test:

1. Bot boots successfully
2. Commands deploy cleanly
3. Old commands don't appear
4. /ask works with premium lock
5. /server info shows LIFETIME
6. /premium status shows correctly
7. Moderation commands work
8. Appeals work
9. Automod works
10. Player profiles work
11. Image uploads work
12. No runtime errors

---

## 📊 PROGRESS SUMMARY

**Completed:** 2 / 13 phases (15%)
**Estimated Remaining:** 15-24 hours
**Context Used:** 75%

---

## ⚠️ CRITICAL NEXT STEPS

### Immediate (Before Continuing):

1. **Handle Database Migration**

   ```bash
   # Option A: Push changes without migration (safe if schema matches)
   npx prisma db push

   # Option B: Create baseline migration (recommended)
   npx prisma migrate dev --create-only --name baseline
   # Then edit migration to be safe
   npx prisma migrate dev

   # Option C: Reset database (⚠️ DELETES DATA)
   npx prisma migrate reset
   npx prisma migrate dev --name add_moderation_automod_activity_tracking
   ```

2. **Regenerate Prisma Client**

   ```bash
   npx prisma generate
   ```

3. **Test Bot Boots**

   ```bash
   npm run dev
   ```

4. **Deploy Commands**
   ```bash
   npm run deploy:global
   ```

### Then Continue Implementation:

Choose approach:

- **A)** Continue full implementation (may need multiple sessions)
- **B)** Prioritize critical fixes only (server info, AI lock)
- **C)** Implement one system at a time (moderation → automod → profiles)

---

## 📝 NOTES

### What's Working:

- ✅ Old commands removed
- ✅ Schema updated with new fields and models
- ✅ /ask command exists and works (needs premium lock)
- ✅ /event system works (battles via events)
- ✅ Scoreboards work

### What's Broken/Missing:

- ❌ No moderation system
- ❌ No automod
- ❌ No player profiles
- ❌ AI not premium locked
- ❌ Server info doesn't show premium correctly
- ❌ No alliance code system
- ❌ No AvA cross-server matching
- ❌ No image upload support
- ❌ No role/channel maintenance

### Priority Order (Recommended):

1. **Critical Fixes** (2-3 hours)
   - Server info premium display
   - AI premium lock
   - Public ID generator utility

2. **Moderation** (4-6 hours)
   - /mod commands
   - Case system
   - Appeals

3. **Automod** (3-4 hours)
   - Rules
   - Message checking
   - Review system

4. **Player Profiles** (2-3 hours)
   - Activity tracking
   - Profile display

5. **AvA & Maintenance** (3-4 hours)
   - Alliance codes
   - Cross-server
   - Role checking

6. **Polish** (2-3 hours)
   - Help updates
   - Testing
   - Bug fixes

---

## 🚀 READY TO CONTINUE

The foundation is laid. Schema is ready. Old commands are gone.

**Next developer action:**

1. Handle database migration carefully
2. Choose implementation approach
3. Continue with chosen phases
4. Test thoroughly before production

**Files Changed So Far:**

- Deleted: 4 command files
- Modified: 1 file (schema.prisma)
- Created: 2 documentation files

**Estimated Total Work Remaining:** 15-24 hours

---

**Status:** Foundation complete, ready for feature implementation
