# Production VPS Runbook

This runbook is the Phase 11 operator procedure for building and validating a single-VPS maxxy-me deployment. Run commands as an administrator unless noted.

## 1. Provision and harden OS

- Install a supported Linux LTS/stable release.
- Apply security updates and reboot before app installation.
- Create an administrator user with sudo.
- Verify console or provider recovery access.
- Disable password SSH and direct root SSH after key access works. Set `PasswordAuthentication no` and `PermitRootLogin no` in the effective SSH daemon configuration.
- Enable a default-deny firewall policy, for example `ufw default deny incoming`, then allow only `22/tcp`, `80/tcp`, and `443/tcp`.
- Install Docker Engine, Docker Compose plugin, Git, GitHub CLI, Bun, Codex, `pg_dump`, `pg_restore`, `age`, `curl`, and project toolchains.
- Create the `maxxy-host` system user without Docker socket access.

## 2. DNS and TLS

- Point the production A record to the VPS IPv4.
- Add AAAA only after IPv6 routing and firewall are tested.
- Configure Cloudflare Full Strict or direct public TLS as intended.
- Confirm ports 80 and 443 are free before starting Caddy.

## 3. Directories and permissions

Create:

```bash
sudo install -d -m 0755 /opt/maxxy-me
sudo install -d -m 0700 /etc/maxxy-me
sudo install -d -m 0700 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/host-agent
sudo install -d -m 0700 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/host-agent/codex-accounts
sudo install -d -m 0750 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/projects
sudo install -d -m 0750 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/worktrees
sudo install -d -m 0750 /var/lib/maxxy-me/postgres
sudo install -d -m 0750 /var/lib/maxxy-me/caddy-data /var/lib/maxxy-me/caddy-config
sudo install -d -m 0750 /var/lib/maxxy-me/backup-staging /var/lib/maxxy-me/releases /var/log/maxxy-me
```

Production secrets in `/etc/maxxy-me/*.env` must be mode `0600`. Do not place Codex credentials, GitHub push tokens, or host tokens in the Compose env file.

## 4. Install repo and env

- Copy the release repo files to `/opt/maxxy-me`.
- Copy `.env.production.example` to `/etc/maxxy-me/production.env` and replace every placeholder.
- Copy `.env.host.production.example` to `/etc/maxxy-me/host-agent.env` after host enrollment.
- Symlink or load `/etc/maxxy-me/production.env` before running Compose/deploy commands.

## 5. Deploy control plane

```bash
cd /opt/maxxy-me
set -a
. /etc/maxxy-me/production.env
set +a
docker compose -f compose.yaml -f compose.production.yaml config --quiet
APP_IMAGE_DIGEST="$APP_IMAGE_DIGEST" APP_URL="$APP_URL" DATABASE_URL="$DATABASE_URL" ./scripts/deploy-vps.sh
```

## 6. Install host agent

```bash
sudo install -m 0644 deploy/systemd/maxxy-host.service /etc/systemd/system/maxxy-host.service
sudo systemctl daemon-reload
sudo systemctl enable --now maxxy-host.service
systemctl status maxxy-host.service
```

Enroll the VPS host from the dashboard/API, then write the issued host id/token into `/etc/maxxy-me/host-agent.env` and restart `maxxy-host.service`.

## 7. Backups and restore

```bash
sudo install -m 0644 deploy/systemd/maxxy-backup.service /etc/systemd/system/maxxy-backup.service
sudo install -m 0644 deploy/systemd/maxxy-backup.timer /etc/systemd/system/maxxy-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now maxxy-backup.timer
sudo systemctl start maxxy-backup.service
```

Regularly copy an encrypted backup to isolated storage and test restore into an isolated database with `scripts/restore-postgres-check.sh`.

## 8. Phase 11 exit validation

Record evidence for each item:

- Fresh VPS built from this runbook.
- Public scan shows only SSH, HTTP, HTTPS, for example from a separate network with `nmap -Pn -p- <host>`.
- PostgreSQL and Codex App Server are not publicly reachable.
- Container replacement preserves PostgreSQL, Caddy, and dashboard state.
- Full VPS reboot restores Caddy, web, worker, PostgreSQL, and host agent.
- Active task state remains visible after restart and host reconnect.
- Encrypted backup restores into an isolated database.
- Fresh-VPS recovery drill succeeds without restoring Codex or GitHub credentials from the general backup.
