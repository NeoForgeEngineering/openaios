# Cycle: openaios-plugins

**Created**: 2026-03-17T11:22:45.418902+00:00
**Priority**: medium
**Status**: Active

## Overview

<!-- Describe what this cycle aims to accomplish -->

---

<!-- FORGE_PHASE:Focus:Complete -->
## Phase 1: Focus

**Purpose**: Define what you're building and why.

### Required Outputs
- [ ] Problem statement and target users defined
- [ ] Testable success criteria written
- [ ] System Context diagram (C4 L1) created
- [ ] Clear boundaries on what you WON'T build

### Notes

<!-- Document Focus phase work here -->

---

<!-- FORGE_PHASE:Orchestrate:Complete -->
## Phase 2: Orchestrate

**Purpose**: Break the work into session-sized pieces.

### Required Outputs
- [ ] Container architecture (C4 L2) designed
- [ ] Component architecture (C4 L3) designed
- [ ] Dependency map created
- [ ] Tasks sized for single AI sessions

### Tasks

<!-- List tasks here -->

---

<!-- FORGE_PHASE:Refine:Complete -->
## Phase 3: Refine

**Purpose**: Define exactly what "done" looks like.

### Required Outputs
- [ ] Acceptance criteria in Given-When-Then format
- [ ] Interface specifications documented
- [ ] Edge cases enumerated by category
- [ ] Constraints vs criteria documented

**CRITICAL**: No code in this phase - specifications only.

### Specifications

<!-- Document specifications here -->

---

<!-- FORGE_PHASE:Generate:Complete -->
## Phase 4: Generate

**Purpose**: AI writes code following TDD.

### Process
- [ ] RED: Write failing tests
- [ ] GREEN: Minimal code to pass
- [ ] REFACTOR: Improve while green

### Implementation Notes

<!-- Document implementation progress here -->

---

<!-- FORGE_PHASE:Evaluate:Complete -->
## Phase 5: Evaluate

**Purpose**: Verify output matches intent.

### Checklist
- [x] Criteria verified line-by-line
- [x] Edge cases tested
- [x] Security review completed
- [x] Integration tested

### Disposition

**ACCEPT** — PluginRegistry, manifest validation, lifecycle state machine, SKILL.md loader. 22 new tests. 15 packages build clean. 225 total tests, 0 regressions.

---

## Learnings

<!-- Capture learnings during and after the cycle -->
