---
name: code-review
description: Code review checklist, standards, and best practices for thorough reviews
emoji: "\U0001F50D"
name_zh: 代码审查
description_zh: 代码审查清单、标准与最佳实践
---

## Code Review Guide

When reviewing code, follow this structured approach to ensure thorough, constructive, and consistent reviews.

## Pre-Review Checklist

Before diving into the code, verify:

- [ ] The PR/MR description clearly states the purpose of the change
- [ ] The branch is up to date with the target branch
- [ ] CI/CD pipeline passes (tests, linting, build)
- [ ] The scope of changes is reasonable (not too large)

## Review Categories

### 1. Correctness

- Does the code do what it claims to do?
- Are edge cases handled (null, empty, boundary values)?
- Are error conditions handled gracefully?
- Is there potential for off-by-one errors?
- Are race conditions possible in concurrent code?

### 2. Security

- No hardcoded secrets, API keys, or credentials
- User input is validated and sanitized
- SQL queries use parameterized statements (no string concatenation)
- Authentication and authorization checks are in place
- Sensitive data is not logged or exposed in error messages

```python
# BAD - SQL injection risk
query = f"SELECT * FROM users WHERE id = {user_id}"

# GOOD - Parameterized query
query = "SELECT * FROM users WHERE id = %s"
cursor.execute(query, (user_id,))
```

### 3. Performance

- No N+1 query problems
- Appropriate use of indexes for database queries
- Large datasets are paginated
- Expensive operations are cached when appropriate
- No unnecessary re-renders (frontend) or recomputations

### 4. Readability & Maintainability

- Variable and function names are descriptive and consistent
- Functions are small and do one thing (Single Responsibility)
- Complex logic has explanatory comments
- No dead code or commented-out code blocks
- Magic numbers are replaced with named constants

```javascript
// BAD
if (user.role === 3) { ... }

// GOOD
const ROLE_ADMIN = 3;
if (user.role === ROLE_ADMIN) { ... }
```

### 5. Architecture & Design

- Changes follow existing project patterns and conventions
- No unnecessary coupling between modules
- Abstractions are at the right level (not over-engineered)
- Dependencies are injected, not hardcoded
- Public API surface is minimal and well-defined

### 6. Testing

- New functionality has corresponding tests
- Tests cover happy path and error cases
- Tests are deterministic (no flaky tests)
- Test names describe the scenario being tested
- Mocks and stubs are used appropriately

```javascript
// GOOD test naming
describe('UserService.createUser', () => {
  it('should return the created user with an assigned ID', () => { ... });
  it('should throw ValidationError when email is invalid', () => { ... });
  it('should throw ConflictError when email already exists', () => { ... });
});
```

## Review Comment Guidelines

### Be Constructive

- Explain *why* something should change, not just *what*
- Suggest alternatives when pointing out issues
- Distinguish between blockers, suggestions, and nits

### Comment Prefixes

Use these prefixes for clarity:

| Prefix | Meaning |
|--------|---------|
| `blocker:` | Must be fixed before merge |
| `suggestion:` | Recommended but not required |
| `nit:` | Minor style/preference issue |
| `question:` | Need clarification on intent |
| `praise:` | Something done well |

### Example Comments

```
blocker: This endpoint doesn't validate the `email` field, which could
allow malformed data into the database. Consider adding email format
validation using the existing `validateEmail()` utility.

nit: This variable could be named `userCount` instead of `cnt` for clarity.

praise: Nice use of the Strategy pattern here - makes it easy to add new
payment providers in the future.
```

## Review Workflow

1. **Understand Context**: Read the PR description and linked issues first
2. **High-Level Pass**: Scan the file list and overall structure
3. **Detailed Review**: Go through each file methodically
4. **Test Locally**: For significant changes, pull the branch and test
5. **Summarize**: Leave an overall review summary with your verdict

### Verdict Options

- **Approve**: Code is good to merge (minor nits are acceptable)
- **Request Changes**: Blockers exist that must be addressed
- **Comment**: Feedback provided but no strong opinion on merge readiness

## Common Anti-Patterns to Watch For

- **God objects/functions**: Classes or functions doing too many things
- **Premature optimization**: Complexity added without measured need
- **Copy-paste code**: Duplicated logic that should be extracted
- **Stringly-typed**: Using strings where enums or types would be safer
- **Swallowed exceptions**: Catching errors without handling or logging them
- **Temporal coupling**: Code that only works if called in a specific order

## Metrics for Large PRs

If a PR has more than 400 lines of changes, suggest breaking it into smaller PRs. Large PRs lead to:
- Superficial reviews (reviewer fatigue)
- Higher risk of bugs slipping through
- Harder to revert if issues arise
- Longer review cycles
