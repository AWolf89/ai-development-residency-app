---
status: proposed
date: 2026-11-07
decision-makers: Amanda Wolf
---

# 0002. Use Material UI for the interface

## Context and Problem Statement

The app needs a consistent, accessible set of interface components built quickly by one person, and the residency's Week 3 class materials require the Material UI design system. Accessibility also matters for the Week 8 WCAG work. Which component system should the interface use?

## Decision Drivers

* The residency curriculum names Material UI as the required design system
* Accessible, pre-built components to support later WCAG 2.2 AA work
* Works with Next.js App Router (server components)
* Speed for a solo builder — themeable components out of the box

## Considered Options

* Material UI (MUI)
* Tailwind CSS with headless components
* Chakra UI

## Decision Outcome

Chosen option: "Material UI (MUI)", because it meets the course requirement, ships accessible components and theming, and integrates with the App Router via its Next.js adapter.

### Consequences

* Good, because common components (buttons, forms, layout) come pre-built and accessible
* Good, because a central theme keeps styling consistent across the app
* Bad, because MUI adds more JavaScript than a utility-CSS approach and its default look needs theming to feel custom

### Confirmation

Confirmed by code review: UI is composed from `@mui/material` components, wrapped in `AppRouterCacheProvider` + `ThemeProvider` with a shared theme (`src/theme.ts`).

## Pros and Cons of the Options

### Material UI (MUI)

* Good, because it is the course-required system with accessible components and theming
* Bad, because it is heavier and more opinionated than utility CSS

### Tailwind CSS with headless components

* Good, because it is lightweight and highly customizable
* Bad, because it is not the course-specified system and requires building or wiring component behavior and accessibility yourself

### Chakra UI

* Good, because it is accessible and ergonomic
* Bad, because it is not the course-specified system and has less mature Next.js App Router support

## More Information

Week 3 class materials require Next.js + Material UI. Related: [ADR-0001](0001-use-next-js-with-the-app-router-and-typescript.md).
