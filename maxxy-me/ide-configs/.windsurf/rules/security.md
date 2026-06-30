# Figma Implementation Safety Rules

- `FIGMA_DESIGN_MEMORY.md` is mandatory and must not be bypassed, deleted, or
  treated as optional.
- The target implementation tech stack must be explicitly asked or confirmed
  with the user before any Figma design starts; do not infer it from repository
  files, defaults, or memory, and stop NEEDS_CONTEXT if it is not confirmed.
- `FIGMA_SYSTEM_DESIGN.md` must be written after MCP extraction and before
  implementation code starts; do not skip it when design details seem obvious.
- To avoid hallucination, strictly always ask a concise clarifying question when
  security, privacy, Figma, user intent, asset, token, state, constraint, or
  implementation requirements are unclear; do not guess.
- Known Figma translation errors must be auto-corrected with project standards
  before reporting completion; do not use security, privacy, or MCP constraints
  as a reason to silently ship a known mismatch.
- Do not commit Figma tokens, OAuth credentials, API keys, cookies, or personal
  access tokens.
- Do not paste private Figma file content into public logs.
- Do not add remote scripts, analytics, fonts, or CDN assets unless already used
  by the project or explicitly requested.
- Sanitize user-controlled copy before rendering when the implementation touches
  dynamic content.
- Keep MCP configuration in the user's IDE or agent environment unless project
  config is explicitly requested.
