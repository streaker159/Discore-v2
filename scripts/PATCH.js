const fs = require("fs");
let s = fs.readFileSync("src/commands/public/server/server.js", "utf8");
s = s.replace(
  'discore_announcements")\n            .setDescription("Official Discore update announcements channel")\n            .addChannelTypes(ChannelType.GuildText),\n        ),\n    ),\n\n  async execute',
  'discore_announcements")\n            .setDescription("Official Discore update announcements channel")\n            .addChannelTypes(ChannelType.GuildText),\n        )\n        .addChannelOption((o) =>\n          o\n            .setName("ai_welcome")\n            .setDescription("AI Welcome channel for new members")\n            .addChannelTypes(ChannelType.GuildText),\n        ),\n    ),\n\n  async execute',
);
s = s.replace(
  'const avaChat = getChannelId(interaction, "ava_chat");\n        const adminReports = getChannelId(interaction, "admin_reports");',
  'const avaChat = getChannelId(interaction, "ava_chat");\n        const aiWelcome = getChannelId(interaction, "ai_welcome");\n        const adminReports = getChannelId(interaction, "admin_reports");',
);
s = s.replace(
  "if (avaChat) data.avaChatChannelId = avaChat;\n        if (adminReports) data.adminReportsChannelId = adminReports;",
  "if (avaChat) data.avaChatChannelId = avaChat;\n        if (aiWelcome) data.aiWelcomeChannelId = aiWelcome;\n        if (adminReports) data.adminReportsChannelId = adminReports;",
);
fs.writeFileSync("src/commands/public/server/server.js", s);
const ok = s.includes("ai_welcome") && s.includes("aiWelcomeChannelId");
console.log(ok ? "OK" : "FAIL");
