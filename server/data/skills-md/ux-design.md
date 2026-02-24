---
name: ux-design
description: UX design principles, heuristics, and practical guidelines for user-centered product design
emoji: "\U0001F3A8"
name_zh: 用户体验设计
description_zh: UX 设计原则与用户体验优化
---

## UX Design Principles & Guidelines

Design intuitive, accessible, and delightful user experiences by applying proven principles and heuristics.

## Nielsen's 10 Usability Heuristics

### 1. Visibility of System Status

The system should always keep users informed about what's happening.

```
Examples:
- Show loading spinners or progress bars during data fetching
- Display "Saving..." and "Saved" indicators when auto-saving
- Show upload progress with percentage and time remaining
- Highlight the current page in navigation
- Display real-time form validation (not just on submit)
```

### 2. Match Between System and the Real World

Use language and concepts familiar to the user, not system-oriented terminology.

```
BAD:  "Error 500: Internal Server Exception"
GOOD: "Something went wrong on our end. Please try again in a moment."

BAD:  "Null pointer reference in user object"
GOOD: "We couldn't find your account. Please check your email and try again."
```

### 3. User Control and Freedom

Users often make mistakes. Provide clear "emergency exits" without long processes.

```
Examples:
- Undo/redo for destructive actions
- "Are you sure?" confirmation for irreversible actions (delete, send)
- Easy way to go back to the previous screen
- Cancel button on all multi-step processes
- "Unsend" or "Edit" within a grace period
```

### 4. Consistency and Standards

Follow platform conventions and maintain internal consistency.

```
Rules:
- Use the same term for the same concept throughout ("Delete" not sometimes "Remove")
- Follow platform patterns (e.g., iOS swipe-to-delete, Android back button)
- Keep button styles consistent (primary, secondary, destructive)
- Maintain consistent spacing, typography, and color usage
- Place common elements (search, profile, settings) where users expect them
```

### 5. Error Prevention

Prevent errors before they happen rather than just showing error messages after.

```
Examples:
- Disable the "Submit" button until the form is valid
- Use date pickers instead of free-text date input
- Show character counters approaching the limit
- Auto-save drafts to prevent data loss
- Use type-ahead/autocomplete for known-value fields
- Confirm destructive actions with a specific input ("Type DELETE to confirm")
```

### 6. Recognition Rather Than Recall

Minimize the user's memory load by making options and information visible.

```
Examples:
- Show recent searches and frequently used items
- Display form labels (don't rely on placeholder text alone)
- Show breadcrumbs for navigation context
- Preview changes before applying (e.g., theme preview)
- Use icons WITH labels (icons alone require memorization)
```

### 7. Flexibility and Efficiency of Use

Provide shortcuts for expert users without confusing beginners.

```
Examples:
- Keyboard shortcuts (Ctrl+K for search, Ctrl+Enter to submit)
- Bulk actions for power users (select all, batch edit)
- Customizable dashboards and views
- Templates for common tasks
- Remember user preferences and recent choices
```

### 8. Aesthetic and Minimalist Design

Every extra element competes with relevant information and diminishes visibility.

```
Rules:
- Remove UI elements that don't serve a clear purpose
- Use whitespace generously to reduce cognitive load
- Prioritize content over decoration
- Progressive disclosure: show basics first, details on demand
- Limit choices to prevent decision paralysis (Hick's Law)
```

### 9. Help Users Recognize, Diagnose, and Recover from Errors

Error messages should be in plain language, indicate the problem, and suggest a solution.

```
BAD:
  "Error: Invalid input"

GOOD:
  "This email address isn't valid. Please check for typos.
   Example: name@company.com"

BAD:
  "Payment failed"

GOOD:
  "Your card was declined. Please check your card details or try
   a different payment method. If the problem persists, contact
   your bank."
```

### 10. Help and Documentation

Even well-designed systems may need documentation. Make it easy to find, focused on tasks, and concise.

```
Examples:
- Contextual help tooltips next to complex features
- Searchable help center with common tasks
- Onboarding tours for new users (skippable!)
- Inline hints and examples in forms
- FAQ section addressing common problems
```

## Design Patterns for Common UI Elements

### Forms

```
Principles:
- Single column layout (faster than multi-column)
- Group related fields together
- Use inline validation (on blur, not on keystroke)
- Show required fields clearly (mark optional, not required)
- Pre-fill when possible (country from IP, name from account)
- Match input type to data (number keyboard for phone, email keyboard for email)
- Show password requirements upfront, not after failed attempt
- Submit button label should describe the action: "Create Account" not "Submit"
```

### Navigation

```
Principles:
- Keep primary navigation to 5-7 items maximum
- Highlight the current location clearly
- Use breadcrumbs for deep hierarchies
- Provide a global search as a fallback
- Mobile: bottom navigation for primary actions (thumb-friendly)
- Don't hide critical navigation in hamburger menus on desktop
```

### Loading States

```
Guidelines:
- 0-100ms: No indicator needed (feels instant)
- 100ms-1s: Show a subtle indicator (spinner, pulse)
- 1-10s: Show a progress bar or skeleton screen
- 10s+: Show progress with percentage and option to cancel
- Always show skeleton screens over blank loading states
- Never block the entire UI if only part of the page is loading
```

### Empty States

```
Every empty state should include:
1. An explanation of what will appear here
2. A clear action to populate the state
3. Optionally, an illustration that reinforces the message

Example:
  [Illustration of a mailbox]
  "No messages yet"
  "When you receive messages from your team, they'll appear here."
  [Button: "Send your first message"]
```

## Accessibility Essentials (a11y)

### Minimum Requirements

- [ ] Color contrast ratio: 4.5:1 for normal text, 3:1 for large text
- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible (don't remove outline without replacement)
- [ ] Images have meaningful alt text (or empty alt="" if decorative)
- [ ] Form inputs have associated labels (not just placeholder text)
- [ ] Error messages are announced to screen readers
- [ ] Page has a logical heading hierarchy (h1 > h2 > h3)
- [ ] Touch targets are at least 44x44px on mobile

### Color

```
Rules:
- Never convey information through color alone
  BAD:  Red/green status indicators only
  GOOD: Red/green indicators + icons + text labels
- Test designs in grayscale to verify they still communicate
- Provide sufficient contrast for text readability
- Support dark mode and high contrast modes
```

## UX Research Methods Quick Reference

| Method | When | Participants | Time |
|--------|------|-------------|------|
| User interviews | Discovery, understanding needs | 5-8 users | 1-2 weeks |
| Usability testing | Validating designs | 5 users | 1 week |
| A/B testing | Optimizing conversions | 1,000+ users | 2-4 weeks |
| Card sorting | Organizing information architecture | 15-30 users | 1 week |
| Surveys | Quantitative feedback | 100+ users | 1-2 weeks |
| Heatmaps | Understanding click/scroll behavior | 1,000+ sessions | Ongoing |

### The 5-User Rule

Jakob Nielsen's research shows that **5 users catch ~85% of usability problems**. You don't need massive studies for qualitative research. Test early and often with small groups.

## Design Handoff Checklist

- [ ] All states documented (default, hover, active, disabled, error, loading, empty)
- [ ] Responsive behavior specified (mobile, tablet, desktop breakpoints)
- [ ] Spacing and sizing use a consistent scale (4px/8px grid)
- [ ] Colors reference the design system tokens
- [ ] Typography uses defined styles (no one-off sizes)
- [ ] Interactions specified (transitions, animations, micro-interactions)
- [ ] Edge cases addressed (long text, missing data, permissions)
- [ ] Accessibility requirements noted
