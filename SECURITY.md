# Security Policy

## Supported Scope

Security fixes are applied to the current default branch and active release candidate. Older phase commits are development history and are not supported releases.

maxxy-me has not completed its production launch evidence. Treat it as pre-release software until [docs/launch-readiness.md](docs/launch-readiness.md) records all gates as passed.

## Reporting a Vulnerability

Do not open a public issue containing a vulnerability, exploit, credential, private log, host name, IP address, or repository secret.

Report privately to the repository owner through GitHub's private vulnerability reporting feature when enabled. Include:

- affected commit or image digest;
- affected component and deployment mode;
- reproduction steps with secrets removed;
- security impact;
- suggested mitigation, if known.

If private reporting is unavailable, contact the repository owner through a private channel and ask for a secure reporting path before sending details.

## Secret Exposure

If a secret may have been exposed:

1. revoke or rotate it before investigating further;
2. stop affected services or hosts when continued use increases impact;
3. preserve redacted logs and audit events;
4. rotate dependent sessions and tokens;
5. remove the secret from Git history only with a coordinated incident plan;
6. document the incident without reproducing the secret.

Credential classes include owner sessions, application secrets, host tokens, GitHub webhook and push credentials, Codex credentials, API keys, registry credentials, deploy credentials, and backup identities.

## Security Boundaries

- Browser sessions use owner-only authentication and CSRF protection.
- Host enrollment tokens are short-lived and single-use; host tokens are revocable.
- Codex and GitHub credential stores remain on execution hosts.
- Application containers receive no repository mounts, credential stores, or Docker socket.
- PostgreSQL is private to the Compose network.
- Host commands use deny/allow policy, path guards, output caps, timeouts, and a filtered environment.
- Caddy applies request limits, redacted logs, CSP, HSTS, clickjacking protection, and content-type protections.
- Production app containers are read-only and use `no-new-privileges`.
- Database backups are encrypted before leaving staging.

The detailed threat model and repository security checklist are in [docs/security-hardening.md](docs/security-hardening.md).

## Production Operator Duties

Before launch:

- use unique random production secrets and mode `0600` environment files;
- disable root and password SSH after tested key access;
- allow only approved SSH sources and public HTTP/HTTPS;
- keep the host service account outside the Docker group;
- install only immutable application image digests;
- run dependency, image, external web, and external port scans;
- keep encrypted backups off the VPS and test restoration;
- verify backups exclude Codex and GitHub credential stores.

Run the repository security invariants with:

```bash
bun run security:check
```

This check does not replace live host inspection or external scanning.

## Disclosure

Coordinate remediation and disclosure timing with the repository owner. Public disclosure should occur only after a fix is available and credentials, infrastructure details, and private repository data have been removed.
