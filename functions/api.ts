import {
  C_GATEWAY_TOKEN_NAME,
  nack,
  handleRest,
  handleAbly,
  findRouteFromDB,
} from "./_shared";
import { DA_SERVICE_MAP } from "./router";

export async function onRequestPost(context: any) {
  const { request, env } = context;


  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return nack("unknown", "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  const token = auth.split(" ")[1];
  if (token !== env[C_GATEWAY_TOKEN_NAME]) {
    return nack("unknown", "INVALID_TOKEN", "Token authentication failed");
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return nack("unknown", "INVALID_JSON", "Malformed JSON body");
  }

  const requestId = body.request_id || "unknown";
  const version = body.version || "v1";
  const service = body.service;

  if (!service) return nack(requestId, "INVALID_FIELD", "Missing field: service");
  if (!body.payload) return nack(requestId, "INVALID_FIELD", "Missing field: payload");

  const key = `${version}/${service}`;
  let route = DA_SERVICE_MAP[key] || (await findRouteFromDB(env, key));

  if (!route) return nack(requestId, "NO_ROUTE", `No route found for ${key}`);

  if (route.table_name) {
    body.payload.table_name = route.table_name;
  }

  try {
    switch (route.type) {
      case "REST":
        return await handleRest(env, route, body);
      case "ABLY":
        return await handleAbly(env, route, body, requestId);
      default:
        return nack(requestId, 501, `Unsupported service type: ${route.type}`);
    }
  } catch (e: any) {
    console.error("Gateway error:", e);
    return nack(requestId, 500, "Gateway processing failed");
  }
}
