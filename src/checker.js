// Health checker — pings each endpoint with proper HTTP GET
// Returns status (up/down/degraded), HTTP status code, latency

const TIMEOUT_MS = 10000; // 10s timeout
const DEGRADED_THRESHOLD_MS = 3000; // >3s = degraded

export async function checkEndpoint(endpoint) {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpoint.url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "ServiceStatusMonitor/1.0",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);
    const latency = Math.round(performance.now() - start);
    const httpStatus = res.status;

    // Any 2xx or 3xx = up, 4xx could be "up but auth required" for MCP endpoints
    // 5xx = down
    let status;
    if (httpStatus >= 500) {
      status = "down";
    } else if (latency > DEGRADED_THRESHOLD_MS) {
      status = "degraded";
    } else {
      status = "up";
    }

    return {
      endpointId: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      status,
      httpStatus,
      latency,
      error: null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timeout);
    const latency = Math.round(performance.now() - start);

    return {
      endpointId: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      status: "down",
      httpStatus: null,
      latency,
      error: err.name === "AbortError" ? "Timeout" : err.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function checkService(service) {
  const results = await Promise.all(
    service.endpoints.map((ep) => checkEndpoint(ep))
  );

  // Overall service status: worst of its endpoints
  let overallStatus = "up";
  for (const r of results) {
    if (r.status === "down") {
      overallStatus = "down";
      break;
    }
    if (r.status === "degraded") {
      overallStatus = "degraded";
    }
  }

  return {
    serviceId: service.id,
    name: service.name,
    host: service.host,
    type: service.type,
    status: overallStatus,
    endpoints: results,
    checkedAt: new Date().toISOString(),
  };
}
