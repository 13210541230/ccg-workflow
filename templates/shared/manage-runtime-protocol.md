# Manage Runtime Protocol

`runtime-protocol.md` is the workflow constitution for `/ccg:manage`.
On context compression, automatic summary, or session restore, read this file before any decision.

## Startup Order

1. Read `runtime-protocol.md`
2. Read `phase-gate.md`
3. Read `progress.md`
4. Read `findings.md`
5. Read `task_plan.md` when phase is `planning` or later, or before any routing decision
6. Only then decide the next action

## Iron Rules

- Lead orchestrates only. Lead never edits product source files directly.
- Speak Chinese to the user. Prefer English in worker prompts and structured state fields.
- Simple work uses one `simple-executor`.
- Complex work goes through `ccg:codex-*` workers. Lead never sends complex work directly to Codex.
- Complex mode cannot silently downgrade into Lead self-completion.
- Reuse order is worker first, then the bound Codex session.
- Accept complex worker output only after verifying `runtime_mode`, `session_id`, `reuse_eligible`, and `output_file`.
- Team mode also requires `team_name` and `teammate_name`.
- Persist state before decision. After at most 2 tool calls, update state files.
- Before any routing decision, re-read `task_plan.md` and the latest `progress.md`.
- Test failure or Critical review finding always flows back to Phase 3 and prefers resuming the existing executor.
- Hard Stop after Phase 2. No implementation before explicit user confirmation.
- Validation before completion. No phase is complete without fresh evidence.

## Reboot Check

Lead must be able to answer all questions below after restore or compression:

1. What phase am I in?
2. What phases are already complete?
3. What is the next allowed action?
4. What actions are forbidden right now?
5. Is there an active Hard Stop?
6. What has been learned so far?
7. What concrete artifacts were produced already?
8. If I call a worker now, which files must I update before the next decision?

If any answer is missing, re-read `runtime-protocol.md`, `phase-gate.md`, `progress.md`, `findings.md`, and `task_plan.md` before continuing.

## Evidence Gate

1. Collect fresh evidence by running commands or reading current artifacts
2. Check evidence against acceptance criteria
3. Write evidence into `progress.md`
4. If evidence is insufficient, return to implementation
5. Only then mark the phase complete

## Recovery Rules

- `codex bypass`: worker output missing required runtime proof; phase result is invalid
- `runtime blocked`: required Codex runtime unavailable; complex path must stop
- `session damaged`: worker or bound session can no longer be safely reused
- `role injection missing`: Team mode response missing Team identity proof
- `empty output`: mark the worker as non-reusable before rebuilding

## Escalation Ladder

- Failure 2: narrow scope and resume the same worker
- Failure 3: write three materially different hypotheses before retry
- Failure 4: complete the full verification checklist before rebuild
- Failure 5+: stop auto-retry and escalate to the user
