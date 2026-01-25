export type RouteType = "REST" | "ABLY";

export interface RouteConfig {
  type: RouteType;
  targetUrl?: string;
  authKeyEnvName?: string;
  channelName?: string;
  table_name?: string;
}

export const DA_SERVICE_MAP: Record<string, RouteConfig> = {
  "v99/demorest": {
    type: "REST",
    targetUrl: "https://v1-users-api.example.com",
    authKeyEnvName: "REST_API_BEARER_TOKEN",
  },

  "v88/demoably": {
    type: "ABLY",
    authKeyEnvName: "ABLY_API_KEY",
    channelName: "system_bus_v1",
  },
};
