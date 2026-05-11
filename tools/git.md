# Git — Developer Reference

## Conventional Commits

```
<type>(<scope>): <short summary>

<body — optional>

<footer — optional>
```

### Types
| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Restructure, no behavior change |
| `perf` | Performance improvement |
| `test` | Add or fix tests |
| `build` | Build system, dependencies |
| `ci` | CI configuration |
| `chore` | Other (maintenance, tooling) |
| `revert` | Revert a commit |

### Examples
```bash
feat(auth): add OAuth2 PKCE flow
fix(api): handle null response in user endpoint
docs(readme): add deployment instructions
refactor(cart): extract price calculation to service
perf(db): add index on orders.user_id
test(auth): add MFA enrollment edge cases
```

### Breaking Changes
```bash
feat(api)!: remove deprecated /v1/users endpoint

BREAKING CHANGE: The /v1/users endpoint has been removed.
Use /v2/users instead.
```

---

## Branching Strategies

### GitHub Flow (recommended for most teams)
```
main ← feature branches
  └── feat/auth-oauth2
  └── fix/null-response
  └── docs/deployment-guide
```

```bash
git checkout -b feat/auth-oauth2
# ... work ...
git push -u origin feat/auth-oauth2
# Open PR → review → squash merge → delete branch
```

### GitFlow (release-driven teams)
```
main ← release ← develop ← feature branches
  └── release/1.2.0
  └── develop
       └── feat/auth-oauth2
       └── fix/null-response
  └── hotfix/critical-bug
```

### Branch Naming
```
feat/<ticket>-<short-desc>     feat/AUTH-123-oauth-pkce
fix/<ticket>-<short-desc>      fix/API-456-null-response
docs/<short-desc>              docs/deployment-guide
refactor/<short-desc>          refactor/cart-service
release/<version>              release/1.2.0
hotfix/<short-desc>            hotfix/payment-crash
```

---

## Essential Commands

### Daily Workflow
```bash
# Start fresh
git fetch --all --prune
git checkout main && git pull

# Create branch
git checkout -b feat/my-feature

# Stage & commit
git add -p                          # Interactive staging (review each hunk)
git commit -m "feat(scope): description"

# Push
git push -u origin feat/my-feature

# Keep branch updated
git fetch origin main
git rebase origin/main              # Prefer rebase over merge for feature branches
```

### Stashing
```bash
git stash                           # Stash changes
git stash -u                        # Include untracked files
git stash -m "WIP: auth flow"       # Named stash
git stash list                      # List stashes
git stash pop                       # Apply and remove latest
git stash apply stash@{2}           # Apply specific stash (keep in list)
git stash drop stash@{0}            # Remove specific stash
```

### Interactive Rebase
```bash
# Squash last 3 commits
git rebase -i HEAD~3

# In editor:
pick abc1234 feat: add login form
squash def5678 fix: typo in login
squash ghi9012 style: format login

# Result: one clean commit
```

### Bisect (find the breaking commit)
```bash
git bisect start
git bisect bad                      # Current commit is broken
git bisect good v1.0.0              # This tag was working
# Git checks out a middle commit — test it, then:
git bisect good                     # or git bisect bad
# Repeat until Git finds the first bad commit
git bisect reset                    # Return to original state
```

### Cherry-Pick
```bash
git cherry-pick abc1234             # Apply one commit
git cherry-pick abc1234 def5678     # Apply multiple
git cherry-pick abc1234 --no-commit # Stage changes without committing
```

### Undo / Recovery
```bash
# Undo last commit (keep changes staged)
git reset --soft HEAD~1

# Undo last commit (keep changes unstaged)
git reset HEAD~1

# Undo last commit (discard changes — DESTRUCTIVE)
git reset --hard HEAD~1

# Undo a pushed commit (create revert commit)
git revert abc1234

# Recover deleted branch
git reflog                          # Find the commit
git checkout -b recovered-branch abc1234

# Discard all local changes
git checkout -- .                   # or git restore .
```

### Log & History
```bash
git log --oneline -20               # Last 20 commits, compact
git log --graph --oneline --all     # Visual branch graph
git log --author="name" --since="2 weeks ago"
git log -p -- path/to/file          # Changes to specific file
git blame path/to/file              # Who changed each line
git shortlog -sn                    # Commit count by author
git diff --stat HEAD~5              # Summary of last 5 commits
```

### Tags
```bash
git tag v1.2.0                      # Lightweight tag
git tag -a v1.2.0 -m "Release 1.2" # Annotated tag
git push origin v1.2.0              # Push specific tag
git push origin --tags              # Push all tags
```

---

## .gitignore Essentials

```gitignore
# Dependencies
node_modules/
vendor/
.venv/
__pycache__/

# Build outputs
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/
.nyc_output/
```

---

## Git Hooks (with Husky)

```bash
npx husky init
```

```bash
# .husky/pre-commit
npx lint-staged

# .husky/commit-msg
npx --no -- commitlint --edit $1
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## PR Best Practices

### PR Title
Follow conventional commits: `feat(auth): add OAuth2 PKCE flow`

### PR Description Template
```markdown
## What
Brief description of the change.

## Why
Link to issue/ticket. Context for the change.

## How
Technical approach. Key decisions made.

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing steps
- [ ] Edge cases covered

## Screenshots
(if UI changes)
```

### PR Size
- **Ideal:** < 300 lines changed
- **Acceptable:** 300-500 lines
- **Too large:** > 500 lines — break it up
