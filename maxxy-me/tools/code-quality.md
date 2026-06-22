# Code Quality — Analysis Tool

Structured procedure for measuring and improving code quality.

---

## Audit Procedure

### Phase 1: Static Analysis

```bash
# ESLint (JavaScript/TypeScript)
npx eslint . --ext .ts,.tsx --format compact
npx eslint . --ext .ts,.tsx --fix              # Auto-fix

# TypeScript strict checks
npx tsc --noEmit --strict

# Semgrep (multi-language SAST)
npx semgrep --config=auto --metrics=off

# SonarQube (local scan)
npx sonarqube-scanner
```

### Phase 2: Complexity Metrics

```bash
# Cyclomatic complexity (JavaScript/TypeScript)
npx eslint . --rule '{"complexity": ["error", 10]}'

# plato — JS source analysis
npx plato -r -d report src/

# radon (Python)
radon cc src/ -a -nb         # Cyclomatic complexity
radon mi src/ -nb            # Maintainability index
```

**Complexity thresholds:**
| Metric | Good | Acceptable | Too High |
|--------|------|------------|----------|
| Cyclomatic complexity per function | 1-5 | 6-10 | > 10 |
| Function length (lines) | 1-20 | 21-50 | > 50 |
| File length (lines) | 1-200 | 201-400 | > 400 |
| Nesting depth | 1-2 | 3 | > 3 |
| Parameters per function | 1-3 | 4-5 | > 5 |
| Class methods | 1-10 | 11-20 | > 20 |

### Phase 3: Code Duplication

```bash
# jscpd — copy/paste detector
npx jscpd src/ --min-lines 5 --min-tokens 50 --reporters consoleFull

# PMD CPD (multi-language)
pmd cpd --minimum-tokens 100 --dir src/ --language typescript
```

**Duplication thresholds:**
| Level | Percentage | Action |
|-------|-----------|--------|
| Good | < 3% | Acceptable |
| Warning | 3-5% | Extract shared utilities |
| Critical | > 5% | Refactor immediately |

### Phase 4: Test Coverage

```bash
# Vitest
npx vitest run --coverage

# Jest
npx jest --coverage

# pytest (Python)
pytest --cov=src --cov-report=html --cov-report=term

# Go
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**Coverage thresholds:**
| Metric | Minimum | Target | Excellent |
|--------|---------|--------|-----------|
| Line coverage | 70% | 80% | 90%+ |
| Branch coverage | 60% | 75% | 85%+ |
| Function coverage | 75% | 85% | 95%+ |
| Statement coverage | 70% | 80% | 90%+ |

**What to cover vs what not to:**
- **Must cover:** Business logic, validation, error paths, auth checks
- **Should cover:** API handlers, data transformations, hooks
- **Skip:** Generated code, type definitions, config files, trivial getters

### Phase 5: Dependency Analysis

```bash
# Check bundle impact of each dependency
npx bundlephobia <package-name>

# Find unused dependencies
npx depcheck

# Find unused exports
npx ts-unused-exports tsconfig.json

# Check for circular dependencies
npx madge --circular --extensions ts src/
```

---

## Code Smell Catalog

### Naming Issues
| Smell | Example | Fix |
|-------|---------|-----|
| Single-letter variables | `const x = getUser()` | `const user = getUser()` |
| Misleading names | `isDisabled` returns count | Name must match return type |
| Magic numbers | `if (retries > 3)` | `const MAX_RETRIES = 3` |
| Abbreviations | `const usrMgr = ...` | `const userManager = ...` |
| Boolean without prefix | `const valid = ...` | `const isValid = ...` |

### Structural Issues
| Smell | Signal | Fix |
|-------|--------|-----|
| God function | > 50 lines | Extract into smaller functions |
| Deep nesting | > 3 levels | Early returns, extract helpers |
| Long parameter list | > 4 params | Use options object |
| Feature envy | Function uses another class's data more than its own | Move to the right class |
| Shotgun surgery | One change requires editing 5+ files | Consolidate related logic |
| Primitive obsession | Passing `string` everywhere | Create value objects/types |

### Architecture Issues
| Smell | Signal | Fix |
|-------|--------|-----|
| Circular dependencies | `madge --circular` finds cycles | Restructure modules, use DI |
| Barrel file explosion | `index.ts` re-exports 50+ items | Split into focused modules |
| Leaky abstractions | Implementation details in interfaces | Tighten contracts |
| Config in code | Hardcoded URLs, keys, thresholds | Environment variables |

---

## Refactoring Patterns

### Extract Function
```typescript
// BEFORE
function processOrder(order: Order) {
  // validate
  if (!order.items.length) throw new Error('Empty order');
  if (order.total < 0) throw new Error('Invalid total');
  // calculate
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  // save
  db.orders.insert({ ...order, total });
}

// AFTER
function processOrder(order: Order) {
  validateOrder(order);
  const total = calculateTotal(order.items);
  db.orders.insert({ ...order, total });
}
```

### Replace Conditional with Guard Clause
```typescript
// BEFORE
function getPaymentLabel(status: string): string {
  if (status === 'paid') {
    return 'Complete';
  } else {
    if (status === 'pending') {
      return 'Awaiting payment';
    } else {
      if (status === 'failed') {
        return 'Payment failed';
      } else {
        return 'Unknown';
      }
    }
  }
}

// AFTER
function getPaymentLabel(status: string): string {
  if (status === 'paid') return 'Complete';
  if (status === 'pending') return 'Awaiting payment';
  if (status === 'failed') return 'Payment failed';
  return 'Unknown';
}
```

### Replace Options Object for Long Params
```typescript
// BEFORE
function createUser(name: string, email: string, role: string, team: string, active: boolean) {}

// AFTER
interface CreateUserOptions {
  name: string;
  email: string;
  role: string;
  team: string;
  isActive?: boolean;
}
function createUser(options: CreateUserOptions) {}
```

---

## Automated Quality Gates

### Pre-commit Hook
```bash
# .husky/pre-commit
npx lint-staged
```

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix --max-warnings 0",
      "prettier --write",
      "vitest related --run"
    ]
  }
}
```

### CI Quality Gate
```yaml
# Fail CI if quality drops
- run: npx eslint . --max-warnings 0
- run: npx tsc --noEmit
- run: npx vitest run --coverage
- run: |
    COVERAGE=$(npx vitest run --coverage --reporter=json | jq '.total.lines.pct')
    if (( $(echo "$COVERAGE < 80" | bc -l) )); then
      echo "Coverage $COVERAGE% is below 80% threshold"
      exit 1
    fi
```

---

## Output Format

```
CODE QUALITY REPORT
════════════════════════════════════════

Project:        <name>
Date:           <date>
Files scanned:  <count>
Lines of code:  <count>

Complexity:
  Avg cyclomatic:     <value>
  Functions > 10:     <count>
  Files > 400 lines:  <count>
  Max nesting depth:  <value>

Duplication:
  Percentage:         <value>%
  Duplicate blocks:   <count>
  Largest clone:      <lines> lines in <file>

Coverage:
  Lines:     <pct>%
  Branches:  <pct>%
  Functions: <pct>%
  Untested critical paths:
    • <file:function> — <why it matters>

Issues:
  P0 (Fix now):
    • <issue> — <file:line>
  P1 (Fix this sprint):
    • <issue> — <file:line>
  P2 (Track):
    • <issue>

Recommendations:
  1. <highest impact improvement>
  2. <next>
  3. <next>
```
