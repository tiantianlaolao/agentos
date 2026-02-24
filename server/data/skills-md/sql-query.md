---
name: sql-query
description: SQL query optimization patterns, common queries, and performance best practices
emoji: "\U0001F5C4"
name_zh: SQL 查询
description_zh: SQL 查询优化与数据库操作指南
---

## SQL Query Optimization & Patterns

A practical reference for writing efficient, readable SQL queries and avoiding common performance pitfalls.

## Query Writing Conventions

### Formatting Standards

```sql
-- Use uppercase for SQL keywords, lowercase for identifiers
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) AS order_count
FROM users u
INNER JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
    AND u.created_at >= '2025-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 5
ORDER BY order_count DESC
LIMIT 20;
```

### Naming Conventions

- Tables: plural, snake_case (`user_profiles`, `order_items`)
- Columns: singular, snake_case (`first_name`, `created_at`)
- Primary keys: `id` or `<table_singular>_id`
- Foreign keys: `<referenced_table_singular>_id`
- Booleans: prefix with `is_`, `has_`, `can_` (`is_active`, `has_verified`)
- Timestamps: suffix with `_at` (`created_at`, `updated_at`, `deleted_at`)

## Common Query Patterns

### Pagination

Offset-based (simple, slower for large offsets):
```sql
SELECT * FROM products
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;  -- Page 3, 20 per page
```

Cursor-based (efficient for large datasets):
```sql
SELECT * FROM products
WHERE created_at < '2025-06-15T10:30:00Z'
ORDER BY created_at DESC
LIMIT 20;
```

### Upsert (Insert or Update)

PostgreSQL:
```sql
INSERT INTO user_settings (user_id, theme, language)
VALUES (123, 'dark', 'en')
ON CONFLICT (user_id)
DO UPDATE SET
    theme = EXCLUDED.theme,
    language = EXCLUDED.language;
```

MySQL:
```sql
INSERT INTO user_settings (user_id, theme, language)
VALUES (123, 'dark', 'en')
ON DUPLICATE KEY UPDATE
    theme = VALUES(theme),
    language = VALUES(language);
```

### Conditional Aggregation

```sql
SELECT
    DATE(created_at) AS day,
    COUNT(*) AS total_orders,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) AS revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day;
```

### Recursive CTE (Hierarchical Data)

```sql
WITH RECURSIVE category_tree AS (
    -- Base case: top-level categories
    SELECT id, name, parent_id, 0 AS depth
    FROM categories
    WHERE parent_id IS NULL

    UNION ALL

    -- Recursive case: children
    SELECT c.id, c.name, c.parent_id, ct.depth + 1
    FROM categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree
ORDER BY depth, name;
```

### Window Functions

```sql
-- Rank users by order count within each region
SELECT
    user_id,
    region,
    order_count,
    RANK() OVER (PARTITION BY region ORDER BY order_count DESC) AS rank,
    SUM(order_count) OVER (PARTITION BY region) AS region_total,
    LAG(order_count) OVER (PARTITION BY region ORDER BY order_count DESC) AS prev_count
FROM user_stats;
```

### Finding Duplicates

```sql
SELECT email, COUNT(*) AS count
FROM users
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

### Gap Detection

```sql
-- Find missing IDs in a sequence
SELECT t1.id + 1 AS gap_start,
       MIN(t2.id) - 1 AS gap_end
FROM orders t1
INNER JOIN orders t2 ON t2.id > t1.id
WHERE NOT EXISTS (
    SELECT 1 FROM orders t3
    WHERE t3.id = t1.id + 1
)
GROUP BY t1.id;
```

## Index Optimization

### When to Add Indexes

- Columns in WHERE clauses used frequently
- Columns used in JOIN conditions
- Columns used in ORDER BY
- Columns with high cardinality (many unique values)

### When NOT to Index

- Small tables (< 1000 rows)
- Columns with low cardinality (boolean, status with few values)
- Tables with heavy write operations (indexes slow inserts/updates)
- Columns rarely used in queries

### Composite Index Order

The leftmost column should be the most selective:

```sql
-- If you query by (status, created_at) frequently:
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

-- This index supports:
-- WHERE status = 'active'                          (yes)
-- WHERE status = 'active' AND created_at > '...'   (yes)
-- WHERE created_at > '...'                          (no - wrong prefix)
```

### Covering Indexes

Include all queried columns to avoid table lookups:

```sql
-- If your query only needs these columns:
SELECT user_id, status, created_at FROM orders WHERE status = 'active';

-- Create a covering index:
CREATE INDEX idx_orders_covering ON orders (status, user_id, created_at);
```

## Performance Anti-Patterns

### Avoid SELECT *

```sql
-- BAD: fetches all columns, prevents covering index usage
SELECT * FROM users WHERE status = 'active';

-- GOOD: fetch only what you need
SELECT id, name, email FROM users WHERE status = 'active';
```

### Avoid Functions on Indexed Columns

```sql
-- BAD: prevents index usage on created_at
WHERE YEAR(created_at) = 2025

-- GOOD: uses index
WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'
```

### Avoid N+1 Queries

```sql
-- BAD: one query per user to get their orders
-- Application does: for each user, SELECT * FROM orders WHERE user_id = ?

-- GOOD: single query with JOIN
SELECT u.id, u.name, o.id AS order_id, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active';
```

### Use EXISTS Instead of IN for Subqueries

```sql
-- Slower for large subquery results
SELECT * FROM users
WHERE id IN (SELECT user_id FROM orders WHERE amount > 100);

-- Faster: stops at first match
SELECT * FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = u.id AND o.amount > 100
);
```

## EXPLAIN Analysis

Always check query plans for slow queries:

```sql
-- PostgreSQL
EXPLAIN ANALYZE SELECT ...;

-- MySQL
EXPLAIN SELECT ...;
```

Key things to look for:
- **Seq Scan** on large tables (consider adding an index)
- **Nested Loop** with large inner tables (consider Hash Join)
- **Sort** operations on large datasets (consider index-based ordering)
- **High row estimates** vs. actual rows (update table statistics)

## Transaction Best Practices

```sql
BEGIN;

-- Keep transactions short
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- Always handle the outcome
COMMIT;  -- or ROLLBACK on error
```

- Keep transactions as short as possible
- Avoid user interaction during open transactions
- Use appropriate isolation levels (READ COMMITTED is usually sufficient)
- Always handle deadlocks with retry logic in application code
