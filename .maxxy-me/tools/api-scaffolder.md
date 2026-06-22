# API Scaffolder — Code Generation

Scaffolding templates for REST and GraphQL APIs with validation, error handling, and auth.

---

## Express.js (TypeScript)

### Route + Controller + Validation
```typescript
// routes/users.ts
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import * as usersController from '../controllers/users';

const router = Router();

const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['user', 'admin']).default('user'),
  }),
});

const getUserParams = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

const listUsersQuery = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  }),
});

router.get('/', authenticate, validate(listUsersQuery), usersController.list);
router.get('/:id', authenticate, validate(getUserParams), usersController.getById);
router.post('/', authenticate, authorize('admin'), validate(createUserSchema), usersController.create);
router.patch('/:id', authenticate, authorize('admin'), validate(getUserParams), usersController.update);
router.delete('/:id', authenticate, authorize('admin'), validate(getUserParams), usersController.remove);

export default router;
```

### Controller
```typescript
// controllers/users.ts
import type { Request, Response, NextFunction } from 'express';
import { usersService } from '../services/users';
import { AppError } from '../errors/AppError';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = req.query as { page: number; limit: number; search?: string };
    const result = await usersService.list({ page, limit, search });
    res.json({
      data: result.users,
      meta: { page, limit, total: result.total, hasMore: result.hasMore },
    });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.getById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.create(req.body);
    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await usersService.update(req.params.id, req.body);
    if (!user) throw new AppError('User not found', 404);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await usersService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
```

### Validation Middleware
```typescript
// middleware/validate.ts
import type { Request, Response, NextFunction } from 'express';
import { type AnyZodObject, ZodError } from 'zod';

export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(error);
    }
  };
}
```

### Error Handler
```typescript
// errors/AppError.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// middleware/errorHandler.ts
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
```

---

## Next.js API Routes (App Router)

### Route Handler
```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '20');

  const users = await db.user.findMany({
    skip: (page - 1) * limit,
    take: limit,
    select: { id: true, name: true, email: true, createdAt: true },
  });
  const total = await db.user.count();

  return NextResponse.json({
    data: users,
    meta: { page, limit, total, hasMore: page * limit < total },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const user = await db.user.create({ data: parsed.data });
  return NextResponse.json({ data: user }, { status: 201 });
}
```

### Dynamic Route
```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await db.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: user });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await db.user.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
```

---

## FastAPI (Python)

### Router + Schema
```python
# routers/users.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..auth import get_current_user, require_role
from ..services.users import UserService

router = APIRouter(prefix="/users", tags=["users"])

class CreateUserRequest(BaseModel):
    name: str
    email: EmailStr
    role: str = "user"

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True

class PaginatedResponse(BaseModel):
    data: list[UserResponse]
    meta: dict

@router.get("/", response_model=PaginatedResponse)
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user=Depends(get_current_user),
    service: UserService = Depends(),
):
    result = await service.list(page=page, limit=limit, search=search)
    return {
        "data": result.users,
        "meta": {"page": page, "limit": limit, "total": result.total},
    }

@router.post("/", response_model=dict, status_code=201)
async def create_user(
    body: CreateUserRequest,
    current_user=Depends(require_role("admin")),
    service: UserService = Depends(),
):
    user = await service.create(body)
    return {"data": user}

@router.get("/{user_id}", response_model=dict)
async def get_user(
    user_id: str,
    current_user=Depends(get_current_user),
    service: UserService = Depends(),
):
    user = await service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"data": user}

@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    current_user=Depends(require_role("admin")),
    service: UserService = Depends(),
):
    await service.delete(user_id)
```

---

## API Response Format Standard

### Success
```json
{
  "data": { "id": "123", "name": "Alice" },
  "meta": { "page": 1, "limit": 20, "total": 42 }
}
```

### Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      { "path": "body.email", "message": "Invalid email format" }
    ]
  }
}
```

### Status Code Reference
| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST (resource created) |
| `204` | No Content | Successful DELETE |
| `400` | Bad Request | Validation error, malformed input |
| `401` | Unauthorized | Missing or invalid auth token |
| `403` | Forbidden | Valid auth but insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate resource, state conflict |
| `422` | Unprocessable | Semantic validation error |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Error | Unhandled server error |

---

## File Structure

```
src/
  routes/          # Route definitions
  controllers/     # Request handling logic
  services/        # Business logic
  middleware/       # Auth, validation, error handling
  errors/          # Custom error classes
  schemas/         # Zod/Pydantic schemas
  types/           # TypeScript types
```
