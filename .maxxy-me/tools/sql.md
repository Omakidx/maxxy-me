# SQL — Query Pattern Reference

## Fundamentals

### CRUD
```sql
-- Create
INSERT INTO users (name, email, role)
VALUES ('Alice', 'alice@example.com', 'admin');

-- Read
SELECT id, name, email FROM users WHERE role = 'admin' ORDER BY name;

-- Update
UPDATE users SET role = 'editor' WHERE id = 42;

-- Delete
DELETE FROM users WHERE id = 42;

-- Upsert (PostgreSQL)
INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- Upsert (MySQL)
INSERT INTO users (email, name) VALUES ('alice@example.com', 'Alice')
ON DUPLICATE KEY UPDATE name = VALUES(name);
```

---

## Joins

```sql
-- INNER JOIN: rows matching in both tables
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;

-- LEFT JOIN: all left rows + matching right (NULL if no match)
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id;

-- RIGHT JOIN: all right rows + matching left
SELECT u.name, o.total
FROM users u
RIGHT JOIN orders o ON o.user_id = u.id;

-- FULL OUTER JOIN: all rows from both (PostgreSQL)
SELECT u.name, o.total
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id;

-- CROSS JOIN: cartesian product
SELECT u.name, p.name AS product
FROM users u CROSS JOIN products p;

-- Self-join: employees and their managers
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```

---

## Common Table Expressions (CTEs)

```sql
-- Basic CTE
WITH active_users AS (
  SELECT id, name, email
  FROM users
  WHERE status = 'active' AND last_login > NOW() - INTERVAL '30 days'
)
SELECT au.name, COUNT(o.id) AS order_count
FROM active_users au
JOIN orders o ON o.user_id = au.id
GROUP BY au.name;

-- Multiple CTEs
WITH
  monthly_revenue AS (
    SELECT DATE_TRUNC('month', created_at) AS month, SUM(total) AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY 1
  ),
  monthly_growth AS (
    SELECT month, revenue,
           LAG(revenue) OVER (ORDER BY month) AS prev_revenue,
           ROUND((revenue - LAG(revenue) OVER (ORDER BY month)) /
                  LAG(revenue) OVER (ORDER BY month) * 100, 2) AS growth_pct
    FROM monthly_revenue
  )
SELECT * FROM monthly_growth ORDER BY month DESC;

-- Recursive CTE (org chart, tree structures)
WITH RECURSIVE org_tree AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.manager_id, ot.depth + 1
  FROM employees e
  JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

---

## Window Functions

```sql
-- ROW_NUMBER: unique row number per partition
SELECT name, department, salary,
  ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) AS rank
FROM employees;

-- RANK / DENSE_RANK
SELECT name, salary,
  RANK() OVER (ORDER BY salary DESC) AS rank,        -- gaps after ties
  DENSE_RANK() OVER (ORDER BY salary DESC) AS drank   -- no gaps
FROM employees;

-- Running total
SELECT date, amount,
  SUM(amount) OVER (ORDER BY date) AS running_total
FROM transactions;

-- Moving average (last 7 days)
SELECT date, amount,
  AVG(amount) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg_7d
FROM daily_sales;

-- LAG / LEAD (previous/next row value)
SELECT date, revenue,
  LAG(revenue, 1) OVER (ORDER BY date) AS prev_day,
  LEAD(revenue, 1) OVER (ORDER BY date) AS next_day
FROM daily_revenue;

-- Percentage of total
SELECT department, salary,
  ROUND(salary * 100.0 / SUM(salary) OVER (), 2) AS pct_of_total
FROM employees;
```

---

## Aggregation Patterns

```sql
-- GROUP BY with HAVING
SELECT department, COUNT(*) AS count, AVG(salary) AS avg_salary
FROM employees
GROUP BY department
HAVING COUNT(*) > 5
ORDER BY avg_salary DESC;

-- Conditional aggregation (pivot)
SELECT
  department,
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,   -- PostgreSQL
  COUNT(*) FILTER (WHERE status = 'inactive') AS inactive_count,
  -- MySQL equivalent:
  -- SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
  ROUND(AVG(salary), 2) AS avg_salary
