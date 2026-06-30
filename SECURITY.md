# Security Policy

## Reporting A Vulnerability

Please report vulnerabilities privately through this repository's GitHub
Security Advisory reporting flow. Include the affected path and version,
reproduction steps, impact, and any suggested mitigation. Do not open a public
issue for an unpatched vulnerability or include live credentials in a report.

If private vulnerability reporting is unavailable, ask the repository owner for
a private contact channel before sharing exploit details.

## Supported Versions

Security fixes target the latest release. Older installed copies should be
updated from a trusted source and reactivated after reviewing release changes.

## Installer Trust Model

The installer does not overwrite untracked or locally modified integration
files, rejects symlink escapes, and uses checksum manifests for ownership-aware
updates and removal. Review the installer before running it.

Figma MCP authentication belongs to the user's IDE or agent environment. Do not
commit Figma tokens, cookies, OAuth material, or private file exports.

`FIGMA_DESIGN_MEMORY.md` is intended for implementation context, not secrets.
Do not store credentials, private exports, or sensitive customer data in it.
