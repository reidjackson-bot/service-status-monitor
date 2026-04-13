// All services and endpoints to monitor
// Each service can have a primary URL and optional MCP endpoint

const SERVICES = [
  {
    id: "sniper",
    name: "Tee Time Sniper",
    url: "https://renny-tee-sniper-production.up.railway.app",
    host: "Railway",
    type: "app",
    endpoints: [
      { id: "sniper-app", label: "App", url: "https://renny-tee-sniper-production.up.railway.app" },
      { id: "sniper-mcp", label: "MCP", url: "https://renny-tee-sniper-production.up.railway.app/mcp" },
    ],
  },
  {
    id: "sandbagger",
    name: "Sandbagger",
    url: "https://renny-sandbagger-production.up.railway.app",
    host: "Railway",
    type: "app",
    endpoints: [
      { id: "sandbagger-app", label: "App", url: "https://renny-sandbagger-production.up.railway.app" },
    ],
  },
  {
    id: "btp",
    name: "BTP Match Play",
    url: "https://btp-matchplay.vercel.app",
    host: "Vercel",
    type: "app",
    endpoints: [
      { id: "btp-app", label: "App", url: "https://btp-matchplay.vercel.app" },
    ],
  },
  {
    id: "geo-seo",
    name: "GEO-SEO MCP",
    url: "https://geo-seo-mcp-production.up.railway.app",
    host: "Railway",
    type: "mcp",
    endpoints: [
      { id: "geo-seo-mcp", label: "MCP (SSE)", url: "https://geo-seo-mcp-production.up.railway.app/sse" },
    ],
  },
  {
    id: "whoop",
    name: "Whoop MCP",
    url: "https://whoop-mcp-server-1-production.up.railway.app",
    host: "Railway",
    type: "mcp",
    endpoints: [
      { id: "whoop-mcp", label: "MCP", url: "https://whoop-mcp-server-1-production.up.railway.app/mcp" },
    ],
  },
  {
    id: "monarch",
    name: "Monarch MCP",
    url: "https://monarch-mcp-server-coqu.onrender.com",
    host: "Render",
    type: "mcp",
    endpoints: [
      { id: "monarch-mcp", label: "MCP", url: "https://monarch-mcp-server-coqu.onrender.com/mcp" },
    ],
  },
  {
    id: "renny-golf-mcp",
    name: "Renaissance Golf MCP",
    url: "https://renny-tee-sniper-production.up.railway.app/mcp",
    host: "Railway",
    type: "mcp",
    endpoints: [
      { id: "renny-golf-mcp", label: "MCP", url: "https://renny-tee-sniper-production.up.railway.app/mcp" },
    ],
  },
];

export default SERVICES;
