"use strict";

const db = require("./onboardingDb");

/**
 * Generate an application receipt as TXT content.
 */
async function generateApplicationReceipt(applicationId) {
  try {
    const application = await db.getApplicationById(applicationId);
    if (!application) return null;

    const answers = await db.getAnswers(applicationId);
    const notes = await db.getStaffNotes(applicationId);
    const logs = await db.getDecisionLogs(applicationId);
    const appType = application.applicationTypeId
      ? await db.getApplicationType(application.applicationTypeId)
      : null;

    const appNum = String(application.applicationNumber || 0).padStart(4, "0");
    const filename = `application-${appNum}-receipt.txt`;

    const lines = [];

    lines.push("=".repeat(60));
    lines.push(`APPLICATION RECEIPT — #${appNum}`);
    lines.push("=".repeat(60));
    lines.push("");

    lines.push(`Guild ID: ${application.guildId}`);
    lines.push(`Application Number: ${appNum}`);
    lines.push(
      `Application Type: ${appType?.publicTitle || appType?.name || "Unknown"}`,
    );
    lines.push(`Status: ${application.status}`);
    lines.push("");

    lines.push("--- APPLICANT ---");
    lines.push(`User ID: ${application.applicantId}`);
    lines.push(
      `Username: ${application.applicantUsernameSnapshot || "Unknown"}`,
    );
    lines.push(
      `Display Name: ${application.applicantDisplayNameSnapshot || "Unknown"}`,
    );
    lines.push(`Server Status: ${application.serverMemberStatus}`);
    lines.push("");

    lines.push("--- DATES ---");
    lines.push(
      `Submitted: ${application.submittedAt ? new Date(application.submittedAt).toISOString() : "N/A"}`,
    );
    if (application.decidedAt) {
      lines.push(`Decided: ${new Date(application.decidedAt).toISOString()}`);
      lines.push(`Decided By: ${application.decidedById || "Unknown"}`);
      lines.push(`Decision Reason: ${application.decisionReason || "None"}`);
    }
    lines.push("");

    // Answers
    lines.push("--- ANSWERS ---");
    if (answers && answers.length) {
      for (const a of answers) {
        lines.push(`Q: ${a.fieldLabelSnapshot || "Question"}`);
        if (a.answerText) {
          lines.push(`A: ${a.answerText}`);
        }
        if (a.selectedOptionValues?.length) {
          lines.push(`Selected: ${a.selectedOptionValues.join(", ")}`);
        }
        if (a.selectedRoleIds?.length) {
          lines.push(`Roles: ${a.selectedRoleIds.join(", ")}`);
        }
        if (a.fileRefs) {
          try {
            const refs =
              typeof a.fileRefs === "string"
                ? JSON.parse(a.fileRefs)
                : a.fileRefs;
            if (Array.isArray(refs)) {
              for (const f of refs) {
                lines.push(`File: ${f?.name || "file"} — ${f?.url || "N/A"}`);
              }
            }
          } catch {}
        }
        lines.push("");
      }
    } else {
      lines.push("No answers recorded.");
      lines.push("");
    }

    // Staff Notes
    if (notes && notes.length) {
      lines.push("--- STAFF NOTES ---");
      for (const n of notes) {
        lines.push(`[${new Date(n.createdAt).toISOString()}] <@${n.authorId}>`);
        lines.push(`${n.noteText}`);
        lines.push("");
      }
    }

    // Decision History
    if (logs && logs.length) {
      lines.push("--- DECISION HISTORY ---");
      for (const l of logs) {
        lines.push(
          `[${new Date(l.createdAt).toISOString()}] ${l.action} by <@${l.actorId}>`,
        );
        if (l.reason) lines.push(`Reason: ${l.reason}`);
        lines.push("");
      }
    }

    lines.push("=".repeat(60));
    lines.push(`End of Application #${appNum} Receipt`);
    lines.push("Generated: " + new Date().toISOString());

    return {
      filename,
      content: lines.join("\n"),
    };
  } catch (e) {
    console.error("[Onboarding] generateApplicationReceipt failed", e);
    return null;
  }
}

/**
 * Generate a thread transcript as TXT content.
 */
async function generateThreadTranscript(
  applicationId,
  thread,
  closedBy,
  guild,
) {
  try {
    const application = await db.getApplicationById(applicationId);
    if (!application) return null;

    const appNum = String(application.applicationNumber || 0).padStart(4, "0");
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `application-${appNum}-thread-${dateStr}.txt`;

    const lines = [];
    lines.push("=".repeat(60));
    lines.push(`REVIEW THREAD TRANSCRIPT — Application #${appNum}`);
    lines.push("=".repeat(60));
    lines.push("");

    lines.push(`Server: ${guild?.name || "Unknown"}`);
    lines.push(`Server ID: ${application.guildId}`);
    lines.push(`Application Number: ${appNum}`);
    lines.push(
      `Application Type: ${application.applicationTypeId || "Unknown"}`,
    );
    lines.push(`Applicant ID: ${application.applicantId}`);
    lines.push(
      `Applicant: ${application.applicantDisplayNameSnapshot || "Unknown"}`,
    );
    lines.push(`Final Status: ${application.status}`);
    lines.push("");

    lines.push("--- THREAD INFO ---");
    lines.push(`Thread ID: ${thread.id}`);
    lines.push(`Thread Name: ${thread.name}`);
    lines.push(`Closed By: ${closedBy || "Unknown"}`);
    lines.push(`Closed At: ${new Date().toISOString()}`);
    lines.push("");

    // Fetch messages
    let messageCount = 0;
    try {
      const fetched = await thread.messages.fetch({ limit: 1000 });
      const sorted = [...fetched.values()].sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp,
      );

      lines.push("--- MESSAGES ---");
      for (const msg of sorted) {
        const ts = new Date(msg.createdTimestamp)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        const author = `${msg.author?.displayName || "Unknown"} (${msg.author?.id || "Unknown"})`;
        lines.push(`[${ts}] ${author}:`);
        if (msg.content) {
          lines.push(`${msg.content}`);
        }
        if (msg.attachments?.size) {
          for (const att of msg.attachments.values()) {
            lines.push(`[Attachment: ${att.name || "file"} — ${att.url}]`);
          }
        }
        if (msg.embeds?.length) {
          for (const embed of msg.embeds) {
            if (embed.title) lines.push(`[Embed: ${embed.title}]`);
            if (embed.description)
              lines.push(`[Embed Desc: ${embed.description.slice(0, 200)}]`);
          }
        }
        lines.push("");
        messageCount++;
      }
    } catch {}

    lines.push("=".repeat(60));
    lines.push(`End of Thread Transcript`);
    lines.push(`Messages: ${messageCount}`);
    lines.push("Generated: " + new Date().toISOString());

    const transcriptText = lines.join("\n");

    // Save to DB
    await db.saveTranscript({
      applicationId,
      guildId: application.guildId,
      threadId: thread.id,
      fileName: filename,
      contentType: "text/plain",
      transcriptText,
      messageCount,
      createdBy: closedBy || "system",
    });

    // Update application
    await db.updateApplication(applicationId, {
      reviewThreadStatus: "CLOSED",
      threadTranscriptCreatedAt: new Date(),
    });

    return {
      filename,
      content: transcriptText,
      messageCount,
    };
  } catch (e) {
    console.error("[Onboarding] generateThreadTranscript failed", e);
    return null;
  }
}

module.exports = {
  generateApplicationReceipt,
  generateThreadTranscript,
};
