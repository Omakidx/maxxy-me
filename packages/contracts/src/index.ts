export * from "./host-protocol";
export * from "./schemas";
export * from "./statuses";

export const protocolVersion = 1;

export type ServiceName = "web" | "worker" | "host-agent" | "migrate";
