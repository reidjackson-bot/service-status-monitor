// Alert manager
// - Tracks previous state per endpoint
// - Only fires alerts on transitions (up→down, down→up, up→degraded, etc.)
// - Sends Slack incoming webhook messages
// - Buffers: requires 2 consecutive failures before alerting down (avoids flapping)

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const CONFIRM_COUNT = 2; // consecutive checks before alerting a transition

// In-memory state
const previousStatus = new Map(); // endpointId → { status, count }
const incidentLog = []; // last 100 incidents

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
    console.log("[alerts] No SLACK_WEBHOOK_URL configured, skipping alert");
    console.log("[alerts] Would have sent:", JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[alerts] Slack webhook failed: ${res.status} ${res.statusText}`);
    } else {
      console.log("[alerts] Slack alert sent successfully");
    }
  } catch (err) {
    console.error("[alerts] Slack webhook error:", err.message);
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
        continue;
      }

      // Status changed — increment transition count
      if (!prev.transitionCount) {
        prev.transitionCount = 1;
        prev.transitionTo = current;
        prev.transitionStarted = ep.checkedAt;
        continue; // Wait for confirmation
      }

      if (prev.transitionTo === current) {
        prev.transitionCount++;
      } else {
        // Changed to yet another status — reset
        prev.transitionCount = 1;
        prev.transitionTo = current;
        prev.transitionStarted = ep.checkedAt;
        continue;
      }

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

        // Send Slack alert
        const payload = formatSlackMessage(transition);
        await sendSlackAlert(payload);
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
