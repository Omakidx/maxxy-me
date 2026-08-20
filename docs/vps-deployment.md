# VPS Deployment

This guide deploys one maxxy-me control plane and its first native execution host on a hardened Linux VPS.

## 1. Prepare the VPS

- Apply OS security updates and reboot.
- Create a key-only administrator with provider console recovery.
- Set effective SSH options `PasswordAuthentication no` and `PermitRootLogin no`.
- Use a default-deny firewall; allow SSH only from administrator sources and public TCP 80/443.
- Install Docker Engine, Compose, Git, Bun 1.3.14, Codex, GitHub CLI, PostgreSQL client tools, `age`, and `curl`.
- Point the production DNS record to the VPS and choose direct TLS or Cloudflare Full (strict).

Create durable paths:

```bash
sudo install -d -m 0755 /opt/maxxy-me
sudo install -d -m 0700 /etc/maxxy-me
sudo install -d -m 0750 /var/lib/maxxy-me/{postgres,caddy-data,caddy-config,backup-staging,releases}
sudo install -d -m 0750 /var/log/maxxy-me
```

## 2. Install the Release

Place the repository release at `/opt/maxxy-me`. Production must use a reviewed commit and an immutable registry digest, never a mutable tag.

```bash
cd /opt/maxxy-me
sudo cp .env.production.example /etc/maxxy-me/production.env
sudo chmod 0600 /etc/maxxy-me/production.env
```

Replace every placeholder. Generate independent random values for PostgreSQL, `APP_SECRET`, and the webhook secret. Keep Codex, GitHub push, SSH, host, registry, and backup decryption credentials out of this file.

## 3. Validate

```bash
cd /opt/maxxy-me
set -a
. /etc/maxxy-me/production.env
set +a
docker compose -f compose.yaml -f compose.production.yaml config --quiet
bun run security:check
```

Review the rendered config without printing secret values into tickets or shared logs.

## 4. Deploy

```bash
cd /opt/maxxy-me
set -a
. /etc/maxxy-me/production.env
set +a
./scripts/deploy-vps.sh
```

The deploy script takes a lock, validates Compose, runs a pre-deploy backup when configured, pulls the immutable image, runs one-shot migrations, replaces services, checks health, and records the successful digest.

## 5. Bootstrap

1. Open the HTTPS URL and create the owner.
2. Configure GitHub using [github-app.md](github-app.md).
3. Install and enroll the VPS host using [host-installation.md](host-installation.md).
4. Register and authenticate a Codex connection.
5. Import a repository and create a first task.

## 6. Verify

```bash
APP_URL=https://workspace.example.com ./scripts/smoke-production.sh
docker compose -f compose.yaml -f compose.production.yaml ps
curl -fsS https://workspace.example.com/health
```

From a separate network, verify that only approved SSH, HTTP, and HTTPS ports are reachable. Confirm PostgreSQL, Codex App Server, and host-agent control are not public.

## 7. Roll Back

Read `/var/lib/maxxy-me/releases/previous-image`, set `APP_IMAGE_DIGEST` to that immutable digest, and rerun the deploy script. Database migrations must be backward compatible or have a tested release-specific recovery plan.

Never restore an older database over production merely to roll back application code.

## 8. Production Evidence

Before launch, record:

- public HTTPS and WebSocket health;
- external port and web security scan results;
- non-root process ownership and Docker socket absence;
- container replacement and PostgreSQL restart;
- full reboot with service recovery;
- encrypted off-server backup and isolated restore;
- fresh-VPS rebuild without restoring Codex or GitHub credentials.

Track the decision in [launch-readiness.md](launch-readiness.md).
