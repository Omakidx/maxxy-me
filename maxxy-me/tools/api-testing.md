# API Testing — Developer Reference

## cURL

### Basic Requests
```bash
# GET
curl -s https://api.example.com/users | jq .

# GET with headers
curl -s -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/json" \
     https://api.example.com/users

# POST JSON
curl -s -X POST https://api.example.com/users \
     -H "Content-Type: application/json" \
     -d '{"name": "Alice", "email": "alice@example.com"}'

# PUT
curl -s -X PUT https://api.example.com/users/42 \
     -H "Content-Type: application/json" \
     -d '{"name": "Alice Updated"}'

# PATCH
curl -s -X PATCH https://api.example.com/users/42 \
     -H "Content-Type: application/json" \
     -d '{"role": "admin"}'

# DELETE
curl -s -X DELETE https://api.example.com/users/42

# Form data
curl -s -X POST https://api.example.com/upload \
     -F "file=@./photo.jpg" \
     -F "description=Profile photo"
```

### Debugging
```bash
# Verbose (see headers, TLS, timing)
curl -v https://api.example.com/health

# Response headers only
curl -I https://api.example.com/health

# Response with headers
curl -i https://api.example.com/users

# Timing
curl -o /dev/null -s -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTLS: %{time_appconnect}s\nTotal: %{time_total}s\nStatus: %{http_code}\n" https://api.example.com/health

# Save response to file
curl -s -o response.json https://api.example.com/users

# Follow redirects
curl -L https://example.com/old-url

# With cookies
curl -b "session=abc123" https://api.example.com/profile
curl -c cookies.txt -b cookies.txt https://api.example.com/login
```

---

## HTTPie (human-friendly alternative)

```bash
# GET
http GET api.example.com/users Authorization:"Bearer $TOKEN"

# POST JSON (auto Content-Type)
http POST api.example.com/users name=Alice email=alice@example.com

# PUT
http PUT api.example.com/users/42 name="Alice Updated"

# Form upload
http -f POST api.example.com/upload file@./photo.jpg

# Download file
http --download api.example.com/report.pdf

# Verbose
http --verbose GET api.example.com/users
```

---

## REST API Testing Patterns

### Health Check
```bash
curl -s https://api.example.com/health | jq .
# Expected: {"status":"ok","uptime":12345,"version":"1.2.0"}
```

### CRUD Flow
```bash
# 1. Create
USER_ID=$(curl -s -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@test.com"}' | jq -r '.id')
echo "Created user: $USER_ID"

# 2. Read
curl -s https://api.example.com/users/$USER_ID | jq .

# 3. Update
curl -s -X PATCH https://api.example.com/users/$USER_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Updated"}' | jq .

# 4. List (with pagination)
curl -s "https://api.example.com/users?page=1&limit=10" | jq .

# 5. Delete
curl -s -X DELETE https://api.example.com/users/$USER_ID
```

### Authentication Testing
```bash
# Login → get token
TOKEN=$(curl -s -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"secret"}' | jq -r '.token')

# Authenticated request
curl -s -H "Authorization: Bearer $TOKEN" https://api.example.com/me | jq .

# Test unauthorized access
curl -s -o /dev/null -w "%{http_code}" https://api.example.com/admin
# Expected: 401

# Test forbidden access (wrong role)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $USER_TOKEN" \
  https://api.example.com/admin
# Expected: 403
```

### Error Response Testing
```bash
# 400 Bad Request (invalid input)
curl -s -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":""}' | jq .

# 404 Not Found
curl -s -o /dev/null -w "%{http_code}" https://api.example.com/users/99999

# 409 Conflict (duplicate)
curl -s -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"email":"existing@test.com"}' | jq .

# 429 Rate Limited
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code}\n" https://api.example.com/users
done | sort | uniq -c
```

---

## GraphQL Testing

```bash
# Query
curl -s -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { users(limit: 10) { id name email } }"
  }' | jq .

# Query with variables
curl -s -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetUser($id: ID!) { user(id: $id) { id name email orders { id total } } }",
    "variables": { "id": "42" }
  }' | jq .

# Mutation
curl -s -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id name } }",
    "variables": { "input": { "name": "Alice", "email": "alice@test.com" } }
  }' | jq .

# Introspection (check schema)
curl -s -X POST https://api.example.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}' | jq '.data.__schema.types[].name'
```

---

## WebSocket Testing

```bash
# Using websocat
websocat ws://localhost:3000/ws

# Using wscat (npm)
npx wscat -c ws://localhost:3000/ws

# Send message after connecting
{"type": "subscribe", "channel": "notifications"}
```

---

## Response Validation Checklist

| Check | What to Verify |
|-------|---------------|
| **Status code** | Correct HTTP status (200, 201, 204, 400, 401, 403, 404, 500) |
| **Content-Type** | `application/json` for JSON APIs |
| **Response shape** | Required fields present, correct types |
| **Pagination** | `page`, `limit`, `total`, `hasMore` fields |
| **Error format** | Consistent error object: `{ error: { code, message, details } }` |
| **Auth headers** | `Authorization` required on protected endpoints |
| **CORS headers** | `Access-Control-Allow-Origin` set correctly |
| **Rate limit headers** | `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| **Cache headers** | `Cache-Control`, `ETag` where appropriate |
| **Security headers** | No sensitive data in response headers |

---

## Load Testing (quick)

```bash
# Using Apache Bench
ab -n 1000 -c 50 https://api.example.com/health

# Using hey (Go)
hey -n 1000 -c 50 https://api.example.com/health

# Using wrk
wrk -t12 -c400 -d30s https://api.example.com/health

# Using k6 (script-based)
k6 run --vus 50 --duration 30s load-test.js
```
