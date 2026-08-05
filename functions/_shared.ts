import { DA_SERVICE_MAP } from './router.js';

// --- GLOBAL CONFIG ---
export const ABLY_PUBLISH_BASE_URL = "https://rest.ably.io/channels";
export const C_GATEWAY_TOKEN_NAME = "DA_GATEWAY_TOKEN";
export const C_SERVICE = "da-cloud-gateway-cfpages";
export const C_VERSION = "0.0.1";
export const C_RouteTableName = "darouter";

// ---------- UTILITIES ----------
export function jsonResponse(obj: any, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function ack(requestId: string, payload = {}) {
  return jsonResponse({ type: "ack", request_id: requestId, payload });
}

export function nack(requestId: string, code: any, message: string) {
  return jsonResponse(
    { type: "nack", request_id: requestId, payload: { status: "error", code, message } },
    400
  );
}

// ---------- HANDLERS ----------
export async function handleRest(env: any, route: any, bodyJson: any) {
  let routeToken = route.token || (route.authKeyEnvName ? env[route.authKeyEnvName] : null);

  const headers: any = { "Content-Type": "application/json" };
  if (routeToken) headers.Authorization = `Bearer ${routeToken}`;

  return fetch(route.targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyJson),
  });
}

export async function handleAbly(env: any, route: any, bodyJson: any, requestId: string) {
  let routeToken = route.token || (route.authKeyEnvName ? env[route.authKeyEnvName] : null);

  const channel = route.channelName;
  const publishEndpoint = `${ABLY_PUBLISH_BASE_URL}/${encodeURIComponent(channel)}/messages`;
  const ablyName = bodyJson.action || "gateway-event";

  const payload = JSON.stringify([{ name: ablyName, data: bodyJson }]);

  const res = await fetch(publishEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(routeToken)}`,
      "Content-Type": "application/json",
    },
    body: payload,
  });

  return res.ok
    ? ack(requestId, { status: "Accepted", channel })
    : nack(requestId, "ABLY_FAILED", await res.text());
}

// ---------- DB ----------
export async function findRouteFromDB(env: any, key: string) {
let db = env.DB;
  if (!db) return null;

  try {
    const query = `SELECT t1 FROM ${C_RouteTableName} WHERE c1 = ? LIMIT 1`;
    const { results } = await db.prepare(query).bind(key).all();

    if (!results?.length || !results[0].t1) return null;
    return JSON.parse(results[0].t1);
  } catch (e) {
    console.error("DB lookup failed:", e);
    return null;
  }
}
