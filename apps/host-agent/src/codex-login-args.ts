export function parseCodexLoginArgs(args: string[]) {
  const uuidPattern =
    "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const valueFlags = new Set([
    "--connection-id",
    "--auth-mode",
    "--capacity-source-id",
    "--expires-at",
  ]);
  const values = new Map<string, string>();
  let deviceAuth = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--credential-slot") {
      throw new Error(
        "--credential-slot is no longer accepted; credential isolation is automatic",
      );
    }
    if (argument === "--device-auth") {
      if (deviceAuth) {
        throw new Error("Duplicate argument: --device-auth");
      }
      deviceAuth = true;
      continue;
    }
    if (!argument || !valueFlags.has(argument)) {
      throw new Error(`Unknown codex-login argument: ${argument ?? ""}`);
    }
    if (values.has(argument)) {
      throw new Error(`Duplicate argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }

  const codexConnectionId = values.get("--connection-id");
  const authMode = values.get("--auth-mode");
  const capacitySourceId = values.get("--capacity-source-id");
  const expiresAt = values.get("--expires-at");
  if (
    !codexConnectionId ||
    !new RegExp(`^codexconn_${uuidPattern}$`, "i").test(codexConnectionId)
  ) {
    throw new Error("--connection-id must be a generated codexconn UUID");
  }
  if (authMode !== "chatgpt" && authMode !== "api_key") {
    throw new Error("--auth-mode must be chatgpt or api_key");
  }
  if (
    !capacitySourceId ||
    !new RegExp(`^capsrc_${uuidPattern}$`, "i").test(capacitySourceId)
  ) {
    throw new Error("--capacity-source-id must be a generated capsrc UUID");
  }
  if (!expiresAt) {
    throw new Error("Missing required argument: --expires-at");
  }
  if (authMode === "api_key" && deviceAuth) {
    throw new Error("--device-auth can only be used with ChatGPT");
  }

  return {
    codexConnectionId,
    authMode: authMode as "chatgpt" | "api_key",
    capacitySourceId,
    expiresAt,
    deviceAuth,
  };
}