FROM employees
GROUP BY department;

-- GROUPING SETS (PostgreSQL)
SELECT department, role, COUNT(*), AVG(salary)
FROM employees
GROUP BY GROUPING SETS ((department), (role), (department, role), ());
```

---

## Subqueries

```sql
-- Correlated subquery: latest order per user
SELECT u.name, (
  SELECT MAX(o.created_at)
  FROM orders o WHERE o.user_id = u.id
) AS last_order
FROM users u;

-- EXISTS: users who have placed orders
SELECT u.name FROM users u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- NOT IN vs NOT EXISTS (prefer NOT EXISTS for NULLs)
SELECT u.name FROM users u
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- Subquery in FROM (derived table)
SELECT dept, avg_salary
FROM (
  SELECT department AS dept, AVG(salary) AS avg_salary
  FROM employees GROUP BY department
) sub
WHERE avg_salary > 80000;
```

---

## Indexing Strategy

### When to Index
| Index When | Don't Index When |
|-----------|-----------------|
| WHERE clause columns | Tables < 1000 rows |
| JOIN columns (foreign keys) | Columns with low cardinality (boolean) |
| ORDER BY / GROUP BY columns | Frequently updated columns |
| Unique constraints | Write-heavy tables with rare reads |

### Index Types
```sql
-- B-tree (default, most common)
CREATE INDEX idx_users_email ON users (email);

-- Unique index
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Composite index (column order matters!)
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at DESC);

-- Partial index (PostgreSQL) — index subset of rows
CREATE INDEX idx_active_users ON users (email) WHERE status = 'active';

-- GIN index (PostgreSQL) — full-text, JSON, arrays
CREATE INDEX idx_posts_tags ON posts USING GIN (tags);

-- Expression index
CREATE INDEX idx_users_lower_email ON users (LOWER(email));
```

### Check Index Usage
```sql
-- PostgreSQL: query plan
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'alice@example.com';

-- PostgreSQL: unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- PostgreSQL: index sizes
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
FROM pg_indexes WHERE tablename = 'users';
```

---

## Performance Patterns

### Pagination
```sql
-- Offset-based (simple but slow for large offsets)
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 100;

-- Keyset/cursor-based (fast, consistent)
SELECT * FROM products
WHERE id > 100                        -- last seen ID
ORDER BY id
LIMIT 20;

-- Keyset with multiple sort columns
SELECT * FROM products
WHERE (created_at, id) < ('2024-01-15', 500)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

### Avoid N+1 Queries
```sql
-- BAD: N+1 (1 query for users + N queries for orders)
-- SELECT * FROM users;
-- for each user: SELECT * FROM orders WHERE user_id = ?;

-- GOOD: Single query with JOIN
SELECT u.id, u.name, o.id AS order_id, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
ORDER BY u.id;

-- GOOD: Two queries with IN
SELECT * FROM users WHERE status = 'active';
SELECT * FROM orders WHERE user_id IN (1, 2, 3, 4, 5);
```

### Batch Operations
```sql
-- Batch insert
INSERT INTO logs (level, message, created_at)
VALUES
  ('info', 'User logged in', NOW()),
  ('warn', 'Rate limit approaching', NOW()),
  ('error', 'Payment failed', NOW());

-- Batch update (PostgreSQL)
UPDATE products SET price = v.price
FROM (VALUES (1, 19.99), (2, 29.99), (3, 39.99)) AS v(id, price)
WHERE products.id = v.id;
```

---

## Useful Snippets

```sql
-- Duplicate detection
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;

-- Random sample
SELECT * FROM products ORDER BY RANDOM() LIMIT 10;  -- PostgreSQL
SELECT * FROM products ORDER BY RAND() LIMIT 10;    -- MySQL

-- Date ranges
SELECT * FROM orders
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month';

-- JSON queries (PostgreSQL)
SELECT data->>'name' AS name, data->'address'->>'city' AS city
FROM profiles WHERE data @> '{"role": "admin"}';

-- String search (full-text, PostgreSQL)
SELECT * FROM posts
WHERE to_tsvector('english', title || ' ' || body) @@ to_tsquery('postgresql & performance');
```
