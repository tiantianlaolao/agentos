---
name: api-design
description: RESTful API design best practices, naming conventions, and error handling patterns
emoji: "\U0001F310"
name_zh: API 设计
description_zh: RESTful API 设计原则与最佳实践
---

## RESTful API Design Guide

Design consistent, intuitive, and maintainable APIs by following these established conventions and patterns.

## URL Structure

### Resource Naming

- Use **nouns**, not verbs: `/users` not `/getUsers`
- Use **plural** form: `/articles` not `/article`
- Use **kebab-case** for multi-word resources: `/user-profiles`
- Nest resources to show relationships: `/users/123/orders`
- Limit nesting to 2 levels maximum

```
GET    /api/v1/users              # List users
POST   /api/v1/users              # Create user
GET    /api/v1/users/123          # Get user 123
PUT    /api/v1/users/123          # Full update user 123
PATCH  /api/v1/users/123          # Partial update user 123
DELETE /api/v1/users/123          # Delete user 123
GET    /api/v1/users/123/orders   # List orders for user 123
```

### Versioning

Include the API version in the URL path:

```
/api/v1/users
/api/v2/users
```

Alternatives (less recommended): header-based (`Accept: application/vnd.myapi.v1+json`) or query parameter (`?version=1`).

## HTTP Methods

| Method | Purpose | Idempotent | Safe |
|--------|---------|------------|------|
| GET | Retrieve resource(s) | Yes | Yes |
| POST | Create a resource | No | No |
| PUT | Replace a resource entirely | Yes | No |
| PATCH | Partially update a resource | Yes | No |
| DELETE | Remove a resource | Yes | No |

### PUT vs PATCH

```json
// PUT /users/123 - replaces the entire resource
{
  "name": "Alice",
  "email": "alice@example.com",
  "role": "admin"
}

// PATCH /users/123 - updates only specified fields
{
  "role": "admin"
}
```

## Request & Response Format

### Request Headers

```
Content-Type: application/json
Authorization: Bearer <token>
Accept: application/json
Accept-Language: en-US
```

### Successful Responses

Single resource:
```json
{
  "id": 123,
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2025-01-15T09:30:00Z"
}
```

Collection with pagination:
```json
{
  "data": [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": "Bob" }
  ],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Error Responses

Use a consistent error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address"
      },
      {
        "field": "age",
        "message": "Must be a positive integer"
      }
    ]
  }
}
```

## HTTP Status Codes

### Success (2xx)

| Code | When to Use |
|------|-------------|
| 200 OK | Successful GET, PUT, PATCH, or DELETE |
| 201 Created | Successful POST that creates a resource |
| 204 No Content | Successful DELETE with no response body |

### Client Errors (4xx)

| Code | When to Use |
|------|-------------|
| 400 Bad Request | Malformed syntax or invalid parameters |
| 401 Unauthorized | Missing or invalid authentication |
| 403 Forbidden | Authenticated but lacks permission |
| 404 Not Found | Resource does not exist |
| 409 Conflict | Resource state conflict (duplicate, version mismatch) |
| 422 Unprocessable Entity | Valid syntax but semantic errors (validation) |
| 429 Too Many Requests | Rate limit exceeded |

### Server Errors (5xx)

| Code | When to Use |
|------|-------------|
| 500 Internal Server Error | Unexpected server failure |
| 502 Bad Gateway | Upstream service failure |
| 503 Service Unavailable | Temporary overload or maintenance |

## Filtering, Sorting, and Pagination

### Filtering

Use query parameters for filtering:

```
GET /api/v1/orders?status=shipped&customerId=123
GET /api/v1/products?minPrice=10&maxPrice=100
GET /api/v1/users?role=admin&createdAfter=2025-01-01
```

### Sorting

```
GET /api/v1/products?sort=price         # Ascending
GET /api/v1/products?sort=-price        # Descending
GET /api/v1/products?sort=-createdAt,name  # Multiple fields
```

### Pagination

Offset-based (simple but slow for large datasets):
```
GET /api/v1/users?page=2&perPage=20
```

Cursor-based (efficient for large datasets):
```
GET /api/v1/users?cursor=eyJpZCI6MTIzfQ&limit=20
```

## Authentication Patterns

### Bearer Token (JWT)

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### API Key

```
X-API-Key: sk_live_abc123def456
```

Best practice: use short-lived access tokens with long-lived refresh tokens.

## Rate Limiting

Include rate limit info in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1620000000
Retry-After: 60
```

## HATEOAS (Hypermedia Links)

Include navigational links in responses:

```json
{
  "id": 123,
  "name": "Alice",
  "_links": {
    "self": { "href": "/api/v1/users/123" },
    "orders": { "href": "/api/v1/users/123/orders" },
    "profile": { "href": "/api/v1/users/123/profile" }
  }
}
```

## API Design Checklist

- [ ] Resource names are plural nouns
- [ ] Consistent naming convention throughout
- [ ] Proper HTTP methods for each operation
- [ ] Appropriate status codes for all responses
- [ ] Consistent error response format
- [ ] Pagination for all list endpoints
- [ ] Input validation with clear error messages
- [ ] Rate limiting in place
- [ ] Authentication on protected endpoints
- [ ] API versioning strategy defined
- [ ] CORS headers configured correctly
- [ ] Request/response examples documented
