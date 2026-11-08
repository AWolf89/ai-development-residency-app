---
status: proposed
date: 2026-11-07
decision-makers: Amanda Wolf
---

# 0005. Defer AI agent features to later weeks for the Week 3 release

## Context and Problem Statement

Week 3 (Web Hosting, due Nov 9) asks for MVP #1 live and forbids anything "fake, empty, or coming soon." But a large share of MVP #1 is AI/agent work — an evidence investigation agent, decision-point interviews, a reviewer agent, gap classification, overclaim flags — and the course only teaches the AI tooling later (OpenRouter and closed RAG in Week 4, Agent-Based Applications in Week 6, APIs in Week 7). With two days until the deadline, what should the Week 3 release actually contain?

## Decision Drivers

* Two days to the Week 3 deadline
* Course sequencing: AI integration (OpenRouter, RAG, agents) is taught in Weeks 4, 6, and 7
* The "nothing fake or coming soon" rule — whatever ships must truly work
* Deliver a genuinely live, useful app rather than a rushed, half-working agent

## Considered Options

* Build the non-AI slices now and add AI features in Weeks 4/6/7 (phased)
* Build the entire AI-powered MVP #1 before Nov 9
* Ship only the foundation and pause feature work

## Decision Outcome

Chosen option: "Build the non-AI slices now and add AI features in Weeks 4/6/7 (phased)", because it ships a real, working application for the hosting week (auth, target-role intake, file uploads, decision-record create/read/update) and aligns the AI work with the weeks that teach it. This choice is pending the instructor's confirmation that the remaining MVP #1 features may carry into later weeks.

### Consequences

* Good, because Week 3 ships a genuinely live app with real sign-in, data, and record management — nothing fake
* Good, because AI features are built when the course teaches their tools, avoiding a rushed agent
* Bad, because MVP #1 is not fully complete at the close of Week 3 and depends on instructor sign-off for carryover
* Bad, because some epics remain unbuilt until later weeks, so the board will not be all-Done in Week 3

### Confirmation

Confirmed by review: the Week 3 release contains only working, non-AI features; AI-dependent cards are labeled for Weeks 4/6/7 on the Kanban board; and the carryover question is raised with the instructor.

## Pros and Cons of the Options

### Build the non-AI slices now and add AI features in Weeks 4/6/7 (phased)

* Good, because it delivers a working app on time and sequences AI work with the curriculum
* Bad, because MVP #1 is incomplete until later weeks and needs instructor agreement on carryover

### Build the entire AI-powered MVP #1 before Nov 9

* Good, because it would fully satisfy the literal MVP #1 scope in one week
* Bad, because it is unrealistic in two days, before the AI tools are taught, and risks a rushed, half-working result that breaks the "nothing fake" rule

### Ship only the foundation and pause feature work

* Good, because it is the safest, smallest scope
* Bad, because it under-delivers for the hosting week, which expects real user-facing features live

## More Information

Raise with the instructor: whether the remaining MVP #1 features may carry into Weeks 4–7 (the checklist itself suggests asking). Related: [ADR-0003](0003-use-supabase-for-the-database-with-row-level-security.md).
