import { handleApi } from "./api.js";

export default {
  async fetch(request, env) {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;
    const url = new URL(request.url);
    const pathname = url.pathname === "/" || !url.pathname.includes(".") ? "/index.html" : url.pathname;
    const response = await env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
