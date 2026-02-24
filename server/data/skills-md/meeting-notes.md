---
name: meeting-notes
description: Meeting notes formatting, action item extraction, and effective meeting facilitation
emoji: "\U0001F4CB"
name_zh: 会议记录
description_zh: 高效会议记录与行动项跟踪
---

## Meeting Notes & Facilitation Guide

Capture, organize, and follow up on meetings effectively to ensure decisions lead to action.

## Meeting Notes Template

```markdown
# [Meeting Title]

**Date:** YYYY-MM-DD
**Time:** HH:MM - HH:MM (timezone)
**Attendees:** [names]
**Facilitator:** [name]
**Note-taker:** [name]

## Agenda
1. [Topic 1] - [owner] (X min)
2. [Topic 2] - [owner] (X min)
3. [Topic 3] - [owner] (X min)

## Discussion Notes

### [Topic 1]
- Key point discussed
- Different perspectives shared
- Decision made (if any)

### [Topic 2]
- Key point discussed
- Open questions raised

## Decisions Made
- [DECISION-1]: [What was decided] (Decided by: [name/group])
- [DECISION-2]: [What was decided]

## Action Items
| # | Action | Owner | Due Date | Status |
|---|--------|-------|----------|--------|
| 1 | [Specific task] | @name | YYYY-MM-DD | Pending |
| 2 | [Specific task] | @name | YYYY-MM-DD | Pending |

## Open Questions / Parking Lot
- [Question that needs further investigation]
- [Topic to discuss in a future meeting]

## Next Meeting
**Date:** YYYY-MM-DD | **Focus:** [topic]
```

## Note-Taking Best Practices

### During the Meeting

1. **Capture decisions verbatim**: Write down the exact wording agreed upon
2. **Record who said what**: For accountability on opinions and commitments
3. **Note disagreements**: Record differing views, not just the consensus
4. **Flag action items in real-time**: Don't wait until the end
5. **Ask for clarification**: "Just to confirm, the decision is X. Is that right?"

### Action Item Format

Every action item must have three elements:

```
WHO does WHAT by WHEN

BAD:  "Look into the performance issue"
GOOD: "@sarah: Investigate API latency spike on the /search endpoint
       and report findings to the team by Friday, Jan 17"
```

### What to Capture vs. Skip

**Capture:**
- Decisions and the reasoning behind them
- Action items with owners and deadlines
- Key data points or metrics shared
- Disagreements and how they were resolved
- Commitments made by attendees
- Open questions that need follow-up

**Skip:**
- Side conversations unrelated to the agenda
- Detailed back-and-forth that led nowhere
- Information everyone already knows
- Verbatim transcription of everything said

## Meeting Types & Templates

### Standup / Daily Sync

```markdown
# Daily Standup - [Date]

## [Team Member 1]
- **Yesterday:** Completed API endpoint for user search
- **Today:** Starting frontend integration for search
- **Blockers:** Waiting on design mockups for empty state

## [Team Member 2]
- **Yesterday:** Fixed authentication timeout bug (#234)
- **Today:** Writing tests for auth flow
- **Blockers:** None
```

### Sprint Retrospective

```markdown
# Sprint [X] Retrospective - [Date]

## What Went Well
- Shipped the notification feature on time
- Good collaboration between frontend and backend teams
- Zero production incidents this sprint

## What Didn't Go Well
- Underestimated the complexity of the payment integration
- Too many context switches due to urgent bug fixes
- Standup meetings consistently running over 15 minutes

## Action Items for Next Sprint
| Action | Owner | Priority |
|--------|-------|----------|
| Break payment tasks into smaller stories | @PM | High |
| Create a "bug duty" rotation to reduce interrupts | @TL | Medium |
| Timebox standups to 10 min with strict format | @Scrum Master | Medium |
```

### Decision Meeting

```markdown
# Decision: [Topic]

**Date:** YYYY-MM-DD
**Decision Makers:** [names]
**Status:** Decided / Pending

## Context
[Why this decision needs to be made now]

## Options Considered

### Option A: [Name]
- **Pros:** [list]
- **Cons:** [list]
- **Effort:** [estimate]
- **Risk:** [assessment]

### Option B: [Name]
- **Pros:** [list]
- **Cons:** [list]
- **Effort:** [estimate]
- **Risk:** [assessment]

## Decision
We chose **Option [X]** because [reasoning].

## Next Steps
| Action | Owner | Due |
|--------|-------|-----|
| [Implementation step] | @name | date |
```

### One-on-One

```markdown
# 1:1 - [Manager] & [Report] - [Date]

## Check-in
- How are things going? (energy, workload, morale)

## Progress Updates
- [Project/task update]
- [Wins to celebrate]

## Challenges
- [Blocker or concern]
- [Support needed]

## Career Development
- [Skills to develop]
- [Opportunities to pursue]

## Action Items
- [ ] @manager: [action]
- [ ] @report: [action]

## Topics for Next Time
- [Carry-over topic]
```

## Post-Meeting Follow-Up

### Within 24 Hours

1. **Clean up notes**: Organize raw notes into the structured format
2. **Send summary**: Share with all attendees and relevant stakeholders
3. **Create tasks**: Add action items to the project management tool (Jira, Linear, Asana)
4. **Set reminders**: Schedule follow-ups for due dates

### Follow-Up Email Template

```
Subject: Meeting Notes & Action Items - [Meeting Title] ([Date])

Hi team,

Thanks for joining today's meeting. Here's a summary of what we covered.

**Key Decisions:**
- [Decision 1]
- [Decision 2]

**Action Items:**
- @Alice: [Task] - due [date]
- @Bob: [Task] - due [date]

**Open Items for Next Meeting:**
- [Topic to revisit]

Full notes are available here: [link]

Our next meeting is scheduled for [date/time]. Please come prepared
with [specific preparation].

Best,
[Name]
```

## Meeting Facilitation Tips

### Before the Meeting
- Send agenda at least 24 hours in advance
- Include pre-read materials if attendees need context
- Set clear objectives: "By the end of this meeting, we will..."
- Invite only essential attendees (everyone else gets the notes)

### During the Meeting
- Start on time, end on time (or early)
- State the objective at the beginning
- Assign a note-taker (rotate this role)
- Keep discussions on topic (use "parking lot" for tangents)
- Ensure quieter voices are heard: "Sarah, what are your thoughts?"
- Summarize decisions before moving to the next topic

### After the Meeting
- Share notes within 24 hours
- Track action items to completion
- Cancel the next meeting if there's no agenda (give time back)
