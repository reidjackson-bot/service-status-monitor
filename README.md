# Service Status Monitor

Health check monitor for MCP servers and web apps with Slack alerts on status transitions.

## What it does

- Pings 7 services every 5 minutes with proper HTTP GET requests
- Tracks status: **up** / **degraded** (>3s) / **down** (timeout/5xx)
- Only alerts on **confirmed transitions** (requires 2 consecutive checks to confirm — avoids flapping)
- Sends formatted Slack messages via incoming webhook
- Exposes JSON API for dashboard consumption

## Services monitored

| Service | Host | Type |
|---------|------|------|
| Tee Time Sniper (app + /mcp) | Railway | App + MCP |
| Sandbagger | Railway | App |
| BTP Match Play | Vercel | App |
| GEO-SEO MCP | Railway | MCP |
| Whoop MCP | Railway | MCP |
| Monarch MCP | Render | MCP |
| Renaissance Golf MCP | Railway | MCP |

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Full status payload with all endpoint details |
| `/status/summary` | GET | Quick overview — service names + status |
| `/incidents` | GET | Recent alert log + current states |
| `/health` | GET | This service's own health |
| `/check` | POST | Manually trigger a check run |
| `/` | GET | API directory |

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `SLACK_WEBHOOK_URL` | Yes | — | Slack incoming webhook URL for alerts |
| `CHECK_INTERVAL` | No | `*/5 * * * *` | Cron expression for check frequency |

## Setup

### 1. Create Slack webhook

1. Go to https://api.slack.com/apps
2. Create new app → From scratch
3. Add **Incoming Webhooks** feature
4. Activate and click **Add New Webhook to Workspace**
5. Choose your DM channel (or a #status channel)
6. Copy the webhook URL

### 2. Deploy to Railway

1. Create repo `service-status-monitor` on GitHub
2. Push this code
3. Connect to Railway, add env var:
   - `SLACK_WEBHOOK_URL` = your webhook URL
4. Deploy

### 3. Connect dashboard

Update the React status dashboard to fetch from:
```
https://your-railway-url.up.railway.app/status
```

## Adding new services

Edit `src/services.js` — add a new entry with endpoints to monitor.
