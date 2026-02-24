---
name: debugging-guide
description: Systematic debugging methodology and techniques for finding and fixing software bugs
emoji: "\U0001F41B"
name_zh: 调试指南
description_zh: 系统化调试方法与排错技巧
---

## Systematic Debugging Guide

A structured approach to finding and fixing bugs efficiently, regardless of language or platform.

## The Debugging Mindset

1. **Don't guess randomly** - Follow a systematic process
2. **Reproduce first** - You can't fix what you can't see
3. **Change one thing at a time** - Isolate variables
4. **Read the error message carefully** - Most errors tell you exactly what's wrong
5. **Question your assumptions** - The bug is often where you least expect it

## The Debugging Process

### Step 1: Reproduce the Bug

Before anything else, create reliable reproduction steps:

```
1. Clear reproduction steps (minimum viable case)
2. Expected behavior vs. actual behavior
3. Environment details (OS, version, browser, etc.)
4. Frequency: always, intermittent, or one-time?
```

If you can't reproduce it:
- Check logs for the exact timestamp and conditions
- Try different environments (dev, staging, production)
- Look for race conditions or timing-dependent issues
- Check if it's data-dependent (specific user, specific input)

### Step 2: Isolate the Problem

Use **binary search debugging** to narrow down the source:

- **In code**: Comment out half the code, see if the bug persists, repeat
- **In commits**: Use `git bisect` to find the introducing commit
- **In data**: Test with minimal input, gradually add complexity
- **In the stack**: Test each layer independently (frontend, API, database)

```bash
# Git bisect to find the bad commit
git bisect start
git bisect bad                  # Current commit is broken
git bisect good v1.2.0          # This version was working
# Git checks out a middle commit, test it, then:
git bisect good   # or   git bisect bad
# Repeat until the first bad commit is found
```

### Step 3: Understand the Root Cause

Don't stop at the surface symptom. Ask "why" five times:

```
Bug: Users see a blank page after login
Why? -> The dashboard component throws an error
Why? -> user.profile is undefined
Why? -> The API returns null for new users
Why? -> The profile isn't created during registration
Why? -> The registration endpoint skips profile creation when OAuth is used
Root cause: Missing profile initialization in OAuth registration flow
```

### Step 4: Fix and Verify

- Fix the root cause, not just the symptom
- Write a test that would have caught this bug
- Test the fix with the original reproduction steps
- Check for similar issues elsewhere in the codebase
- Consider edge cases the fix might introduce

## Debugging Techniques

### Print/Log Debugging

The simplest and often most effective approach:

```python
# Strategic logging
import logging
logger = logging.getLogger(__name__)

def process_order(order):
    logger.debug(f"Processing order: {order.id}, items: {len(order.items)}")

    for item in order.items:
        logger.debug(f"  Item {item.id}: quantity={item.qty}, price={item.price}")

    total = calculate_total(order)
    logger.info(f"Order {order.id} total: {total}")

    return total
```

```javascript
// Use console.table for arrays/objects
console.table(users);

// Use console.group for nested output
console.group('Order Processing');
console.log('Order ID:', order.id);
console.log('Items:', order.items);
console.groupEnd();

// Use console.time for performance
console.time('api-call');
await fetchData();
console.timeEnd('api-call');  // api-call: 234.5ms
```

### Rubber Duck Debugging

Explain the code line by line to someone (or something). The act of articulating the problem often reveals the answer:

1. State the problem clearly
2. Walk through the code explaining what each line does
3. Explain what you *expect* to happen at each step
4. Note where the expectation diverges from reality

### Debugger Usage

#### VS Code (JavaScript/TypeScript/Python)

```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug App",
  "program": "${workspaceFolder}/src/index.js",
  "env": { "NODE_ENV": "development" }
}
```

Key debugger actions:
- **Breakpoint**: Pause execution at a line
- **Conditional breakpoint**: Pause only when condition is true
- **Watch**: Monitor variable values
- **Call stack**: See the chain of function calls
- **Step over/into/out**: Navigate through execution

#### Chrome DevTools (Frontend)

- **Network tab**: Check request/response payloads and timing
- **Console**: Test expressions, inspect objects
- **Sources**: Set breakpoints, step through code
- **Performance**: Profile rendering and scripting time
- **Application**: Inspect storage (cookies, localStorage, IndexedDB)

### Divide and Conquer

For complex systems, test each component in isolation:

```
Full Stack Bug Investigation:
1. Is the data correct in the database? (Query directly)
2. Does the API return correct data? (Use curl/Postman)
3. Does the frontend receive the correct data? (Network tab)
4. Does the frontend render the data correctly? (React DevTools)
```

## Common Bug Categories

### Off-by-One Errors

```python
# BAD: misses the last element
for i in range(len(items) - 1):
    process(items[i])

# Check: should this be < or <=? range(n) or range(n+1)?
```

### Null/Undefined Reference

```javascript
// Defensive access
const city = user?.address?.city ?? 'Unknown';

// Check for null/undefined before operations
if (data && data.items && data.items.length > 0) {
    processItems(data.items);
}
```

### Race Conditions

```javascript
// BAD: race condition on shared state
let count = 0;
async function increment() {
    const current = count;      // Read
    await someAsyncWork();       // Other calls may modify count
    count = current + 1;         // Write stale value
}

// GOOD: use atomic operations or locks
```

### State Mutation Bugs

```javascript
// BAD: mutating state directly
const newItems = items;
newItems.push(newItem);  // Mutates original array!

// GOOD: create new reference
const newItems = [...items, newItem];
```

### Timezone/Date Issues

```python
# Always use UTC internally, convert for display only
from datetime import datetime, timezone

now = datetime.now(timezone.utc)  # Not datetime.now()
```

## Debugging Checklist

When stuck, go through this checklist:

- [ ] Have I read the full error message and stack trace?
- [ ] Have I checked the logs at the time of the error?
- [ ] Can I reproduce it consistently?
- [ ] What changed recently? (code, config, dependencies, data)
- [ ] Does it work in a different environment?
- [ ] Have I checked for similar issues in the issue tracker?
- [ ] Have I searched the error message online?
- [ ] Have I checked the documentation for the library/API involved?
- [ ] Have I tried a minimal reproduction case?
- [ ] Have I asked a colleague for a fresh perspective?

## Post-Mortem Template

After fixing a significant bug, document it:

```
## Bug Summary
What happened and what was the impact?

## Timeline
When was it introduced? When was it detected? When was it fixed?

## Root Cause
What was the underlying cause?

## Fix
What was changed to resolve it?

## Prevention
What can we do to prevent similar bugs?
- [ ] Add regression test
- [ ] Improve monitoring/alerting
- [ ] Update documentation
- [ ] Add input validation
```
