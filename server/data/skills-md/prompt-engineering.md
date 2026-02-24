---
name: prompt-engineering
description: LLM prompt engineering techniques, patterns, and best practices for effective AI interactions
emoji: "\U0001F916"
name_zh: 提示词工程
description_zh: AI 提示词设计技巧与最佳实践
---

## Prompt Engineering Guide

Write effective prompts that get better, more reliable results from large language models (LLMs).

## Core Principles

### 1. Be Specific and Clear

```
BAD:  "Write something about marketing."
GOOD: "Write a 200-word LinkedIn post about why B2B SaaS companies
       should invest in content marketing. Target audience: CMOs
       at companies with 50-200 employees. Tone: professional but
       conversational. Include one specific statistic."
```

### 2. Provide Context

```
BAD:  "Fix this code."
GOOD: "I'm building a Node.js REST API with Express. The following
       endpoint should return paginated user data, but it returns
       all records regardless of the page parameter. Here's the code:
       [code]. The database is PostgreSQL and I'm using the pg library."
```

### 3. Specify the Output Format

```
BAD:  "Analyze these sales numbers."
GOOD: "Analyze the following quarterly sales data. Provide:
       1. A summary of the overall trend (2-3 sentences)
       2. The top 3 performing regions with percentage growth
       3. Any concerning patterns or anomalies
       4. Three actionable recommendations

       Format the output with clear headers and bullet points."
```

## Prompting Techniques

### Few-Shot Prompting

Provide examples of the desired input-output pattern:

```
Convert the following product descriptions into concise taglines.

Example 1:
Description: "Our CRM software helps sales teams track leads, manage
customer relationships, and close deals faster with AI-powered insights."
Tagline: "Close deals faster with AI-powered CRM."

Example 2:
Description: "A cloud-based accounting platform that automates invoicing,
expense tracking, and financial reporting for small businesses."
Tagline: "Accounting on autopilot for small businesses."

Now convert this:
Description: "Our project management tool helps remote teams collaborate
in real-time with integrated video calls, task tracking, and shared
documents."
Tagline:
```

### Chain-of-Thought (CoT)

Ask the model to reason step by step:

```
Determine the optimal pricing tier for this customer.

Think through this step by step:
1. First, analyze the customer's usage patterns
2. Then, compare against each pricing tier's limits
3. Calculate the cost at each tier
4. Consider their growth trajectory
5. Recommend the best tier with justification

Customer data:
- Current usage: 50,000 API calls/month
- Growth rate: 20% month-over-month
- Team size: 15 users
- Priority features needed: SSO, audit logs
```

### Role Assignment

Assign a specific role or persona:

```
You are a senior security engineer conducting a code review.
Review the following authentication code and identify:
1. Security vulnerabilities (with severity: critical, high, medium, low)
2. Deviations from OWASP best practices
3. Specific remediation steps for each issue

Be thorough and assume this code will handle real user credentials
in production.
```

### Structured Output

Request specific formats for consistent, parseable responses:

```
Analyze the following customer feedback and categorize each item.

Return your analysis as a JSON array with this structure:
{
  "feedback": [
    {
      "id": 1,
      "original_text": "...",
      "category": "bug | feature_request | complaint | praise",
      "sentiment": "positive | neutral | negative",
      "priority": "high | medium | low",
      "summary": "One sentence summary"
    }
  ]
}

Feedback to analyze:
1. "The app crashes every time I try to export a PDF"
2. "Love the new dark mode! Much easier on the eyes"
3. "Would be great if you could integrate with Slack"
```

### Self-Consistency / Verification

Ask the model to verify its own output:

```
Solve this optimization problem: [problem description]

After providing your solution:
1. Verify each step of your reasoning
2. Check if there are alternative approaches
3. Test your answer against edge cases
4. Rate your confidence level (high/medium/low) and explain why
```

### Decomposition

Break complex tasks into subtasks:

```
I need to design a notification system for a mobile app.

Let's break this into parts:

Part 1: First, define the types of notifications we need
(transactional, marketing, social, system alerts).

Part 2: For each type, define the delivery channels
(push, in-app, email, SMS) and priority rules.

Part 3: Design the data model (notification table schema,
user preferences schema, delivery log schema).

Part 4: Define the delivery pipeline architecture
(queuing, batching, rate limiting, retry logic).

Start with Part 1, and I'll ask you to continue with each part.
```

## Advanced Patterns

### Prompt Templates

Create reusable templates with variables:

```
## Code Review Template

Review the following {language} code for a {project_type} application.

Context: {context}

Code:
```{language}
{code}
```

Focus on:
1. Correctness and edge cases
2. Performance implications
3. Security concerns
4. Code readability and maintainability
5. Adherence to {language} best practices

For each issue found, provide:
- Location (function/line)
- Severity (critical/warning/suggestion)
- Explanation of the problem
- Recommended fix with code example
```

### Iterative Refinement

Start broad, then narrow down:

```
Round 1: "Give me 10 name ideas for a project management SaaS
          targeting freelancers."

Round 2: "I like options 3, 5, and 8. For each of these three,
          generate 5 variations that are shorter (1-2 syllables)
          and check if the .com domain is likely available."

Round 3: "Let's go with 'TaskKit'. Write 3 different taglines,
          each emphasizing a different value prop: simplicity,
          speed, or affordability."
```

### Constraint Setting

Define boundaries to control output quality:

```
Write a product announcement email with these constraints:
- Maximum 150 words
- Reading level: 8th grade (simple language)
- Must include exactly one call-to-action
- Do not use the words "revolutionary", "game-changing", or "excited"
- Tone: confident but not hyperbolic
- Must mention the specific feature: real-time collaboration
```

## Common Pitfalls to Avoid

### 1. Vague Instructions

```
BAD:  "Make it better."
GOOD: "Improve the clarity by: simplifying sentences over 25 words,
       replacing jargon with plain language, and adding transition
       phrases between paragraphs."
```

### 2. Contradictory Instructions

```
BAD:  "Write a comprehensive, detailed guide. Keep it under 100 words."
GOOD: "Write a concise reference card (under 100 words) covering
       the 5 most essential git commands with one-line descriptions."
```

### 3. Assuming Knowledge

```
BAD:  "Use the standard format for this."
GOOD: "Format this as a changelog entry following Keep a Changelog
       format (keepachangelog.com): group by Added, Changed, Fixed,
       Removed."
```

### 4. Not Specifying Audience

```
BAD:  "Explain Kubernetes."
GOOD: "Explain Kubernetes to a junior developer who understands
       Docker containers but has never used orchestration tools.
       Use analogies to real-world concepts."
```

## Prompt Testing Checklist

Before using a prompt in production:

- [ ] Test with 5+ different inputs to check consistency
- [ ] Verify the output format is consistent across runs
- [ ] Test edge cases (empty input, very long input, ambiguous input)
- [ ] Check that the model doesn't hallucinate facts
- [ ] Verify the response stays within the specified constraints
- [ ] Test with adversarial inputs if the prompt will face user-generated content
- [ ] Measure response quality against a rubric, not just "looks good"
