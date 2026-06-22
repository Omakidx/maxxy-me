# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through this repository's GitHub
Security Advisory reporting flow. Include the affected path and version,
reproduction steps, impact, and any suggested mitigation. Do not open a public
issue for an unpatched vulnerability or include live credentials in a report.

If private vulnerability reporting is unavailable, ask the repository owner for
a private contact channel before sharing exploit details.

## Supported versions

Security fixes target the latest release. Older installed copies should be
updated from a trusted source and reactivated after reviewing release changes.

## Installer trust model

The installer does not overwrite untracked or locally modified integration
files, rejects symlink escapes, and uses checksum manifests for ownership-aware
updates and removal. Review the installer before running it and avoid executing
network responses directly in a shell.
