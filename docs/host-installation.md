# Host Installation

An execution host runs repositories, worktrees, Codex, Git, validation tools, and the maxxy host agent. Use a persistent Linux machine and a dedicated non-root account.

## Prerequisites

- Bun 1.3.14 available at `/usr/local/bin/bun`
- Git, GitHub CLI, and Codex CLI
- project-specific build and test toolchains
- outbound HTTPS/WSS access to the maxxy-me URL
- no Docker group membership for the host service account

## Install

Run the provisioning commands as an administrator:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin maxxy-host
sudo install -d -m 0755 /opt/maxxy-me
sudo install -d -m 0700 /etc/maxxy-me
sudo install -d -m 0700 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/host-agent
sudo install -d -m 0700 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/host-agent/codex-accounts
sudo install -d -m 0750 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/projects
sudo install -d -m 0750 -o maxxy-host -g maxxy-host /var/lib/maxxy-me/worktrees
sudo install -d -m 0750 -o maxxy-host -g maxxy-host /var/log/maxxy-me
```

Place the checked-out release at `/opt/maxxy-me`, run `bun install --frozen-lockfile`, then install the launcher and service:

```bash
cd /opt/maxxy-me
sudo install -m 0755 deploy/maxxy-host /usr/local/bin/maxxy-host
sudo install -m 0644 deploy/systemd/maxxy-host.service /etc/systemd/system/maxxy-host.service
sudo cp .env.host.production.example /etc/maxxy-me/host-agent.env
sudo chmod 0600 /etc/maxxy-me/host-agent.env
```

Replace every placeholder in `/etc/maxxy-me/host-agent.env`. Keep Codex credential slots beneath `MAXXY_CODEX_ACCOUNTS_DIR`.

## Enroll

In the dashboard, open **Setup -> Host**, create an enrollment command, and run it before its token expires:

```bash
sudo -u maxxy-host /usr/local/bin/maxxy-host enroll \
  --server https://workspace.example.com \
  --token <one-time-token>
```

Enrollment stores the host ID and host token in the protected host data directory. Do not paste those values into chat, issues, logs, or the control-plane environment.

For a local smoke test, run the generated local command from the repository root. The checked-in launcher detects Bun in `PATH`, `~/.bun/bin`, or `/usr/local/bin`:

```bash
cd /path/to/maxxy-me
./deploy/maxxy-host enroll \
  --server http://127.0.0.1:8080 \
  --token <one-time-token>
./deploy/maxxy-host start
```

## Check Tools

```bash
sudo -u maxxy-host /usr/local/bin/maxxy-host doctor
sudo -u maxxy-host /usr/local/bin/maxxy-host registry
```

The Codex inventory version must start with `codex-cli`. A desktop-app launcher named `codex` is not sufficient.

Keep the host agent running, register the connection in **Setup -> Codex**, and run the generated command in a second terminal on that host. For an installed headless host, it has this shape:

```bash
sudo -u maxxy-host /usr/local/bin/maxxy-host codex-login \
  --connection-id <connection-id> \
  --auth-mode chatgpt \
  --credential-slot <slot> \
  --capacity-source-id <capacity-source-id> \
  --device-auth
```

The command runs the official Codex login in that lane's isolated `CODEX_HOME`. After authorization succeeds, the running host reports a `ready_chatgpt` status on its next heartbeat. API-key setup reads the key from stdin and never sends it through the dashboard.

Authenticate GitHub as `maxxy-host`. The current task-to-PR path uses host Git and `gh` credentials for push and draft PR creation.

## Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maxxy-host.service
systemctl status maxxy-host.service
journalctl -u maxxy-host.service -n 100 --no-pager
```

The dashboard should show the host online. Register a Codex connection in **Setup -> Codex** and wait for a `ready_*` status before starting work.

## Permissions Check

```bash
id maxxy-host
sudo -u maxxy-host test -w /var/lib/maxxy-me/projects
sudo -u maxxy-host test -w /var/lib/maxxy-me/worktrees
sudo -u maxxy-host test ! -r /var/run/docker.sock
```

The service account must not have root, sudo, or Docker socket access.

## Upgrade

Stop the service, replace the release at `/opt/maxxy-me`, install dependencies from the lockfile, run `doctor`, and restart. Preserve `/var/lib/maxxy-me/host-agent`, projects, worktrees, credential lanes, and `/etc/maxxy-me/host-agent.env`.

See [recovery.md](recovery.md) before rebuilding a host with active worktrees.
