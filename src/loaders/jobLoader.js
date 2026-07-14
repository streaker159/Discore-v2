const path = require("path");
const { walkFiles } = require("./fileWalker");
const logger = require("../lib/logger");

function loadJobs(client) {
  if (process.env.DISABLE_JOBS === "true") {
    logger.warn("Jobs disabled via DISABLE_JOBS=true");
    return;
  }

  const jobsRoot = path.join(__dirname, "..", "jobs");
  const files = walkFiles(jobsRoot);

  for (const file of files) {
    const job = require(file);

    // Support new-style jobs with start function
    if (typeof job.startAutoPostScheduler === "function") {
      job.startAutoPostScheduler(client);
      logger.info("Started job", { name: "autoPostScheduler" });
      continue;
    }
    if (typeof job.startModerationExpiryJob === "function") {
      job.startModerationExpiryJob(client);
      logger.info("Started job", { name: "moderationExpiryJob" });
      continue;
    }
    if (typeof job.startSuggestionCleanupJob === "function") {
      job.startSuggestionCleanupJob(client);
      logger.info("Started job", { name: "suggestionCleanupJob" });
      continue;
    }

    // Support old-style jobs
    if (!job?.name || typeof job.run !== "function" || !job.intervalMs) {
      logger.warn("Skipped invalid job", { file });
      continue;
    }

    if (job.enabled === false) continue;
    setInterval(
      () =>
        job
          .run(client)
          .catch((error) =>
            logger.error(`Job failed: ${job.name}`, { error: error.message }),
          ),
      job.intervalMs,
    );
    logger.info("Started job", { name: job.name, intervalMs: job.intervalMs });
  }
}

module.exports = { loadJobs };
