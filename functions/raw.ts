import {
  C_GATEWAY_TOKEN_NAME,
  timingSafeCheck,
} from "./_shared";

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

  // 1. Authorization Check (Uses shared token name key from _shared)
  const expectedToken = env[C_GATEWAY_TOKEN_NAME];

  if (expectedToken) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing or invalid token" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.slice(7);

    if (!token || !(await timingSafeCheck(token, expectedToken))) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Token verification failed" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // 2. Extract Routing Headers
  const service = request.headers.get("X-DA-Service");
  const version = request.headers.get("X-DA-Version") || "v1";
  const action = request.headers.get("X-DA-Action");     // "upload" | "download"
  const fileKey = request.headers.get("X-DA-File-Key");   // File path in bucket

  if (!service || !action || !fileKey) {
    return new Response(
      JSON.stringify({
        error: "Bad Request: Missing required headers (X-DA-Service, X-DA-Action, X-DA-File-Key)",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 3. Resolve Target Downstream Worker
  const targetUrl = new URL(`https://${service}-rack.internal/raw`);
  targetUrl.searchParams.set("version", version);
  targetUrl.searchParams.set("action", action);
  targetUrl.searchParams.set("key", fileKey);

  // 4. Prepare Headers for Downstream Request
  const downstreamHeaders = new Headers(request.headers);
  
  if (expectedToken) {
    downstreamHeaders.set("X-DA-Gateway-Secret", expectedToken);
  }

  try {
    // 5. Proxy Stream (Zero-Copy Pass-Through)
    const downstreamResponse = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: downstreamHeaders,
      body: request.body,
      // @ts-ignore - duplex: 'half' is required by modern fetch implementations for streaming request bodies
      duplex: "half", 
    });

    // 6. Return Downstream Response directly
    return new Response(downstreamResponse.body, {
      status: downstreamResponse.status,
      statusText: downstreamResponse.statusText,
      headers: downstreamResponse.headers,
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: "Gateway Raw Proxy Error",
        details: error.message || String(error),
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
