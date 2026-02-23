---
name: github-cli
description: Use GitHub CLI (gh) to query repositories, issues, pull requests, and releases.
emoji: 🐙
---

# GitHub CLI

Use `gh` to interact with GitHub.

## Commands

- `gh repo view <owner/repo>` — repo details (stars, forks, description)
- `gh issue list -R <owner/repo>` — list issues
- `gh pr list -R <owner/repo>` — list pull requests
- `gh release list -R <owner/repo>` — list releases
- `gh search repos <query>` — search repos

Use `--json` for structured output when you need specific fields.

## Examples

- Stars count: `gh repo view owner/repo --json stargazerCount -q '.stargazerCount'`
- Latest release: `gh release view -R owner/repo --json tagName,publishedAt`
- Open issues count: `gh issue list -R owner/repo --state open --json number -q 'length'`
