const fs = require("fs"),
  c = require("child_process");
c.execSync("git checkout -- src/commands/public/server/server.js", {
  stdio: "ignore",
});
let s = fs.readFileSync("src/commands/public/server/server.js", "utf8");
const lines = s.split("\n"),
  out = [];
let inserted = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  out.push(l);
  if (inserted === 0 && l.includes('.setName("discore_announcements")')) {
    i++;
    out.push(lines[i]); // .setDescription
    i++;
    out.push(lines[i]); // .addChannelTypes
    i++;
    out.push(lines[i]); // ),
    out.push("        .addChannelOption((o) =>");
    out.push("          o");
    out.push('            .setName("ai_welcome")');
    out.push(
      '            .setDescription("AI Welcome channel for new members")',
    );
    out.push("            .addChannelTypes(ChannelType.GuildText),");
    out.push("        ),");
    inserted = 1;
    continue;
  }
  if (
    inserted === 1 &&
    l.includes('const avaChat = getChannelId(interaction, "ava_chat");')
  ) {
    out.push(
      '        const aiWelcome = getChannelId(interaction, "ai_welcome");',
    );
    inserted = 2;
    continue;
  }
  if (
    inserted === 2 &&
    l.includes("if (avaChat) data.avaChatChannelId = avaChat;")
  ) {
    out.push("        if (aiWelcome) data.aiWelcomeChannelId = aiWelcome;");
    inserted = 3;
    continue;
  }
}
const result = out.join("\n");
fs.writeFileSync("src/commands/public/server/server.js", result);
console.log(
  result.includes("ai_welcome") && result.includes("aiWelcomeChannelId")
    ? "OK"
    : "FAIL",
);
