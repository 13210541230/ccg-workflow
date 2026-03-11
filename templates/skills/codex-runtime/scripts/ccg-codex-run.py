#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROLE_MAP = {
    "codex": {
        "analyzer": "analyzer.md",
        "architect": "architect.md",
        "debugger": "debugger.md",
        "optimizer": "optimizer.md",
        "reviewer": "reviewer.md",
        "tester": "tester.md",
    },
    "gemini": {
        "analyzer": "analyzer.md",
        "architect": "architect.md",
        "debugger": "debugger.md",
        "frontend": "frontend.md",
        "optimizer": "optimizer.md",
        "reviewer": "reviewer.md",
        "tester": "tester.md",
    },
    "claude": {
        "analyzer": "analyzer.md",
        "architect": "architect.md",
        "debugger": "debugger.md",
        "optimizer": "optimizer.md",
        "reviewer": "reviewer.md",
        "tester": "tester.md",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persisted CCG runtime runner for Codex/Gemini/Claude skills")
    parser.add_argument("--plugin-root", required=True, help="Absolute CCG plugin/config root")
    parser.add_argument("--cd", required=True, help="Workspace directory for Codex")
    parser.add_argument("--output-file", required=True, help="Where to persist the JSON result")
    parser.add_argument("--backend", default="codex", choices=["codex", "gemini", "claude"])
    parser.add_argument("--sandbox", default="read-only", choices=["read-only", "workspace-write", "danger-full-access"])
    parser.add_argument("--session-id", default="", help="Resume an existing backend session")
    parser.add_argument("--role", default="", help="Role name under prompts/<backend>/ or an absolute role file path")
    parser.add_argument("--prompt", default="", help="Inline prompt text")
    parser.add_argument("--prompt-file", default="", help="Absolute prompt file path")
    parser.add_argument("--model", default="", help="Optional backend-specific model override")
    parser.add_argument("--return-all-messages", action="store_true")
    return parser.parse_args()


def resolve_role(plugin_root: Path, backend: str, role: str) -> str:
    if not role:
        return ""
    role_path = Path(role).expanduser()
    if role_path.is_file():
        return str(role_path)
    backend_roles = ROLE_MAP.get(backend, {})
    if role not in backend_roles:
        raise SystemExit(f"Unknown role: {role}")
    mapped = plugin_root / "prompts" / backend / backend_roles[role]
    if not mapped.is_file():
        raise SystemExit(f"Role file not found: {mapped}")
    return str(mapped)


def main() -> int:
    args = parse_args()
    plugin_root = Path(args.plugin_root).expanduser()
    bridge = plugin_root / "scripts" / "codex_bridge.py"
    if not bridge.is_file():
        raise SystemExit(f"Bridge not found: {bridge}")
    if not args.prompt and not args.prompt_file:
        raise SystemExit("Either --prompt or --prompt-file is required")

    cmd = [
        sys.executable,
        str(bridge),
        "--backend",
        args.backend,
        "--cd",
        args.cd,
        "--sandbox",
        args.sandbox,
    ]

    role_path = resolve_role(plugin_root, args.backend, args.role)
    if role_path:
        cmd.extend(["--role", role_path])
    if args.session_id:
        cmd.extend(["--SESSION_ID", args.session_id])
    if args.model:
        cmd.extend(["--model", args.model])
    if args.prompt_file:
        cmd.extend(["--prompt-file", args.prompt_file])
    else:
        cmd.extend(["--PROMPT", args.prompt])
    if args.return_all_messages:
        cmd.append("--return-all-messages")

    completed = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    output_path = Path(args.output_file).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if completed.returncode != 0 and not stdout:
        payload = {"success": False, "error": stderr or f"codex runtime failed with exit code {completed.returncode}"}
    else:
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            payload = {"success": False, "error": stderr or stdout or "Failed to decode codex runtime output"}

    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if payload.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
