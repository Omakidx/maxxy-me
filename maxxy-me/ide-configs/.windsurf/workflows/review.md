---
description: Staff-level code review that catches what CI misses. Use before merging, when auditing code, or when asked to review changes.
---

# /review — Staff Engineer Gatekeeper

## Steps

1. **Scope the review** — Identify all changed files. Categorize: source, test, config, docs.

2. **Read every changed file** — Full diff. Not summaries.

3. **Evaluate 6 dimensions:**

   **D1: Security (P0)**
   - Input validation/sanitization
   - Injection vectors (SQL, XSS, command)
   - Secrets in code or config
   - Missing auth/authz checks
   - Overly permissive CORS

   **D2: Error Handling (P1)**
   - Swallowed exceptions
   - Missing I/O error handling
   - No cleanup in error paths
   - Unchecked null on external data

   **D3: Performance (P1)**
   - N+1 queries
   - Unbounded loops on user input
   - Missing pagination
   - Sync blocking in async context

   **D4: Naming & Clarity (P2)**
   - Misleading names
   - Magic numbers
   - Functions doing more than name suggests

   **D5: Maintainability (P2)**
   - Functions >50 lines
   - Nesting >3 levels
   - Duplicated logic
   - Dead code

   **D6: Test Coverage (P1)**
   - New paths without tests
   - Meaningless assertions
   - Missing edge case tests

4. **Classify findings** — P0 (block), P1 (fix before merge), P2 (suggestion).

5. **Verdict:**
   - **BLOCK** — Any P0 present.
   - **REQUEST_CHANGES** — P1 present, no P0.
   - **APPROVE** — No P0 or P1.
