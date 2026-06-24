export function createRequestTelemetry(request, user, accountId) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  return {
    requestId,
    finish(response) {
      const durationMs = Date.now() - startedAt;
      response.headers.set("x-request-id", requestId);
      response.headers.set("server-timing", `app;dur=${durationMs}`);
      response.headers.set("x-response-time-ms", String(durationMs));
      logRequest({ requestId, durationMs, method: request.method, path: url.pathname, status: response.status, accountId, userId: user?.id });
    }
  };
}

function logRequest(entry) {
  console.log(JSON.stringify({
    type: "api_request",
    requestId: entry.requestId,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    durationMs: entry.durationMs,
    accountId: entry.accountId,
    userId: entry.userId,
    at: new Date().toISOString()
  }));
}
