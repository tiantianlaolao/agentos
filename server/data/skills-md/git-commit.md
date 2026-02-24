---
name: git-commit
description: Git commit message conventions, branching strategies, and workflow best practices
emoji: "\U0001F4DD"
name_zh: Git 提交规范
description_zh: Git 提交信息规范与版本控制最佳实践
---

## Git Commit & Workflow Guide

Follow these conventions for clean, navigable git history that makes collaboration and debugging easier.

## Commit Message Format

Use the Conventional Commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type (Required)

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semicolons, etc. (no code change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `chore` | Build process, CI, dependency updates |
| `ci` | CI/CD configuration changes |
| `revert` | Reverts a previous commit |

### Scope (Optional)

The module or component affected: `auth`, `api`, `ui`, `db`, `config`, etc.

### Subject (Required)

- Use imperative mood: "add feature" not "added feature" or "adds feature"
- Do not capitalize the first letter
- No period at the end
- Maximum 50 characters

### Body (Optional)

- Explain *what* and *why*, not *how*
- Wrap at 72 characters
- Separate from subject with a blank line

### Footer (Optional)

- Reference issues: `Closes #123`, `Fixes #456`
- Breaking changes: `BREAKING CHANGE: description`

## Examples

### Simple commit
```
feat(auth): add OAuth2 login with Google
```

### Commit with body
```
fix(api): prevent race condition in order processing

Multiple concurrent requests for the same order could result in
duplicate charges. Added optimistic locking using a version field
on the orders table.

Fixes #789
```

### Breaking change
```
feat(api)!: change authentication header format

BREAKING CHANGE: The API now expects `Authorization: Bearer <token>`
instead of `X-Auth-Token: <token>`. All API clients must update their
request headers.
```

## Commit Best Practices

### Do

- **Commit early and often**: Small, atomic commits are easier to review and revert
- **One logical change per commit**: Don't mix refactoring with feature work
- **Test before committing**: Ensure the codebase builds and tests pass
- **Review your own diff**: Run `git diff --staged` before committing

### Don't

- **Don't commit generated files**: Add build artifacts to `.gitignore`
- **Don't commit secrets**: Use environment variables or secret managers
- **Don't use `git add .` blindly**: Stage files explicitly or review with `-p`
- **Don't rewrite shared history**: Never force-push to `main` or shared branches

## Branching Strategy

### Branch Naming

```
<type>/<ticket-id>-<short-description>

feat/PROJ-123-user-dashboard
fix/PROJ-456-login-timeout
chore/upgrade-node-20
```

### Git Flow (Simplified)

```
main ─────────────────────────────── (production)
  └── develop ────────────────────── (integration)
        ├── feat/feature-a ───────── (feature work)
        └── fix/bugfix-b ─────────── (bug fixes)
```

- `main`: Always deployable, tagged with versions
- `develop`: Integration branch for next release
- Feature branches: Created from `develop`, merged back via PR

### Trunk-Based Development (Alternative)

```
main ─────────────────────────────── (always deployable)
  ├── feat/short-lived-branch-1 ──── (1-2 days max)
  └── feat/short-lived-branch-2 ──── (1-2 days max)
```

- Feature branches are short-lived (< 2 days)
- Use feature flags for incomplete features
- Merge to `main` frequently

## Useful Git Commands

### Staging
```bash
git add -p                    # Stage changes interactively (hunk by hunk)
git reset HEAD <file>         # Unstage a file
git stash                     # Temporarily shelve changes
git stash pop                 # Restore stashed changes
```

### History
```bash
git log --oneline -20         # Compact recent history
git log --graph --oneline     # Visual branch history
git blame <file>              # See who changed each line
git log -p -- <file>          # Full history of a single file
```

### Fixing Mistakes
```bash
git commit --amend            # Modify the last commit (before push)
git revert <hash>             # Create a new commit that undoes changes
git reflog                    # Find lost commits
```

### Working with Remotes
```bash
git fetch --prune             # Fetch and clean up deleted remote branches
git pull --rebase             # Pull with rebase instead of merge
git push -u origin <branch>   # Push and set upstream tracking
```

## Pre-Commit Hooks

Set up automated checks before each commit:

```bash
# .husky/pre-commit (for Node.js projects)
npx lint-staged

# lint-staged config in package.json
{
  "lint-staged": {
    "*.{js,ts}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

## Semantic Versioning

When tagging releases, follow SemVer (`MAJOR.MINOR.PATCH`):

- **MAJOR**: Breaking changes (incompatible API changes)
- **MINOR**: New features (backward-compatible)
- **PATCH**: Bug fixes (backward-compatible)

```bash
git tag -a v1.2.0 -m "Release v1.2.0: add user dashboard"
git push origin v1.2.0
```
