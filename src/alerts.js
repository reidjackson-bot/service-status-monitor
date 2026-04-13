// Alert manager
// - Tracks previous state per endpoint
// - Only fires alerts on transitions (up→down, down→up, up→degraded, etc.)
// - Sends Slack incoming webhook messages
// - Falls back to email via Gmail if Slack fails
// - Buffers: requires 2 consecutive failures before alerting down (avoids flapping)

import nodemailer from "nodemailer";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const CONFIRM_COUNT = 2; // consecutive checks before alerting a transition

// In-memory state
const previousStatus = new Map(); // endpointId → { status, count }
const incidentLog = []; // last 100 incidents

// Gmail transporter (lazy init)
let mailTransporter = null;
function getMailTransporter() {
  if (!mailTransporter && GMAIL_USER && GMAIL_APP_PASSWORD) {
    mailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }
  return mailTransporter;
}

function getStatusEmoji(status) {
  switch (status) {
    case "up": return "🟢";
    case "degraded": return "🟡";
    case "down": return "🔴";
    default: return "⚪";
  }
}

function formatSlackMessage(transition) {
  const emoji = getStatusEmoji(transition.newStatus);
  const direction = transition.newStatus === "up" ? "recovered" : transition.newStatus === "down" ? "went down" : "is degraded";
  const duration = transition.downSince
    ? ` (was down for ${formatDuration(transition.downSince)})`
    : "";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${transition.serviceName}* — \`${transition.endpointLabel}\` ${direction}${duration}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: [
            `*Host:* ${transition.host}`,
            transition.httpStatus ? `*HTTP:* ${transition.httpStatus}` : null,
            transition.latency != null ? `*Latency:* ${transition.latency}ms` : null,
            transition.error ? `*Error:* ${transition.error}` : null,
          ]
            .filter(Boolean)
            .join("  |  "),
        },
      ],
    },
  ];

  return { blocks };
}

function formatEmailSubject(transition) {
  const emoji = getStatusEmoji(transition.newStatus);
  const direction = transition.newStatus === "up" ? "recovered" : transition.newStatus === "down" ? "DOWN" : "DEGRADED";
  return `${emoji} ${transition.serviceName} — ${direction}`;
}

function formatEmailBody(transition) {
  const direction = transition.newStatus === "up" ? "recovered" : transition.newStatus === "down" ? "went down" : "is degraded";
  const duration = transition.downSince
    ? ` (was down for ${formatDuration(transition.downSince)})`
    : "";

  const details = [
    `Service: ${transition.serviceName}`,
    `Endpoint: ${transition.endpointLabel}`,
    `Status: ${transition.newStatus.toUpperCase()}${duration}`,
    `Host: ${transition.host}`,
    transition.httpStatus ? `HTTP Status: ${transition.httpStatus}` : null,
    transition.latency != null ? `Latency: ${transition.latency}ms` : null,
    transition.error ? `Error: ${transition.error}` : null,
    `Time: ${transition.timestamp}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `${transition.serviceName} — ${transition.endpointLabel} ${direction}${duration}\n\n${details}`;
}

function formatDuration(since) {
  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

async function sendSlackAlert(payload) {
  if (!SLACK_WEBHOOK_URL) {
    console.log("[alerts] No SLACK_WEBHOOK_URL configured, skipping Slack");
    return false;
  }

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[alerts] Slack webhook failed: ${res.status} ${res.statusText}`);
      return false;
    }

    console.log("[alerts] Slack alert sent successfully");
    return true;
  } catch (err) {
    console.error("[alerts] Slack webhook error:", err.message);
    return false;
  }
}

async function sendEmailAlert(transition) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.log("[alerts] No Gmail credentials configured, skipping email");
    return false;
  }

  try {
    await transporter.sendMail({
      from: `Service Monitor <${GMAIL_USER}>`,
      to: GMAIL_USER,
      subject: formatEmailSubject(transition),
      text: formatEmailBody(transition),
    });

    console.log("[alerts] Email alert sent successfully");
    return true;
  } catch (err) {
    console.error("[alerts] Email alert error:", err.message);
    return false;
  }
}

async function sendAlert(transition) {
  // Try Slack first
  const slackPayload = formatSlackMessage(transition);
  const slackOk = await sendSlackAlert(slackPayload);

  // If Slack failed, fall back to email
  if (!slackOk) {
    console.log("[alerts] Slack failed, falling back to email");
    await sendEmailAlert(transition);
  }
}

export async function processResults(serviceResults) {
  const transitions = [];

  for (const svc of serviceResults) {
    for (const ep of svc.endpoints) {
      const key = ep.endpointId;
      const prev = previousStatus.get(key);
      const current = ep.status;

      if (!prev) {
        // First check — set baseline, no alert
        previousStatus.set(key, { status: current, count: 1, since: ep.checkedAt });
        continue;
      }

      if (prev.status === current) {
        // Same status — reset count
        prev.count = Math.min(prev.count + 1, 100);
        prev.transitionCount = 0;
        prev.transitionTo = null;
        continue;
      }

      // Status changed — increment transition count
      if (!prev.transitionCount || prev.transitionTo !== current) {
        prev.transitionCount = 1;
        prev.transitionTo = current;
        prev.transitionStarted = ep.checkedAt;
        continue; // Wait for confirmation
      }

      prev.transitionCount++;

      if (prev.transitionCount >= CONFIRM_COUNT) {
        // Confirmed transition
        const transition = {
          endpointId: ep.endpointId,
          endpointLabel: ep.label,
          serviceName: svc.name,
          host: svc.host,
          previousStatus: prev.status,
          newStatus: current,
          httpStatus: ep.httpStatus,
          latency: ep.latency,
          error: ep.error,
          downSince: prev.status !== "up" ? prev.since : null,
          timestamp: ep.checkedAt,
        };

        transitions.push(transition);

        // Log incident
        incidentLog.unshift(transition);
        if (incidentLog.length > 100) incidentLog.pop();

        // Update stored state
        previousStatus.set(key, {
          status: current,
          count: 1,
          since: ep.checkedAt,
          transitionCount: 0,
          transitionTo: null,
        });

        // Send alert (Slack first, email fallback)
        await sendAlert(transition);
      }
    }
  }

  return transitions;
}

export function getIncidentLog() {
  return incidentLog;
}

export function getCurrentStates() {
  const states = {};
  for (const [key, val] of previousStatus) {
    states[key] = { status: val.status, since: val.since };
  }
  return states;
}
