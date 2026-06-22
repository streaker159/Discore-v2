# DISCORE V2 - CLEANUP & CONSOLIDATION ANALYSIS REPORT

**Generated:** June 22, 2026
**Status:** ANALYSIS PHASE - NO CHANGES MADE YET

---

## 🔍 CURRENT PROJECT STATE

### Existing Public Commands

From `src/commands/public/`:

1. ✅ **ask/** - NEW - Recently added, working
2. ⚠️ **alliance/** - Status unknown, needs review
3. ⚠️ **ava/** - Needs expansion, keep
4. ❌ **battle/** - MARKED FOR REMOVAL (duplicate module.exports, already disabled)
5. ✅ **event/** - Core system, keep
6. ❌ **game/** - MARKED FOR REMOVAL (game data search not ready)
7. ✅ **help/** - Keep, needs update
8. ❌ **match/** - MARKED FOR REMOVAL (match finder not ready)
9. ✅ **ping/** - Diagnostic, keep
10. ⚠️ **player/** - Needs expansion
11. ✅ **premium/** - Keep, needs fixes
12. ✅ **scoreboard/** - Core system, keep
13. ✅ **server/** - Keep, needs major refactor
14. ❌ **strategy/** - DISABLED - Replaced by /ask
15. ⚠️ **suggestion/** - Status unknown, needs review

### Commands to REMOVE/DISABLE

Based on requirements:

1. **battle/battle.js**
   - Reason: Already disabled, battles now use `/event create type:battle`
   - Has duplicate `module.exports` (coding error)
   - Action: Delete file, already replaced

2. **game/game.js**
   - Subcommands: unit, building, resource, research, search, set-default
   - Reason: Game data not ready, premature feature
   - Dependencies: `modules/gameData/service`
   - Action: Disable or remove

3. **match/match.js**
   - Subcommand: find
   - Reason: Match finder not ready, no approved data source
   - Dependencies: `modules/gameFinder/service`
   - Action: Disable or remove

4. **strategy/strategy.js**
   - Already disabled
   - Replaced by `/ask`
   - Action: Keep disabled or remove file

### Commands to KEEP & IMPROVE

1. **ask/** ✅
   - Recently rebuilt, working
   - Needs: Premium locking, AI credit checks

2. **event/** ✅
   - Core system
   - Already handles battle type
   - Keep as-is

3. **scoreboard/** ✅
   - Core system
   - Needs: Image upload support (not just URL)

4. **server/** ⚠️ NEEDS MAJOR REFACTOR
   - Current subcommands: info, setup, settings, timezone, default-game, branding, channels
   - Missing: Alliance code/tag, AvA setup, role maintenance
   - Fix: server info premium display bug
   - Action: Consolidate into setup panel

5. **premium/** ⚠️ NEEDS FIXES
   - Fix: LIFETIME tier display bug
   - Add: AI credits display
   - Current state unknown, needs review

6. **ava/** ⚠️ NEEDS EXPANSION
   - Prepare for cross-server challenges
   - Add alliance code matching
   - Add logo uploads
   - Status unknown, needs review

7. **player/** ⚠️ NEEDS EXPANSION
   - Add profile subcommand
   - Track activity
   - Show moderation history (admin only)
   - Show probation status

8. **help/** ⚠️ NEEDS UPDATE
   - Remove references to deleted commands
   - Add new command documentation
   - Update AvA help

### Commands to ADD

New command groups needed:

1. **/mod** - Moderation system
   - warn, mute, timeout, ban, unban, probation
   - case, cases, revoke, appeal, settings

2. **/automod** - Auto-moderation
   - rules, review, settings
   - banned words/phrases

---

## 📊 DATABASE SCHEMA ANALYSIS

### Current Schema (Partial)

From `prisma/schema.prisma`:

**Guild Model:**

