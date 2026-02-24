---
name: interview-prep
description: Technical and behavioral interview preparation with frameworks, sample questions, and strategies
emoji: "\U0001F3AF"
name_zh: 面试准备
description_zh: 技术面试准备与常见问题解答
---

## Interview Preparation Guide

Prepare systematically for technical and behavioral interviews with proven frameworks and practice strategies.

## Behavioral Interviews

### The STAR Method

Structure every behavioral answer using STAR:

```
S - Situation: Set the context (where, when, what project)
T - Task: Describe your specific responsibility
A - Action: Explain exactly what YOU did (not the team)
R - Result: Quantify the outcome (metrics, impact, lessons)
```

### Example STAR Response

**Question:** "Tell me about a time you had to deal with a difficult teammate."

```
SITUATION: "In my previous role at Acme, I was on a 5-person team building
a payment integration. One team member consistently missed code review
deadlines, blocking the rest of the team."

TASK: "As the tech lead, I needed to resolve the bottleneck without
damaging the working relationship."

ACTION: "I scheduled a private 1:1 to understand the situation. I learned
he was overcommitted to another project. Together, we restructured the
review process: I paired smaller PRs with specific reviewers and set a
24-hour SLA for reviews. I also spoke with his manager about the workload
conflict."

RESULT: "Review turnaround dropped from 3 days to under 24 hours. We
delivered the project on time, and the team member thanked me for
addressing it directly. I carried this approach into future projects."
```

### Common Behavioral Questions

Prepare 2-3 STAR stories that can cover multiple questions:

**Leadership & Initiative:**
- Tell me about a time you took ownership of a problem no one else was addressing
- Describe a situation where you had to make a decision without complete information
- Give an example of when you influenced a team decision without formal authority

**Conflict & Collaboration:**
- Tell me about a disagreement with a colleague and how you resolved it
- Describe a time you received critical feedback and how you responded
- Give an example of a cross-team collaboration that was challenging

**Problem Solving:**
- Tell me about the most complex technical problem you've solved
- Describe a project that failed and what you learned
- Tell me about a time you had to quickly learn something new

**Adaptability:**
- Describe a time when project requirements changed significantly
- Tell me about a time you had to work under tight deadlines
- Give an example of how you handled ambiguity

## Technical Interview: Coding

### Problem-Solving Framework

1. **Clarify** (2-3 min): Ask questions before coding
   - Input format and constraints?
   - Edge cases (empty, null, very large)?
   - Expected output format?

2. **Plan** (3-5 min): Think out loud
   - Identify the pattern (sliding window, two pointers, BFS, etc.)
   - Discuss approach and trade-offs
   - State time/space complexity before coding

3. **Code** (15-20 min): Write clean, working code
   - Start with the core logic
   - Use descriptive variable names
   - Handle edge cases

4. **Test** (3-5 min): Verify with examples
   - Walk through with a simple test case
   - Check edge cases
   - Fix any bugs

### Common Algorithm Patterns

| Pattern | When to Use | Example Problems |
|---------|-------------|------------------|
| Two Pointers | Sorted arrays, pair finding | Two Sum (sorted), Container With Most Water |
| Sliding Window | Subarray/substring with constraint | Max subarray of size K, Longest substring without repeating |
| Binary Search | Sorted data, search space reduction | Search rotated array, Find minimum in rotated array |
| BFS/DFS | Graph/tree traversal | Level order traversal, Number of islands |
| Dynamic Programming | Overlapping subproblems, optimal substructure | Climbing stairs, Longest common subsequence |
| Hash Map | Fast lookups, counting | Two Sum, Group Anagrams |
| Stack | Matching pairs, monotonic sequences | Valid Parentheses, Daily Temperatures |
| Heap | Top-K, running median | K Closest Points, Merge K Sorted Lists |

### Coding Interview Template

```python
def solve(input_data):
    # Step 1: Handle edge cases
    if not input_data:
        return default_result

    # Step 2: Initialize data structures
    result = []
    seen = set()

    # Step 3: Core algorithm
    for item in input_data:
        # Process each item
        pass

    # Step 4: Return result
    return result

# Time: O(n) - single pass through input
# Space: O(n) - hash set for lookups
```

## Technical Interview: System Design

### Framework (35-45 minutes)

```
1. Requirements Clarification (5 min)
   - Functional requirements (what should it do?)
   - Non-functional requirements (scale, latency, availability)
   - Constraints (budget, tech stack, team size)

2. Back-of-Envelope Estimation (5 min)
   - Users: daily active users (DAU)
   - Traffic: requests per second (QPS)
   - Storage: data size and growth rate
   - Bandwidth: read/write throughput

3. High-Level Design (10 min)
   - Draw the main components
   - Show data flow between them
   - Identify the API endpoints

4. Detailed Design (15 min)
   - Database schema
   - Data partitioning strategy
   - Caching strategy
   - Key algorithms

5. Bottlenecks & Trade-offs (5 min)
   - Single points of failure
   - Scalability limits
   - Consistency vs. availability trade-offs
```

### Common System Design Topics

- URL Shortener (beginner)
- Chat System / Messaging App
- News Feed / Timeline
- Web Crawler
- Rate Limiter
- Notification System
- Search Autocomplete
- Distributed Cache
- Video Streaming Platform
- Payment System

## Questions to Ask the Interviewer

### About the Role

- What does a typical day or week look like for this role?
- What are the biggest challenges the team is facing right now?
- How is success measured for this position in the first 6 months?

### About the Team

- How is the team structured? How many people?
- What's the team's approach to code reviews and knowledge sharing?
- How does the team handle on-call and incident response?

### About the Company

- What's the company's biggest priority this year?
- How does engineering influence product decisions?
- What does the growth trajectory look like?

## Interview Day Checklist

### Before

- [ ] Research the company (product, recent news, engineering blog)
- [ ] Review the job description and map your experience to requirements
- [ ] Prepare 5-6 STAR stories covering common behavioral themes
- [ ] Practice coding problems for 1-2 weeks (2-3 problems/day)
- [ ] Review system design fundamentals
- [ ] Prepare 3-5 questions to ask the interviewer
- [ ] Test your setup (camera, microphone, IDE) for virtual interviews

### During

- [ ] Think out loud - interviewers want to see your process
- [ ] Ask clarifying questions before solving
- [ ] Start with brute force, then optimize
- [ ] Manage your time (don't spend too long on one part)
- [ ] Stay calm when stuck - describe what you're considering
- [ ] Be genuine - authenticity matters

### After

- [ ] Send thank-you emails within 24 hours
- [ ] Note what went well and what to improve
- [ ] Follow up if you haven't heard back within the stated timeline
