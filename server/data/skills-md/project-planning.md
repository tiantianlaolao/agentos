---
name: project-planning
description: Project planning methodology with agile frameworks, milestone tracking, and risk management
emoji: "\U0001F4C5"
name_zh: 项目规划
description_zh: 项目规划、任务分解与进度管理
---

## Project Planning Guide

Plan, execute, and deliver projects on time with structured methodologies and practical frameworks.

## Project Kickoff Template

```markdown
# Project: [Name]

## Overview
**Objective:** [One sentence: what are we building and why]
**Success Metrics:** [How we'll measure success]
**Timeline:** [Start date] - [Target date]
**Team:** [List of team members and roles]
**Stakeholders:** [List of key stakeholders]

## Problem Statement
[2-3 sentences describing the problem we're solving]

## Scope
### In Scope
- [Feature/deliverable 1]
- [Feature/deliverable 2]

### Out of Scope
- [Explicitly excluded items]
- [Items deferred to future phases]

## Key Milestones
| Milestone | Target Date | Success Criteria |
|-----------|-------------|-----------------|
| Design complete | Week 2 | Approved mockups |
| MVP ready | Week 6 | Core features working |
| Beta launch | Week 8 | 50 beta users onboarded |
| GA launch | Week 10 | Public launch complete |

## Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| [Risk 1] | High | Medium | [Plan] |

## Dependencies
- [External dependency 1]
- [Team/system dependency 2]
```

## Agile / Scrum Framework

### Sprint Structure (2-week sprints)

```
Week 1:
  Mon: Sprint Planning (2 hrs)
  Tue-Fri: Development
  Daily: Standup (15 min)

Week 2:
  Mon-Wed: Development
  Thu: Feature freeze, testing
  Fri: Sprint Review (1 hr) + Retrospective (1 hr)
```

### User Story Format

```
As a [type of user],
I want to [action/goal],
so that [benefit/reason].

Acceptance Criteria:
- [ ] [Criterion 1: specific, testable condition]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

Example:
As a returning customer,
I want to save my payment method,
so that I can check out faster on future purchases.

Acceptance Criteria:
- [ ] User can add a credit card from the checkout page
- [ ] Card details are stored securely (tokenized, not raw)
- [ ] Saved cards appear as options on next checkout
- [ ] User can delete saved payment methods from settings
```

### Story Point Estimation

Use the Fibonacci scale for relative sizing:

| Points | Meaning | Example |
|--------|---------|---------|
| 1 | Trivial | Fix a typo, update a config value |
| 2 | Small | Add a new field to an API response |
| 3 | Medium | Build a simple CRUD form |
| 5 | Large | Implement search with filters |
| 8 | Very large | Build an auth system with OAuth |
| 13 | Epic-sized | Consider breaking into smaller stories |

**Estimation Tips:**
- Compare stories relative to each other, not in absolute hours
- If the team disagrees by more than 2x, discuss and re-estimate
- Include testing, code review, and documentation time
- When uncertain, estimate higher (optimism bias is real)

### Sprint Planning Checklist

- [ ] Backlog is refined and prioritized
- [ ] Top stories have clear acceptance criteria
- [ ] Dependencies are identified and unblocked
- [ ] Team capacity is calculated (account for PTO, meetings, on-call)
- [ ] Sprint goal is defined in one sentence
- [ ] Team commits to the sprint backlog (not imposed by management)

## Work Breakdown Structure (WBS)

Break large projects into manageable pieces:

```
Project: E-Commerce Checkout Redesign
├── 1. Research & Design
│   ├── 1.1 Competitive analysis
│   ├── 1.2 User interviews (5 users)
│   ├── 1.3 Wireframes
│   └── 1.4 High-fidelity mockups
├── 2. Frontend Development
│   ├── 2.1 Cart summary component
│   ├── 2.2 Shipping address form
│   ├── 2.3 Payment integration
│   └── 2.4 Order confirmation page
├── 3. Backend Development
│   ├── 3.1 Order processing API
│   ├── 3.2 Payment gateway integration
│   └── 3.3 Email notification service
├── 4. Testing
│   ├── 4.1 Unit tests
│   ├── 4.2 Integration tests
│   └── 4.3 UAT with stakeholders
└── 5. Launch
    ├── 5.1 Staged rollout (10% → 50% → 100%)
    ├── 5.2 Monitoring and alerting setup
    └── 5.3 Documentation update
```

## Risk Management

### Risk Assessment Matrix

```
                    IMPACT
              Low    Medium    High
         ┌─────────┬─────────┬─────────┐
   High  │ Medium  │  High   │ Critical│
PROB.    ├─────────┼─────────┼─────────┤
   Med   │  Low    │ Medium  │  High   │
         ├─────────┼─────────┼─────────┤
   Low   │  Low    │  Low    │ Medium  │
         └─────────┴─────────┴─────────┘
```

### Risk Response Strategies

| Strategy | Description | Example |
|----------|-------------|---------|
| **Avoid** | Eliminate the risk by changing plan | Use a proven library instead of building custom |
| **Mitigate** | Reduce probability or impact | Add automated tests to catch regressions |
| **Transfer** | Shift risk to a third party | Use a managed database instead of self-hosted |
| **Accept** | Acknowledge and monitor | Minor UI inconsistency - fix in next sprint |

## Status Reporting

### Weekly Status Update Template

```markdown
# Project Status - Week of [Date]

## Overall Status: 🟢 On Track / 🟡 At Risk / 🔴 Behind

## Summary
[1-2 sentences on overall progress]

## Completed This Week
- [Accomplishment 1]
- [Accomplishment 2]

## In Progress
- [Task 1] - [% complete] - [owner]
- [Task 2] - [% complete] - [owner]

## Planned for Next Week
- [Planned task 1]
- [Planned task 2]

## Blockers / Risks
- [Blocker]: [Impact and what's needed to resolve]

## Key Metrics
- Sprint velocity: [X] story points
- Bug count: [X] open / [X] resolved this week
- Timeline: [X] days ahead/behind schedule
```

## Common Planning Pitfalls

1. **Planning fallacy**: Tasks always take longer than expected. Add 20-30% buffer.
2. **Scope creep**: Say no to features not in the original scope. Log them for future consideration.
3. **Missing dependencies**: Map all external dependencies before committing to dates.
4. **Hero culture**: Don't plan around individual heroics. Plan for sustainable pace.
5. **No definition of done**: Define "done" upfront (coded, tested, reviewed, documented, deployed).
6. **Ignoring technical debt**: Allocate 15-20% of sprint capacity for maintenance and debt reduction.
