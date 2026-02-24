---
name: python-best-practices
description: Python coding standards, idioms, and best practices for clean, Pythonic code
emoji: "\U0001F40D"
name_zh: Python 最佳实践
description_zh: Python 编程规范与最佳实践
---

## Python Best Practices

Write clean, idiomatic Python code by following these conventions and patterns.

## Code Style (PEP 8)

### Naming Conventions

```python
# Variables and functions: snake_case
user_name = "Alice"
def calculate_total(items):
    pass

# Classes: PascalCase
class UserProfile:
    pass

# Constants: UPPER_SNAKE_CASE
MAX_RETRY_COUNT = 3
DEFAULT_TIMEOUT = 30

# Private: prefix with underscore
class MyClass:
    def __init__(self):
        self._internal_state = {}     # Convention: private
        self.__mangled_name = True     # Name mangling (rarely needed)
```

### Imports

```python
# Standard library first, then third-party, then local
import os
import sys
from collections import defaultdict
from pathlib import Path

import requests
from flask import Flask, jsonify

from myapp.models import User
from myapp.utils import validate_email
```

## Pythonic Idioms

### Use List/Dict/Set Comprehensions

```python
# BAD
squares = []
for x in range(10):
    squares.append(x ** 2)

# GOOD
squares = [x ** 2 for x in range(10)]

# Dictionary comprehension
user_map = {u.id: u.name for u in users}

# Set comprehension
unique_domains = {email.split('@')[1] for email in emails}

# With filtering
active_users = [u for u in users if u.is_active]
```

### Use Unpacking

```python
# Tuple unpacking
first, *rest = [1, 2, 3, 4, 5]   # first=1, rest=[2,3,4,5]

# Swap variables
a, b = b, a

# Dictionary unpacking
defaults = {"color": "blue", "size": "medium"}
custom = {"color": "red"}
merged = {**defaults, **custom}   # {"color": "red", "size": "medium"}
```

### Use Context Managers

```python
# BAD
f = open("data.txt")
try:
    data = f.read()
finally:
    f.close()

# GOOD
with open("data.txt") as f:
    data = f.read()

# Custom context manager
from contextlib import contextmanager

@contextmanager
def timer(label):
    start = time.time()
    try:
        yield
    finally:
        elapsed = time.time() - start
        print(f"{label}: {elapsed:.3f}s")

with timer("data processing"):
    process_data()
```

### Use enumerate and zip

```python
# BAD
for i in range(len(items)):
    print(i, items[i])

# GOOD
for i, item in enumerate(items):
    print(i, item)

# Iterate two lists together
for name, score in zip(names, scores):
    print(f"{name}: {score}")
```

### Use f-strings

```python
# BAD
message = "Hello, " + name + "! You have " + str(count) + " messages."
message = "Hello, %s! You have %d messages." % (name, count)

# GOOD
message = f"Hello, {name}! You have {count} messages."
message = f"Total: ${amount:,.2f}"  # Formatting: $1,234.56
message = f"{'centered':^20}"       # Padding/alignment
```

## Function Design

### Use Type Hints

```python
from typing import Optional

def find_user(
    user_id: int,
    include_inactive: bool = False,
) -> Optional[dict]:
    """Find a user by ID.

    Args:
        user_id: The unique identifier of the user.
        include_inactive: Whether to include deactivated users.

    Returns:
        A dictionary with user data, or None if not found.

    Raises:
        ValueError: If user_id is negative.
    """
    if user_id < 0:
        raise ValueError(f"user_id must be non-negative, got {user_id}")
    ...
```

### Use Dataclasses

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class User:
    id: int
    name: str
    email: str
    roles: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)

    @property
    def is_admin(self) -> bool:
        return "admin" in self.roles

# Usage
user = User(id=1, name="Alice", email="alice@example.com")
print(user)  # User(id=1, name='Alice', email='alice@example.com', ...)
```

### Avoid Mutable Default Arguments

```python
# BAD - mutable default is shared across calls
def add_item(item, items=[]):
    items.append(item)
    return items

# GOOD
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```

## Error Handling

```python
# Be specific with exceptions
try:
    result = api_call()
except ConnectionError:
    logger.warning("API connection failed, using cache")
    result = get_from_cache()
except TimeoutError:
    logger.error("API timed out")
    raise
except Exception as e:
    # Last resort - log and re-raise
    logger.exception(f"Unexpected error: {e}")
    raise

# Custom exceptions
class UserNotFoundError(Exception):
    def __init__(self, user_id: int):
        self.user_id = user_id
        super().__init__(f"User {user_id} not found")
```

## Working with Collections

```python
from collections import Counter, defaultdict

# Counter for frequency analysis
words = ["apple", "banana", "apple", "cherry", "banana", "apple"]
counts = Counter(words)
# Counter({'apple': 3, 'banana': 2, 'cherry': 1})
most_common = counts.most_common(2)  # [('apple', 3), ('banana', 2)]

# defaultdict for grouping
groups = defaultdict(list)
for item in items:
    groups[item.category].append(item)

# dict.get() with default
config = {"debug": True}
verbose = config.get("verbose", False)  # Returns False, no KeyError

# Walrus operator (Python 3.8+)
if (n := len(items)) > 10:
    print(f"Too many items: {n}")
```

## Project Structure

```
myproject/
    src/
        myproject/
            __init__.py
            main.py
            models/
            services/
            utils/
    tests/
        test_models.py
        test_services.py
    pyproject.toml
    requirements.txt
```

## Testing

```python
import pytest

class TestUserService:
    def test_create_user_returns_user_with_id(self):
        user = UserService.create(name="Alice", email="a@b.com")
        assert user.id is not None
        assert user.name == "Alice"

    def test_create_user_raises_on_duplicate_email(self):
        UserService.create(name="Alice", email="a@b.com")
        with pytest.raises(DuplicateEmailError):
            UserService.create(name="Bob", email="a@b.com")

    @pytest.fixture
    def sample_user(self):
        return User(id=1, name="Test", email="test@example.com")

    @pytest.mark.parametrize("email,valid", [
        ("user@example.com", True),
        ("invalid", False),
        ("", False),
    ])
    def test_email_validation(self, email, valid):
        assert validate_email(email) == valid
```

## Performance Tips

```python
# Use generators for large datasets
def read_large_file(path):
    with open(path) as f:
        for line in f:
            yield line.strip()

# Use sets for membership testing
valid_ids = set(range(10000))  # O(1) lookup
if user_id in valid_ids:       # Much faster than list
    ...

# Use str.join for concatenation
parts = ["Hello", "World", "!"]
result = " ".join(parts)  # Faster than repeated +=

# Use functools.lru_cache for expensive pure functions
from functools import lru_cache

@lru_cache(maxsize=128)
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
```
