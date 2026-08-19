import type { HostToolInventory } from "@maxxy/contracts";
import type { HostAgentConfig, StoredHostConfig } from "./config";
import { collectToolInventory } from "./tools";

type EnrollmentResponse = {
  host: { id: string; name: string; status: string };
  hostToken: string;
};

export async function exchangeEnrollment(input: {
  serverUrl: string;
  enrollmentToken: string;
  config: HostAgentConfig;
  inventory?: HostToolInventory;
}): Promise<StoredHostConfig> {
  const url = new URL(input.serverUrl);
  url.pathname = "/api/hosts/exchange-enrollment";
  url.search = "";
  const inventory =
    input.inventory ?? (await collectToolInventory(input.config));
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      enrollmentToken: input.enrollmentToken,
      hostVersion: process.env.RELEASE_VERSION ?? "development",
      toolInventory: inventory,
    }),
  });

  const body = (await response.json()) as
    | EnrollmentResponse
    | { error?: unknown };
  if (!response.ok || !("host" in body) || !("hostToken" in body)) {
    throw new Error(`Host enrollment failed with HTTP ${response.status}`);
  }

  return {
    controlPlaneUrl: input.serverUrl,
    hostId: body.host.id,
    hostToken: body.hostToken,
    hostName: body.host.name,
  };
}
