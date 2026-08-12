import {
  C_GATEWAY_TOKEN_NAME,
  nack,
  findRouteFromDB,
  timingSafeCheck,
} from "./_shared";
import { DA_SERVICE_MAP } from "./router";

interface EventContext<Env, P extends string, Data> {
  request: Request;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
  next: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<any>) => void;
}

export const onRequestPost = async (context: EventContext<Record<string, any>, any, any>): Promise<Response> => {
  const { request, env } = context;

  // 1. Authorization Check
  const expectedToken = env[C_GATEWAY_TOKEN_NAME];

  if (expectedToken) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return nack("unknown", "UNAUTHORIZED", "Missing or invalid Authorization header", 401);
    }

    const token = authHeader.slice(7);

    if (!token || !(await timingSafeCheck(token, expectedToken))) {
      return nack("unknown", "INVALID_TOKEN", "Token verification failed", 401);
    }
  }

  // 2. Extract Routing Parameters (Service & Version ONLY)
  const service = request.headers.get("X-DA-Service");
  const version = request.headers.get("X-DA-Version") || "v1";

  if (!service) {
    return nack("unknown", "INVALID_FIELD", "Missing required header: X-DA-Service", 400);
  }

  // 3. Dynamic Route Lookup (Shared with api.ts architecture)
  const key = `${version}/${service}`;
  const route = DA_SERVICE_MAP[key] || (await findRouteFromDB(env, key));

  if (!route || !route.url) {
    return nack("unknown", "NO_ROUTE", `No route found for ${key}`, 404);
  }

  // 4. Forward Downstream (Pass-through headers & body)
  const downstreamHeaders = new Headers(request.headers);
  if (expectedToken) {
    downstreamHeaders.set("X-DA-Gateway-Secret", expectedToken);
  }

  try {
    const downstreamResponse = await fetch(route.url, {
      method: "POST",
      headers: downstreamHeaders,
      body: request.body,
      // @ts-ignore
      duplex: "half",
    });

    // 5. Zero-Copy Stream Return
    return new Response(downstreamResponse.body, {
      status: downstreamResponse.status,
      statusText: downstreamResponse.statusText,
      headers: downstreamResponse.headers,
    });
  } catch (error: any) {
    return nack("unknown", "GATEWAY_ERROR", `Raw proxy failed: ${error.message || String(error)}`, 502);
  }
};
