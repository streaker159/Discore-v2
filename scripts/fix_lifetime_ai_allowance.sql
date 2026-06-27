UPDATE "GuildPremium"
SET "monthlyAiAllowance" = 5000,
    "monthlyAiUsed" = 0,
    "monthlyAiPeriodStart" = NOW(),
    "monthlyAiPeriodEnd" = NOW() + INTERVAL '30 days'
WHERE "guildId" = '1366566263048110125';