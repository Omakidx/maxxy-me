# Test Scaffolder — Code Generation

Scaffolding templates for unit, integration, and E2E tests across frameworks.

---

## Unit Tests

### Vitest / Jest (TypeScript)
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { {{FunctionUnderTest}} } from './{{module}}';

describe('{{FunctionUnderTest}}', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns expected result for valid input', () => {
    const result = {{FunctionUnderTest}}(validInput);
    expect(result).toEqual(expectedOutput);
  });

  it('throws on invalid input', () => {
    expect(() => {{FunctionUnderTest}}(invalidInput)).toThrow('{{ErrorMessage}}');
  });

  it('handles edge case: empty input', () => {
    const result = {{FunctionUnderTest}}('');
    expect(result).toBeNull();
  });

  it('handles edge case: boundary values', () => {
    expect({{FunctionUnderTest}}(0)).toBe({{expected}});
    expect({{FunctionUnderTest}}(Number.MAX_SAFE_INTEGER)).toBe({{expected}});
    expect({{FunctionUnderTest}}(-1)).toBe({{expected}});
  });
});
```

### Testing with Mocks
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from './UserService';
import { UserRepository } from './UserRepository';
import { EmailService } from './EmailService';

vi.mock('./UserRepository');
vi.mock('./EmailService');

describe('UserService', () => {
  let service: UserService;
  let mockRepo: vi.Mocked<UserRepository>;
  let mockEmail: vi.Mocked<EmailService>;

  beforeEach(() => {
    mockRepo = new UserRepository() as vi.Mocked<UserRepository>;
    mockEmail = new EmailService() as vi.Mocked<EmailService>;
    service = new UserService(mockRepo, mockEmail);
  });

  describe('createUser', () => {
    it('creates user and sends welcome email', async () => {
      const userData = { name: 'Alice', email: 'alice@test.com' };
      const createdUser = { id: '1', ...userData };

      mockRepo.create.mockResolvedValue(createdUser);
      mockEmail.sendWelcome.mockResolvedValue(undefined);

      const result = await service.createUser(userData);

      expect(result).toEqual(createdUser);
      expect(mockRepo.create).toHaveBeenCalledWith(userData);
      expect(mockEmail.sendWelcome).toHaveBeenCalledWith('alice@test.com');
    });

    it('throws if email already exists', async () => {
      mockRepo.findByEmail.mockResolvedValue({ id: '1', name: 'Existing' });

      await expect(
        service.createUser({ name: 'Alice', email: 'existing@test.com' })
      ).rejects.toThrow('Email already in use');
    });

    it('does not send email if repo create fails', async () => {
      mockRepo.create.mockRejectedValue(new Error('DB error'));

      await expect(service.createUser({ name: 'Alice', email: 'a@test.com' }))
        .rejects.toThrow('DB error');
      expect(mockEmail.sendWelcome).not.toHaveBeenCalled();
    });
  });
});
```

### Testing Async / Promises
```typescript
describe('async operations', () => {
  it('resolves with data', async () => {
    const data = await fetchData();
    expect(data).toHaveProperty('id');
  });

  it('rejects with error', async () => {
    await expect(fetchInvalidData()).rejects.toThrow('Not found');
  });

  it('handles timeout', async () => {
    vi.useFakeTimers();
    const promise = fetchWithTimeout(5000);
    vi.advanceTimersByTime(5000);
    await expect(promise).rejects.toThrow('Timeout');
    vi.useRealTimers();
  });
});
```

---

## React Component Tests (Testing Library)

### Basic Component Test
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { {{ComponentName}} } from './{{ComponentName}}';

describe('{{ComponentName}}', () => {
  it('renders with required props', () => {
    render(<{{ComponentName}} title="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<{{ComponentName}} onClick={onClick} />);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders loading state', () => {
    render(<{{ComponentName}} isLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<{{ComponentName}} error="Something went wrong" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
```

### Form Testing
```tsx
describe('LoginForm', () => {
  it('submits with valid data', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), 'alice@test.com');
    await user.type(screen.getByLabelText(/password/i), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'alice@test.com',
      password: 'SecurePass123!',
    });
  });

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('disables submit while loading', () => {
    render(<LoginForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });
});
```

---

## API / Integration Tests

### Express API Test (Supertest)
```typescript
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';

describe('GET /api/users', () => {
  beforeAll(async () => {
    await db.migrate.latest();
    await db.seed.run();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('returns paginated users', async () => {
    const res = await request(app)
      .get('/api/users?page=1&limit=10')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta).toEqual({ page: 1, limit: 10, total: expect.any(Number), hasMore: true });
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .get('/api/users')
      .expect(401);
  });

  it('returns 400 for invalid query params', async () => {
    const res = await request(app)
      .get('/api/users?page=-1')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/users', () => {
  it('creates a user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alice', email: 'alice@test.com' })
      .expect(201);

    expect(res.body.data).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
    expect(res.body.data.id).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Alice', email: 'alice@test.com' })
      .expect(409);
  });
});
```

---

## E2E Tests (Playwright)

### Page Object Pattern
```typescript
// pages/LoginPage.ts
import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

### E2E Test
```typescript
// tests/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await loginPage.login('admin@test.com', 'password123');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('invalid credentials show error', async () => {
    await loginPage.login('admin@test.com', 'wrong');
    await expect(loginPage.errorMessage).toHaveText('Invalid credentials');
  });

  test('empty form shows validation errors', async () => {
    await loginPage.submitButton.click();
    await expect(loginPage.page.getByText('Email is required')).toBeVisible();
  });
});
```

### Visual Regression Test
```typescript
test('homepage matches snapshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', { maxDiffPixels: 100 });
});
```

---

## Python Tests (pytest)

```python
import pytest
from unittest.mock import AsyncMock, patch
from app.services.users import UserService

@pytest.fixture
def user_service():
    return UserService(repo=AsyncMock(), email=AsyncMock())

class TestUserService:
    async def test_create_user(self, user_service):
        user_service.repo.create.return_value = {"id": "1", "name": "Alice"}
        result = await user_service.create({"name": "Alice", "email": "a@test.com"})
        assert result["name"] == "Alice"
        user_service.repo.create.assert_called_once()

    async def test_create_user_duplicate_email(self, user_service):
        user_service.repo.find_by_email.return_value = {"id": "1"}
        with pytest.raises(ValueError, match="Email already in use"):
            await user_service.create({"name": "Alice", "email": "existing@test.com"})

    @pytest.mark.parametrize("email,is_valid", [
        ("user@example.com", True),
        ("invalid", False),
        ("", False),
        ("user@.com", False),
    ])
    def test_validate_email(self, email, is_valid):
        assert UserService.validate_email(email) == is_valid
```

---

## Test Organization

```
tests/
  unit/              # Pure logic, mocked dependencies
    services/
    utils/
  integration/       # Real DB, real HTTP, service boundaries
    api/
    db/
  e2e/               # Full browser tests
    auth.spec.ts
    dashboard.spec.ts
    pages/           # Page objects
  fixtures/          # Shared test data
  helpers/           # Test utilities
```

## Test Naming Convention
```
it('should [expected behavior] when [condition]')
it('throws [error type] if [invalid condition]')
it('returns [expected result] for [input description]')
```
