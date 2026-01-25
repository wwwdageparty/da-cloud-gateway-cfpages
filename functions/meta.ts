import { jsonResponse, C_SERVICE, C_VERSION } from "./_shared";

export async function onRequestGet({ env }: any) {
  const instance = env.INSTANCEID?.trim() || "default";

  return jsonResponse({
    service: C_SERVICE,
    version: C_VERSION,
    instance,
  });
}
