import {
  C_GATEWAY_TOKEN_NAME,
  nack,
  findRouteFromDB,
  timingSafeCheck,
} from "./_shared";
import { DA_SERVICE_MAP } from "./router";

export const onRequestPost = async (context: any): Promise<Response> => {
  const { request, env } = context;

  // 1. Authorization
  const expectedToken = env[C_GATEWAY_TOKEN_NAME];
  if (expectedToken) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return nack("unknown", "UNAUTHORIZED", "Missing or invalid Authorization header");
    }
    const token = authHeader.slice(7);
    if (!token || !(await timingSafeCheck(token, expectedToken))) {
      return nack("unknown", "INVALID_TOKEN", "Token verification failed");
    }
  }

  // 2. Extract Service Header
  const service = request.headers.get("X-DA-Service");
  const version = request.headers.get("X-DA-Version") || "v1";

  if (!service) {
    return nack("unknown", "INVALID_FIELD", "Missing required header: X-DA-Service");
  }

  // 3. Resolve Target Route
  const key = `${version}/${service}`;
  const route = DA_SERVICE_MAP[key] || (await findRouteFromDB(env, key));

  if (!route || !route.targetUrl) {
    return nack("unknown", "NO_ROUTE", `No route found for ${key}`);
  }

  // 4. Downstream Headers Setup
  const downstreamHeaders = new Headers(request.headers);
  const routeToken = route.token || (route.authKeyEnvName ? env[route.authKeyEnvName] : null);
  
  if (routeToken) {
    downstreamHeaders.set("Authorization", `Bearer ${routeToken}`);
  }

  // 5. Proxy Stream Pass-Through
  try {
    const downstreamResponse = await fetch(route.targetUrl, {
      method: "POST",
      headers: downstreamHeaders,
      body: request.body,
      // @ts-ignore
      duplex: "half",
    });

    return new Response(downstreamResponse.body, {
      status: downstreamResponse.status,
      statusText: downstreamResponse.statusText,
      headers: downstreamResponse.headers,
    });
  } catch (error: any) {
    return nack("unknown", "GATEWAY_ERROR", `Raw proxy failed: ${error.message || String(error)}`);
  }
};
