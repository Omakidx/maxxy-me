# CLI Productivity — Developer Reference

## Essential CLI Tools

### File Search & Navigation
```bash
# fd — fast file finder (better find)
fd "*.ts" src/                            # Find TypeScript files
fd -e md                                  # Find by extension
fd -H .env                                # Include hidden files
fd -t d components                        # Find directories only
fd -x rm {} \;                            # Find and delete

# fzf — fuzzy finder
vim $(fzf)                                # Open file in vim
cd $(fd -t d | fzf)                       # cd into directory
git checkout $(git branch | fzf)          # Switch branch
history | fzf                             # Search command history
cat file.txt | fzf                        # Search within file

# ripgrep (rg) — fast text search (better grep)
rg "TODO" --type ts                       # Search TypeScript files
rg "function.*export" -l                  # List files with matches
rg -i "error" --glob "*.log"              # Case-insensitive in log files
rg "pattern" -C 3                         # Show 3 lines of context
rg "import.*from" -c                      # Count matches per file
```

### File Viewing & Manipulation
```bash
# bat — better cat with syntax highlighting
bat src/index.ts                          # View with syntax highlighting
bat -A file.txt                           # Show invisible characters
bat --diff file1.ts file2.ts              # Side-by-side diff

# jq — JSON processor
curl -s api.com/users | jq .              # Pretty print
jq '.users[0].name' data.json            # Extract field
jq '.users | length' data.json           # Count array items
jq '.users[] | select(.role == "admin")' data.json  # Filter
jq -r '.users[].email' data.json         # Raw output (no quotes)
jq '.users | sort_by(.name)' data.json   # Sort

# yq — YAML processor (like jq for YAML)
yq '.services.app.ports' docker-compose.yml
yq -i '.version = "2.0"' config.yml      # In-place edit

# sed — stream editor
sed -i 's/old/new/g' file.txt             # Replace all in file
sed -n '10,20p' file.txt                  # Print lines 10-20
sed '/pattern/d' file.txt                 # Delete matching lines

# awk — text processing
awk '{print $1, $3}' file.txt             # Print columns 1 and 3
awk -F',' '{print $2}' data.csv           # CSV column extraction
awk '/ERROR/ {count++} END {print count}' app.log  # Count errors
```

### Process & System
```bash
# htop / btop — interactive process viewer
htop                                      # Process viewer
btop                                      # Modern alternative

# Ports
lsof -i :3000                             # What's using port 3000
ss -tulnp                                 # All listening ports (Linux)
netstat -tulnp                            # Alternative

# Disk
du -sh */                                 # Directory sizes
du -sh * | sort -hr | head -20            # Top 20 largest
df -h                                     # Disk space
ncdu /                                    # Interactive disk usage

# Watch command output
watch -n 2 "docker ps"                    # Refresh every 2 seconds
watch -d "git status"                     # Highlight changes
```

---

## Useful Aliases

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline -20'
alias gd='git diff'
alias gb='git branch'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gpr='git pull --rebase'

# Navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias ll='ls -alh'
alias la='ls -A'

# Docker
alias dc='docker compose'
alias dcu='docker compose up -d'
alias dcd='docker compose down'
alias dcl='docker compose logs -f'
alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

# Dev
alias dev='npm run dev'
alias build='npm run build'
alias test='npm test'
alias lint='npm run lint'

# Quick edit
alias zshrc='$EDITOR ~/.zshrc'
alias bashrc='$EDITOR ~/.bashrc'
alias reload='source ~/.zshrc'

# Safety
alias rm='rm -i'
alias cp='cp -i'
alias mv='mv -i'

# Utilities
alias myip='curl -s ifconfig.me'
alias ports='ss -tulnp'
alias weather='curl -s wttr.in'
alias path='echo $PATH | tr ":" "\n"'
alias timestamp='date +%Y%m%d_%H%M%S'
```

---

## Shell Functions

```bash
# Create directory and cd into it
mkcd() { mkdir -p "$1" && cd "$1"; }

