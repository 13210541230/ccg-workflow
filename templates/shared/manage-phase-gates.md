# Manage Phase Gates Reference

Use this file to build the per-task `phase-gate.md`.
`phase-gate.md` is the short-lived contract for the current phase and must be updated on every phase transition.

## Required Fields

- `Current Phase`
- `Next Allowed Action`
- `Hard Stop`
- `## Allowed Actions`
- `## Forbidden Actions`
- `## Required Reads Before Decision`
- `## Exit Criteria`
- `## After Worker Returns`

## Phase Reference

### `initializing`

- Next allowed action: resolve runtime, create state directory, copy protocol files
- Hard Stop: `no`
- Forbidden: planner/executor/reviewer dispatch

### `discussing`

- Next allowed action: ask one clarifying question or lock the answer into `decisions.md`
- Hard Stop: `no`
- Forbidden: implementation, parallel worker fan-out

### `analyzing`

- Next allowed action: dispatch or resume analyzer workers, then merge findings
- Hard Stop: `no`
- Forbidden: planner/executor/reviewer dispatch before analysis is accepted

### `planning`

- Next allowed action: dispatch or resume planner workers, then write zero-context `task_plan.md`
- Hard Stop: `yes`
- Forbidden: executor dispatch, source modification, claiming approval without user confirmation

### `confirmed`

- Next allowed action: start Phase 3 implementation using the approved plan
- Hard Stop: `no`
- Forbidden: editing scope without updating `task_plan.md` and `decisions.md`

### `executing`

- Next allowed action: dispatch or resume executor worker for the current approved scope
- Hard Stop: `no`
- Forbidden: skipping directly to completion, restarting analysis without evidence

### `testing`

- Next allowed action: gather fresh verification evidence and record it
- Hard Stop: `no`
- Forbidden: claiming completion from memory or partial checks

### `reviewing`

- Next allowed action: dispatch or resume reviewer workers, then merge findings
- Hard Stop: `no`
- Forbidden: Lead patching source directly, ignoring Critical findings

### `blocked`

- Next allowed action: produce a structured blocker report and ask the user for direction
- Hard Stop: `yes`
- Forbidden: blind retry loops, silent scope changes

### `complete`

- Next allowed action: no further worker dispatch unless the user reopens the task
- Hard Stop: `yes`
- Forbidden: mutating state as if work were still active
