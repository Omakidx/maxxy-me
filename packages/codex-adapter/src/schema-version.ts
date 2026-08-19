export const testedCodexVersion = "26.814.41957";
export const codexAppServerSchemaVersion = "fixture-jsonl-v1";
export const codexAdapterProtocolNotes = [
  "Adapter tests pin behavior against sanitized JSONL fixtures.",
  "Raw Codex App Server protocol shapes stay internal to @maxxy/codex-adapter.",
  "Only normalized maxxy runtime events are exported across package boundaries.",
] as const;
