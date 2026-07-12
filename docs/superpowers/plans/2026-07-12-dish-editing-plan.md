# Dish Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe full editing for dish name, category, image, ingredients, and steps while preserving identity and history.

**Architecture:** The dish API owns a strict editable-field allowlist. The existing add form gains create/edit modes and the home coordinator switches from detail to editing, then refreshes canonical dish data after success.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle/Turso, Vitest.

## Global Constraints

- Preserve `id`, `createdAt`, `timesCooked`, meal plans, and history.
- Preserve the current image unless the user selects and successfully uploads a replacement.
- Failed updates keep the form open with all inputs intact.

---

### Task 1: Safe update API

**Files:**
- Modify: `src/app/api/dishes/[id]/route.ts`
- Test: `tests/api/dish-edit.test.ts`

- [ ] Write a test creating a temporary dish, updating all five editable fields while submitting forged protected fields, and asserting protected fields remain unchanged.
- [ ] Run it and confirm the current spread-based update fails the protected-field assertion.
- [ ] Implement explicit validation and allowlisted update fields with server-owned `updatedAt`.
- [ ] Re-run the focused test and existing dish tests.

### Task 2: Edit form and detail entry point

**Files:**
- Modify: `src/components/AddDishForm.tsx`
- Modify: `src/components/DishDetail.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/lib/dish-form.test.ts`

- [ ] Add tests for edit request construction preserving old image and accepting a replacement image.
- [ ] Implement form `dish?: Dish` mode, prefilled fields, PUT submission, optional image selection, and edit-specific copy.
- [ ] Add detail edit callback and coordinate detail-to-form transition in Home.
- [ ] Run all tests, lint, build, and mobile browser verification.
