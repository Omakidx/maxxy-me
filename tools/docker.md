# Docker — Developer Reference

## Essential Commands

### Images
```bash
docker build -t myapp:1.0 .                  # Build image
docker build -t myapp:1.0 -f Dockerfile.prod . # Custom Dockerfile
docker images                                  # List images
docker rmi myapp:1.0                           # Remove image
docker image prune -a                          # Remove all unused images
docker tag myapp:1.0 registry.io/myapp:1.0     # Tag for registry
docker push registry.io/myapp:1.0              # Push to registry
```

### Containers
```bash
docker run -d --name myapp -p 3000:3000 myapp:1.0    # Run detached
docker run -it --rm myapp:1.0 /bin/sh                 # Interactive + auto-remove
docker run -d --env-file .env myapp:1.0               # With env file
docker run -d -v $(pwd)/data:/app/data myapp:1.0      # With volume mount

docker ps                       # Running containers
docker ps -a                    # All containers (including stopped)
docker stop myapp               # Stop container
docker start myapp              # Start stopped container
docker restart myapp            # Restart container
docker rm myapp                 # Remove container
docker rm -f myapp              # Force remove (even if running)
```

### Debugging
```bash
docker logs myapp               # View logs
docker logs -f myapp            # Follow logs (tail)
docker logs --since 5m myapp    # Last 5 minutes
docker exec -it myapp /bin/sh   # Shell into container
docker exec myapp ls /app       # Run command in container
docker inspect myapp            # Full container details
docker stats                    # Live resource usage
docker top myapp                # Running processes
docker cp myapp:/app/log.txt .  # Copy file from container
```

### Cleanup
```bash
docker system prune             # Remove stopped containers, unused networks, dangling images
docker system prune -a          # Remove ALL unused images (not just dangling)
docker volume prune             # Remove unused volumes
docker system df                # Disk usage
```

---

## Dockerfile Best Practices

### Production Node.js
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### Production Python
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
RUN useradd -r -s /bin/false appuser
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:8000", "--workers", "4"]
```

### Dockerfile Rules
1. **Use specific base image tags** — `node:20-alpine`, not `node:latest`
2. **Multi-stage builds** — separate build and runtime stages
3. **Non-root user** — always `USER appuser` in production
4. **Copy package files first** — leverage layer caching
5. **`.dockerignore`** — exclude `node_modules`, `.git`, `.env`
6. **HEALTHCHECK** — enable orchestrator health monitoring
7. **No secrets in image** — use env vars or secrets management

---

## Docker Compose

### Full Stack Example
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app

volumes:
  pgdata:
  redisdata:
```

### Compose Commands
```bash
docker compose up -d                    # Start all services
docker compose up -d --build            # Rebuild and start
docker compose down                     # Stop and remove
docker compose down -v                  # Stop, remove, and delete volumes
docker compose logs -f app              # Follow app logs
docker compose exec app /bin/sh         # Shell into app
docker compose ps                       # Service status
docker compose restart app              # Restart single service
docker compose pull                     # Pull latest images
docker compose config                   # Validate compose file
```

---

## .dockerignore

```dockerignore
node_modules
npm-debug.log*
.git
.gitignore
.env
.env.*
Dockerfile*
docker-compose*
.dockerignore
README.md
.vscode
.idea
coverage
.nyc_output
dist
build
```

---

## Networking

```bash
# Create network
docker network create mynet

# Run containers on same network
docker run -d --name app --network mynet myapp:1.0
docker run -d --name db --network mynet postgres:16

# Containers can reach each other by name: app → db:5432
```

---

## Common Debugging Patterns

### Container Won't Start
```bash
docker logs myapp                       # Check error output
docker run -it --entrypoint /bin/sh myapp:1.0  # Override entrypoint
docker inspect myapp | grep -A 5 State  # Check exit code
```

### Port Conflicts
```bash
lsof -i :3000                           # Find what's using the port
docker ps --format "{{.Names}}: {{.Ports}}"  # Check port mappings
```

### Image Size Optimization
```bash
docker images myapp                     # Check size
docker history myapp:1.0                # Layer sizes
# Use dive tool for detailed analysis:
dive myapp:1.0
```

| Technique | Savings |
|-----------|---------|
| Alpine base image | ~80% smaller than full |
| Multi-stage build | Remove build tools from final |
| `npm ci --only=production` | Skip devDependencies |
| `.dockerignore` | Exclude unnecessary files |
| Combine RUN commands | Fewer layers |
