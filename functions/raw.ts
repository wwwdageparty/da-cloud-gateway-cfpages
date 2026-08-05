interface EventContext<Env, P extends string, Data> {
  request: Request;
  env: Env;
  params: Record<P, string | string[]>;
  data: Data;
  next: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<any>) => void;
}

interface Env {
  // Add bindings or rack service bindings here if applicable
  // e.g., FILES_RACK: Fetcher;
  GATEWAY_SECRET?: string;
}

export const onRequestPost = async (context: EventContext<Env, any, any>): Promise<Response> => {
  const { request, env } = context;

  // 1. Authorization Check (Shared with /api)
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized: Missing or invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Extract Routing Headers
  const service = request.headers.get("X-DA-Service");
  const version = request.headers.get("X-DA-Version") || "v1";
  const action = request.headers.get("X-DA-Action");     // "upload" | "download"
  const fileKey = request.headers.get("X-DA-File-Key");   // File path in bucket

  // Validate required headers
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

  // 3. Resolve Target Downstream Worker / Service Binding URL
  // Construct internal rack URL or service binding target
  const targetUrl = new URL(`https://${service}-rack.internal/raw`);
  targetUrl.searchParams.set("version", version);
  targetUrl.searchParams.set("action", action);
  targetUrl.searchParams.set("key", fileKey);

  // 4. Prepare Headers for Downstream Request
  const downstreamHeaders = new Headers(request.headers);
  
  // Optional: Attach an internal service key if your racks verify Gateway authenticity
  if (env.GATEWAY_SECRET) {
    downstreamHeaders.set("X-DA-Gateway-Secret", env.GATEWAY_SECRET);
  }

  try {
    // 5. Proxy Stream (Zero-Copy Pass-Through)
    // Cloudflare Workers automatically stream `request.body` when passed as `body`
    const downstreamResponse = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: downstreamHeaders,
      body: request.body, // Pass-through ReadableStream directly
      // @ts-ignore - dupex: 'half' is required by modern fetch implementations for streaming request bodies
      duplex: "half", 
    });

    // 6. Return Downstream Response directly (Supports binary stream downloads)
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
