import express from "express";
import cron from "node-cron";
import SERVICES from "./services.js";
import { checkService } from "./checker.js";
import { processResults, getIncidentLog, getCurrentStates } from "./alerts.js";

const app = express();
const PORT = process.env.PORT || 3000;
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || "*/5 * * * *"; // every 5 min

// Store latest results
let latestResults = null;
let lastCheckTime = null;
let checkCount = 0;

// ─── Health checks ───────────────────────────────────────────────

async function runChecks() {
  const start = performance.now();
  console.log(`[monitor] Running health checks (run #${++checkCount})...`);

  try {
    const results = await Promise.all(SERVICES.map((svc) => checkService(svc)));
    const elapsed = Math.round(performance.now() - start);

    latestResults = results;
    lastCheckTime = new Date().toISOString();

    // Process for alerts (transition detection)
    const transitions = await processResults(results);

    // Summary log
    const upCount = results.filter((r) => r.status === "up").length;
    const downCount = results.filter((r) => r.status === "down").length;
    const degradedCount = results.filter((r) => r.status === "degraded").length;

    console.log(
      `[monitor] Check complete in ${elapsed}ms — ${upCount} up, ${degradedCount} degraded, ${downCount} down` +
        (transitions.length > 0
          ? ` — ${transitions.length} alert(s) fired`
          : "")
    );
  } catch (err) {
    console.error("[monitor] Check run failed:", err.message);
  }
}

// ─── API routes ──────────────────────────────────────────────────

// CORS for the React dashboard
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// GET /status — full status payload
app.get("/status", (req, res) => {
  if (!latestResults) {
    return res.json({
      status: "initializing",
      message: "First check has not completed yet",
      services: [],
    });
  }

  const overallUp = latestResults.every((r) => r.status === "up");
  const anyDown = latestResults.some((r) => r.status === "down");

  res.json({
    status: overallUp ? "operational" : anyDown ? "outage" : "degraded",
    lastChecked: lastCheckTime,
    checkCount,
    services: latestResults,
  });
});

// GET /status/summary — quick overview
app.get("/status/summary", (req, res) => {
  if (!latestResults) {
    return res.json({ status: "initializing" });
  }

  const summary = latestResults.map((svc) => ({
    name: svc.name,
    status: svc.status,
    host: svc.host,
  }));

  res.json({
    status: latestResults.every((r) => r.status === "up")
      ? "operational"
      : "issues",
    lastChecked: lastCheckTime,
    services: summary,
  });
});

// GET /incidents — recent alerts/transitions
app.get("/incidents", (req, res) => {
  res.json({
    incidents: getIncidentLog(),
    currentStates: getCurrentStates(),
  });
});

// GET /health — this service's own health
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    checkCount,
    lastChecked: lastCheckTime,
  });
});

// GET / — simple landing
app.get("/", (req, res) => {
  res.json({
    name: "Service Status Monitor",
    version: "1.0.0",
    endpoints: {
      status: "/status",
      summary: "/status/summary",
      incidents: "/incidents",
      health: "/health",
      trigger: "POST /check",
    },
  });
});

// POST /check — manually trigger a check
app.post("/check", async (req, res) => {
  await runChecks();
  res.json({ message: "Check completed", lastChecked: lastCheckTime });
});

// ─── Start ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[monitor] Service Status Monitor running on port ${PORT}`);
  console.log(`[monitor] Cron schedule: ${CHECK_INTERVAL}`);
  console.log(`[monitor] Monitoring ${SERVICES.length} services`);
  console.log(
    `[monitor] Slack alerts: ${process.env.SLACK_WEBHOOK_URL ? "enabled" : "NOT configured (set SLACK_WEBHOOK_URL)"}`
  );

  // Run first check async — don't block the server from responding to health checks
  setTimeout(() => runChecks(), 2000);

  // Schedule recurring checks
  cron.schedule(CHECK_INTERVAL, runChecks, {
    timezone: "America/New_York",
  });
});
