# Home Infinite Scroll and Test Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all home records incrementally without allowing default tests to write production data.

**Architecture:** A pure pagination helper controls six-item increments. RecordPage observes a bottom sentinel and reveals already-fetched dishes. Package scripts scope default tests to unit/config directories.

**Tech Stack:** React 19, IntersectionObserver, Vitest, npm scripts.

### Task 1: Pagination helper and UI

- [ ] Add failing tests for six-item increments and total boundaries.
- [ ] Implement `nextVisibleDishCount`.
- [ ] Update RecordPage with sentinel, fallback, and end copy.
- [ ] Verify focused tests and mobile scrolling.

### Task 2: Test isolation

- [ ] Change default test scripts to run only `tests/lib` and `tests/config`.
- [ ] Add an explicitly blocked API-test script until an isolated API base/database is configured.
- [ ] Document the restriction and run test, lint, and build verification.