# Extract any archive
extract() {
  case "$1" in
    *.tar.bz2) tar xjf "$1" ;;
    *.tar.gz)  tar xzf "$1" ;;
    *.tar.xz)  tar xJf "$1" ;;
    *.bz2)     bunzip2 "$1" ;;
    *.gz)      gunzip "$1" ;;
    *.tar)     tar xf "$1" ;;
    *.zip)     unzip "$1" ;;
    *.7z)      7z x "$1" ;;
    *)         echo "Unknown format: $1" ;;
  esac
}

# Find and kill process on port
killport() { lsof -ti :$1 | xargs kill -9; }

# Quick HTTP server
serve() { python3 -m http.server ${1:-8000}; }

# Git commit with message
gcm() { git add -A && git commit -m "$*"; }

# Search in files (rg + fzf)
search() { rg --color=always "$1" | fzf --ansi; }

# Docker shell into container
dsh() { docker exec -it "$1" /bin/sh; }
```

---

## tmux Quick Reference

```bash
# Sessions
tmux new -s dev                   # New named session
tmux ls                           # List sessions
tmux attach -t dev                # Attach to session
tmux kill-session -t dev          # Kill session

# Inside tmux (prefix = Ctrl+b)
Ctrl+b c          # New window
Ctrl+b ,          # Rename window
Ctrl+b n/p        # Next/prev window
Ctrl+b 0-9        # Switch to window N

Ctrl+b %          # Split horizontal
Ctrl+b "          # Split vertical
Ctrl+b arrow      # Move between panes
Ctrl+b z          # Toggle pane zoom
Ctrl+b x          # Close pane

Ctrl+b d          # Detach session
Ctrl+b [          # Scroll mode (q to exit)
```

---

## Package Manager Commands

| Action | npm | yarn | pnpm | bun |
|--------|-----|------|------|-----|
| Install all | `npm install` | `yarn` | `pnpm install` | `bun install` |
| Add package | `npm i pkg` | `yarn add pkg` | `pnpm add pkg` | `bun add pkg` |
| Add dev dep | `npm i -D pkg` | `yarn add -D pkg` | `pnpm add -D pkg` | `bun add -d pkg` |
| Remove | `npm uninstall pkg` | `yarn remove pkg` | `pnpm remove pkg` | `bun remove pkg` |
| Run script | `npm run dev` | `yarn dev` | `pnpm dev` | `bun run dev` |
| Update | `npm update` | `yarn upgrade` | `pnpm update` | `bun update` |
| Audit | `npm audit` | `yarn audit` | `pnpm audit` | `bun pm trust` |
| Global | `npm i -g pkg` | `yarn global add pkg` | `pnpm add -g pkg` | `bun add -g pkg` |
| Outdated | `npm outdated` | `yarn outdated` | `pnpm outdated` | — |
| Clean cache | `npm cache clean --force` | `yarn cache clean` | `pnpm store prune` | — |

---

## Useful One-Liners

```bash
# Find largest files in project
find . -type f -not -path './node_modules/*' -not -path './.git/*' | xargs du -sh | sort -hr | head -20

# Count lines of code by extension
find . -name "*.ts" -not -path "./node_modules/*" | xargs wc -l | tail -1

# Remove all node_modules recursively
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

# Find TODO/FIXME comments
rg "TODO|FIXME|HACK|XXX" --type ts -c | sort -t: -k2 -rn

# Watch file changes
fswatch -o src/ | xargs -n1 -I{} npm run build

# Generate random password
openssl rand -base64 32

# Quick JSON validation
python3 -m json.tool < data.json > /dev/null && echo "Valid" || echo "Invalid"

# Diff two directories
diff -rq dir1/ dir2/

# Monitor log file for errors
tail -f app.log | grep --line-buffered "ERROR"

# Convert image formats (ImageMagick)
convert input.png -resize 50% output.jpg

# Base64 encode/decode
echo -n "hello" | base64              # encode
echo "aGVsbG8=" | base64 -d           # decode
```
