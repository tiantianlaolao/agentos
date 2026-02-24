---
name: technical-writer
description: Technical documentation writing guide with templates for APIs, guides, and reference docs
emoji: "\U0001F4D6"
name_zh: 技术文档
description_zh: 技术文档撰写规范与模板
---

## Technical Documentation Writing Guide

Write clear, accurate, and maintainable technical documentation that helps users accomplish their goals.

## Documentation Types

### 1. Tutorials (Learning-Oriented)

Purpose: Walk a beginner through a complete exercise.

```markdown
# Getting Started with [Product]

## What You'll Build
A brief description of the end result.

## Prerequisites
- [Requirement 1]
- [Requirement 2]

## Step 1: Set Up Your Environment
[Detailed instructions with commands/screenshots]

## Step 2: Create Your First [Thing]
[Detailed instructions]

## Step 3: [Next Step]
[Detailed instructions]

## What's Next
- Link to more advanced tutorials
- Link to reference documentation
```

**Rules for Tutorials:**
- Start with a working example, not theory
- Every step should produce a visible result
- Don't explain concepts in depth (link to explanation docs instead)
- The reader should succeed on the first try

### 2. How-To Guides (Task-Oriented)

Purpose: Help users solve a specific problem.

```markdown
# How to [Accomplish Task]

## Overview
Brief context on when and why you'd do this.

## Steps

### 1. [Do this]
[Instructions]

### 2. [Do this]
[Instructions]

## Variations
- If you need [variation], do [alternative step]

## See Also
- [Related how-to guide]
```

**Rules for How-To Guides:**
- Assume the reader knows the basics
- Focus on the goal, not the learning
- Provide multiple approaches when relevant
- Include troubleshooting tips

### 3. Reference (Information-Oriented)

Purpose: Describe the system accurately and completely.

```markdown
# [API/Module/Class] Reference

## Overview
One-paragraph description of what this does.

## Methods

### `methodName(param1, param2)`

Description of what this method does.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| param1 | string | Yes | Description |
| param2 | number | No | Description. Default: `10` |

**Returns:** `Promise<Result>` - Description of return value.

**Throws:**
- `ValidationError` - When param1 is empty
- `NotFoundError` - When the resource doesn't exist

**Example:**
```javascript
const result = await methodName('value', 42);
console.log(result);
// { id: 1, status: 'success' }
```

```

**Rules for Reference Docs:**
- Be complete and accurate
- Use consistent formatting across all entries
- Include types, defaults, and constraints
- Show a realistic example for every method/endpoint

### 4. Explanation (Understanding-Oriented)

Purpose: Help users understand concepts and design decisions.

```markdown
# Understanding [Concept]

## What is [Concept]?
High-level explanation in plain language.

## Why does [Concept] matter?
The problem it solves and why the reader should care.

## How [Concept] works
Detailed explanation with diagrams.

## Trade-offs and alternatives
When to use this vs. other approaches.
```

## Writing Principles

### Use Plain Language

```
BAD:  "Utilize the aforementioned endpoint to instantiate a new entity."
GOOD: "Use this endpoint to create a new record."

BAD:  "The system leverages a multi-tiered caching architecture."
GOOD: "The system uses three levels of caching."
```

### Be Direct

```
BAD:  "It should be noted that you might want to consider..."
GOOD: "Do this when..."

BAD:  "The configuration file can optionally be modified to..."
GOOD: "To change [behavior], edit the configuration file:"
```

### Use Active Voice

```
BAD:  "The file is read by the parser."
GOOD: "The parser reads the file."

BAD:  "An error will be thrown if the input is invalid."
GOOD: "The function throws an error if the input is invalid."
```

### Be Consistent

Pick one term and stick with it throughout:
- Don't alternate between "user", "customer", "client", "account holder"
- Don't switch between "click", "tap", "select", "press"
- Use a glossary for domain-specific terms

## Formatting Guidelines

### Code Blocks

Always specify the language for syntax highlighting:

````markdown
```javascript
const config = {
  apiKey: process.env.API_KEY,
  timeout: 5000,
};
```
````

### Admonitions (Notes, Warnings, Tips)

```markdown
> **Note**: This feature requires version 2.0 or later.

> **Warning**: This action is irreversible. Back up your data first.

> **Tip**: You can use the `--dry-run` flag to preview changes
> without applying them.
```

### Tables

Use tables for structured comparisons or parameter lists:

```markdown
| Plan | Storage | API Calls | Price |
|------|---------|-----------|-------|
| Free | 1 GB | 1,000/day | $0 |
| Pro | 50 GB | 50,000/day | $29/mo |
| Enterprise | Unlimited | Unlimited | Custom |
```

### Lists

- Use **numbered lists** for sequential steps (order matters)
- Use **bullet lists** for non-sequential items (order doesn't matter)
- Keep list items parallel in structure

## API Documentation Template

```markdown
# [Endpoint Name]

`POST /api/v1/users`

Create a new user account.

## Request

### Headers
| Header | Value | Required |
|--------|-------|----------|
| Authorization | Bearer {token} | Yes |
| Content-Type | application/json | Yes |

### Body
```json
{
  "name": "Alice Smith",
  "email": "alice@example.com",
  "role": "editor"
}
```

### Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Full name (2-100 chars) |
| email | string | Yes | Valid email address |
| role | string | No | One of: viewer, editor, admin. Default: viewer |

## Response

### 201 Created
```json
{
  "id": 456,
  "name": "Alice Smith",
  "email": "alice@example.com",
  "role": "editor",
  "createdAt": "2025-01-15T09:30:00Z"
}
```

### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format"
  }
}
```

### 409 Conflict
Returned when the email is already registered.
```

## Documentation Review Checklist

- [ ] Technically accurate (code examples tested and working)
- [ ] Complete (no missing parameters, options, or edge cases)
- [ ] Clear and concise (no jargon without explanation)
- [ ] Well-organized (logical flow, proper headings)
- [ ] Consistent (terminology, formatting, style)
- [ ] Up to date (matches the current version of the software)
- [ ] Includes examples for every feature/endpoint
- [ ] Links to related documentation
- [ ] Spell-checked and grammar-checked
