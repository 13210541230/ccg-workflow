---
name: codex-runtime
description: Wrapper-free CCG runtime operations for Codex/Gemini/Claude. Use when CCG needs to invoke an external backend through `codex_bridge.py`, including plugin-root resolution, role prompt selection, `--prompt-file` handling for long prompts, `SESSION_ID` reuse, persisted JSON output, and empty-output recovery.
---

# Codex Runtime

Use this skill to run Codex/Gemini/Claude through the CCG bridge and persist every result to disk. The skill name is retained for compatibility; the runner itself is multi-backend.

## Workflow

1. Resolve `PLUGIN_ROOT` and `BRIDGE` before the first invocation:
   ```bash
   P="$HOME/.claude/plugins/cache/ccg-plugin/ccg"
   R=$(ls -1d "$P"/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
   [ -z "$R" ] && R="$HOME/.claude/.ccg"
   echo "PLUGIN_ROOT=$R"
   echo "BRIDGE=$R/scripts/codex_bridge.py"
   ```
2. Pick a backend and role from `~/.claude/.ccg/prompts/<backend>/`.
3. Prefer the bundled runner for stable invocation and persisted JSON output:
   ```bash
   python ~/.claude/skills/codex-runtime/scripts/ccg-codex-run.py \
     --plugin-root "$PLUGIN_ROOT" \
     --cd "<WORKDIR>" \
     --backend codex \
     --role reviewer \
     --prompt-file "<WORKDIR>/.ccg-tmp/codex_prompt.md" \
     --output-file "<WORKDIR>/.ccg-tmp/codex-result.json"
   ```
4. Reuse sessions by passing `--session-id <SESSION_ID>`.
5. If tool output is empty, inspect the persisted `--output-file` before retrying.

## Guardrails

- Default to `--sandbox read-only`; only relax when the user explicitly needs write access.
- Default backend is `codex`. Preserve `gemini` as a switchable path by passing `--backend gemini`.
- Keep prompt files in a cross-platform absolute path such as `<WORKDIR>/.ccg-tmp/...`.
- Persist every run so empty `TaskOutput` or temp-file loss can be recovered from disk.
- Treat the JSON result as the source of truth: `success`, `SESSION_ID`, `agent_messages`, and optional `all_messages`.

## Supported Roles

- Common roles (`codex` / `claude`): `analyzer`, `architect`, `debugger`, `optimizer`, `reviewer`, `tester`
- Gemini roles: `analyzer`, `architect`, `debugger`, `frontend`, `optimizer`, `reviewer`, `tester`

## Recovery

- Missing prompt output: read the persisted JSON file first.
- Broken session: drop `--session-id` and start a new run.
- Need more diagnostics: rerun with `--return-all-messages`.