```prisma
model Guild {
  id                String    @id
  defaultGame       String?
  timezone          String    @default("UTC")
  allianceName      String?
  allianceLogo      String?
  themeColor        String    @default("#1a7a9e")
  scoreboardChan    String?
  adminLogChan      String?
  premiumNoticeChan String?
  battleSignupChan  String?
  language          String    @default("en")
  customFooter      String?
  scoreboardManagerRoleId String?
  disAdminRoleId    String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

**GuildPremium Model:**

```prisma
model GuildPremium {
  id            String    @id @default(cuid())
  guildId       String    @unique
  tier          Tier      @default(FREE)
  method        PremiumMethod
  stripeSubId   String?
  code          String?
  expiresAt     DateTime?
  grantedBy     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum Tier {
  FREE
  PRO
  ELITE
  LIFETIME
}
```

### Required Schema Changes

**1. Add to Guild Model:**

```prisma
allianceCode              String?   @unique  // 1-6 chars, A-Z0-9
avaCategoryId             String?
avaRequestChannelId       String?
avaChatChannelId          String?
avaAlertRoleId            String?
discoreManagerRoleId      String?
discoreAvaRoleId          String?
discoreAppealRoleId       String?
discoreMutedRoleId        String?
maintainRolesAndChannels  Boolean   @default(true)
logChannelId              String?   // Replaces adminLogChan
```

**2. New Models Needed:**

**UserActivity:**

```prisma
model UserActivity {
  id                    String   @id @default(cuid())
  guildId               String
  userId                String
  lastMessageAt         DateTime?
  lastReactionAt        DateTime?
  lastInteractionAt     DateTime?
  lastActiveAt          DateTime?
  activeDayStreak       Int      @default(0)
  lastActiveDate        DateTime?
  mostActiveChannelId   String?
  mostUsedReaction      String?
  updatedAt             DateTime @updatedAt

  @@unique([guildId, userId])
  @@index([guildId, userId])
  @@index([lastActiveAt])
}
```

**ModerationCase:**

```prisma
model ModerationCase {
  id              String    @id @default(cuid())
  publicId        String    @unique  // MOD-xxxxx
  guildId         String
  userId          String
  moderatorId     String
  actionType      ModActionType
  reason          String
  durationSeconds Int?
  expiresAt       DateTime?
  status          CaseStatus @default(ACTIVE)
  appealStatus    AppealStatus?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  revokedAt       DateTime?
  revokedBy       String?

  appeals         Appeal[]
  roleSnapshot    UserRoleSnapshot?

  @@index([guildId])
  @@index([userId])
  @@index([status])
  @@index([expiresAt])
}

enum ModActionType {
  WARN
  MUTE
  TIMEOUT
  BAN
  PROBATION
}

enum CaseStatus {
  ACTIVE
  EXPIRED
  REVOKED
  APPEALED
}

enum AppealStatus {
  PENDING
  ACCEPTED
  REJECTED
}
```

**Appeal:**

```prisma
model Appeal {
  id          String    @id @default(cuid())
  publicId    String    @unique  // APL-xxxxx
  caseId      String
  case        ModerationCase @relation(fields: [caseId], references: [id])
  guildId     String
  userId      String
  appealText  String    @db.Text
  status      AppealStatus @default(PENDING)
  channelId   String?
  createdAt   DateTime  @default(now())
  closedAt    DateTime?
  closedBy    String?
  outcome     String?   @db.Text

  @@index([caseId])
  @@index([guildId])
  @@index([status])
}
```

**UserRoleSnapshot:**

```prisma
model UserRoleSnapshot {
  id           String    @id @default(cuid())
  guildId      String
  userId       String
  caseId       String    @unique
  case         ModerationCase @relation(fields: [caseId], references: [id])
  roleIds      String[]  // Array of role IDs
  createdAt    DateTime  @default(now())
  cleanupAfter DateTime?

  @@index([caseId])
  @@index([cleanupAfter])
}
```

**AutoModRule:**

```prisma
model AutoModRule {
  id         String    @id @default(cuid())
  guildId    String
  phrase     String
  matchType  MatchType @default(CONTAINS)
  action     AutoModAction @default(REVIEW)
  enabled    Boolean   @default(true)
  createdBy  String
  createdAt  DateTime  @default(now())

  cases      AutoModCase[]

  @@index([guildId])
  @@index([enabled])
}

enum MatchType {
  EXACT
  CONTAINS
  STARTS_WITH
  REGEX
}

enum AutoModAction {
  DELETE
  REVIEW
  MUTE
  TIMEOUT
}
```

**AutoModCase:**

```prisma
model AutoModCase {
  id              String    @id @default(cuid())
  publicId        String    @unique  // AMC-xxxxx
  guildId         String
  userId          String
  channelId       String
  messageId       String?
  ruleId          String
  rule            AutoModRule @relation(fields: [ruleId], references: [id])
  messageExcerpt  String    @db.Text
  actionTaken     AutoModAction
  status          ReviewStatus @default(PENDING)
  reviewMessageId String?
  cleanupAfter    DateTime?
  createdAt       DateTime  @default(now())
  reviewedAt      DateTime?
  reviewedBy      String?

  @@index([guildId])
  @@index([status])
  @@index([cleanupAfter])
}

enum ReviewStatus {
  PENDING
  APPROVED
  DENIED
}
```

**AiUsage:**

```prisma
model AiUsage {
  id         String    @id @default(cuid())
  guildId    String
  userId     String
  month      String    // YYYY-MM
  creditsUsed Int      @default(0)
  requestCount Int     @default(0)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@unique([guildId, month])
  @@index([guildId, month])
}
```

---

## ⚠️ IDENTIFIED ISSUES

### Critical Bugs

1. **battle/battle.js** - Duplicate `module.exports` (line 11 and 29)
   - File has syntax error
   - Command already disabled
   - **Risk:** Will cause deploy errors

2. **Server Info Premium Display**
   - LIFETIME tier not showing correctly
   - `/server info` doesn't match `/premium status`
   - **Risk:** User confusion

3. **AI Not Premium Locked**
   - `/ask` doesn't check credits before Gemini call
   - Free servers can use unlimited AI
   - **Risk:** API cost overrun

### Missing Features

1. **Alliance Code System**
   - No database field
   - No validation
   - Required for cross-server AvA

2. **Moderation System**
   - No moderation commands
   - No case tracking
   - No appeal system

3. **Auto-Moderation**
   - No automod rules
   - No review system

4. **Player Profiles**
   - No activity tracking
   - No profile display

5. **Role/Channel Maintenance**
   - No automated checks
   - No repair functionality

6. **Image Uploads**
   - Scoreboard only accepts URLs
   - AvA has no logo upload
   - Server branding only accepts URLs

---

## 📋 MIGRATION PLAN

### Phase 1: Safety & Cleanup (Low Risk)

1. ✅ Remove broken battle command file
2. ✅ Disable game command
3. ✅ Disable match command
4. ✅ Update help command

### Phase 2: Schema Changes (Medium Risk)

**IMPORTANT:** These require database migrations

1. Add alliance code to Guild
2. Add AvA fields to Guild
3. Add role ID fields to Guild
4. Create UserActivity table
5. Create ModerationCase table
6. Create Appeal table
7. Create UserRoleSnapshot table
8. Create AutoModRule table
9. Create AutoModCase table
10. Create AiUsage table

**Migration Strategy:**

- Non-destructive additions only
- No data loss
- Backward compatible
- Can be rolled back

### Phase 3: Server Command Refactor (Medium Risk)

1. Consolidate server setup into management panel
2. Add alliance code setup
3. Add AvA channel setup
4. Add role maintenance toggle
5. Fix server info premium display

### Phase 4: Premium Fixes (Low Risk)

1. Fix LIFETIME display in server info
2. Add AI credits to premium status
3. Add monthly usage tracking

### Phase 5: AI Premium Lock (Medium Risk)

1. Check tier before Gemini call
2. Check credits before Gemini call
3. Deduct credits after response
4. Track monthly usage

### Phase 6: New Features (High Risk)

1. Add /mod command group
2. Add /automod command group
3. Add /player profile
4. Add activity tracking
5. Add role maintenance job
6. Add appeal system
7. Add image upload support

---

## 🚨 RISKS & WARNINGS

### High Risk Changes

1. **Database Migrations**
   - Risk: Schema changes could break existing queries
   - Mitigation: Test thoroughly, have rollback plan

2. **AI Premium Lock**
   - Risk: Could break existing AI usage
   - Mitigation: Test with different tiers

3. **Server Command Refactor**
   - Risk: Could break existing server setup
   - Mitigation: Keep backward compatibility

### Destructive Changes

**NONE PLANNED** - All changes are additive

### Dependencies to Check

1. `modules/gameData/service` - Used by game command (being removed)
2. `modules/gameFinder/service` - Used by match command (being removed)
3. `modules/serverSettings/service` - Used by server command (being refactored)
4. `lib/premiumGate` - Needs updates for AI locking

---

## 📦 FILES TO CREATE

### Commands

1. `src/commands/public/mod/mod.js`
2. `src/commands/public/automod/automod.js`

### Services

3. `src/modules/moderation/service.js`
4. `src/modules/moderation/caseManager.js`
5. `src/modules/moderation/appealManager.js`
6. `src/modules/automod/service.js`
7. `src/modules/automod/ruleEngine.js`
8. `src/modules/activity/tracker.js`
9. `src/modules/maintenance/roleChannelChecker.js`

### Jobs

10. `src/jobs/moderationExpiry.js`
11. `src/jobs/automodCleanup.js`
12. `src/jobs/roleChannelMaintenance.js`

### Utilities

13. `src/lib/imageUpload.js` (for attachment handling)
14. `src/lib/publicIdGenerator.js` (for MOD-xxxxx, APL-xxxxx, etc.)

---

## 📦 FILES TO MODIFY

### High Priority

1. `src/commands/public/server/server.js` - Major refactor
2. `src/commands/public/premium/premium.js` - Fix display
3. `src/commands/public/ask/ask.js` - Add premium lock
4. `src/commands/public/scoreboard/scoreboard.js` - Add image upload
5. `src/commands/public/help/help.js` - Update documentation
6. `src/commands/public/ava/ava.js` - Add features
7. `src/commands/public/player/player.js` - Add profile
8. `prisma/schema.prisma` - Add all new models

### Medium Priority

9. `src/lib/premiumGate.js` - Update for AI credits
10. `src/lib/embedBuilder.js` - Fix premium display
11. `src/modules/ai/service.js` - Add credit tracking
12. `src/events/messageCreate.js` - Add activity tracking
13. `src/events/interactionCreate.js` - Add activity tracking

---

## 📦 FILES TO DELETE

1. `src/commands/public/battle/battle.js` - Broken, replaced by events
2. `src/commands/public/game/game.js` - Not ready, remove
3. `src/commands/public/match/match.js` - Not ready, remove
4. `src/commands/public/strategy/strategy.js` - Optional, already disabled

**Dependencies Check:**

- Ensure no other files reference these
- Check components for old buttons

---

## 🧪 TESTING REQUIREMENTS

### Must Test After Changes

1. ✅ Bot boots successfully
2. ✅ Commands deploy without errors
3. ✅ Removed commands don't appear in Discord
4. ✅ /ask works and checks premium
5. ✅ /event create type:battle works
6. ✅ /server setup works
7. ✅ /server info shows LIFETIME correctly
8. ✅ /premium status shows LIFETIME correctly
9. ✅ Moderation commands work
10. ✅ Appeals work
11. ✅ Automod works
12. ✅ Player profile works
13. ✅ Image uploads work
14. ✅ No critical runtime errors

---

## 💰 ESTIMATED EFFORT

### Time Estimates

- Phase 1 (Cleanup): 1-2 hours
- Phase 2 (Schema): 2-3 hours
- Phase 3 (Server Refactor): 3-4 hours
- Phase 4 (Premium Fixes): 1-2 hours
- Phase 5 (AI Lock): 2-3 hours
- Phase 6 (New Features): 8-12 hours

**Total:** 17-26 hours of development

**Recommendation:** Implement in phases, test between each phase

---

## ⚡ RECOMMENDED APPROACH

### Option A: Full Implementation (All at Once)

- **Pros:** Complete solution
- **Cons:** High risk, long development time
- **Recommendation:** Only if you have 1-2 full days

### Option B: Phased Rollout (Recommended)

1. Start with cleanup & fixes (Phases 1-5)
2. Test thoroughly
3. Deploy to production
4. Then add new features (Phase 6) iteratively

### Option C: Critical Fixes Only

1. Fix battle command bug
2. Fix premium display
3. Add AI premium lock
4. Deploy remaining features later

**My Recommendation: Option B - Phased Rollout**

---

## 🎯 IMMEDIATE NEXT STEPS

1. **Review this report** - Confirm approach
2. **Choose implementation option** - A, B, or C?
3. **Backup database** - Before any migrations
4. **Create git branch** - For cleanup work
5. **Begin Phase 1** - If approved

---

## ❓ QUESTIONS FOR JAMES

Before proceeding, please confirm:

1. ✅ Approve removal of battle/game/match commands?
2. ✅ Approve database schema changes (migrations needed)?
3. ✅ Which implementation option: A, B, or C?
4. ✅ Priority order if phased rollout?
5. ✅ Any features to skip or delay?
6. ✅ Any additional requirements?

---

**Status:** Awaiting approval before making ANY code changes
**Risk Level:** Medium-High (database migrations required)
**Estimated Completion:** 2-26 hours depending on scope
