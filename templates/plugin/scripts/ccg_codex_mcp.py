#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


SERVER_NAME = "ccg-codex-mcp"
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "2024-11-05"

DEFAULT_STATE_ROOT = Path.home() / ".claude" / ".ccg" / "mcp" / "codex"
ROLE_MAP = {
    "codex": {
        "analyzer": "analyzer.md",
        "architect": "architect.md",
        "debugger": "debugger.md",
        "planner": "planner.md",
        "executor": "executor.md",
        "optimizer": "optimizer.md",
        "reviewer": "reviewer.md",
        "tester": "tester.md",
    },
    "gemini": {
        "analyzer": "analyzer.md",
        "architect": "architect.md",
        "debugger": "debugger.md",
        "planner": "planner.md",
        "executor": "executor.md",
        "frontend": "frontend.md",
        "optimizer": "optimizer.md",
        "reviewer": "reviewer.md",
        "tester": "tester.md",
    },
    "claude": {
        "analyzer": "analyzer.md",
        "architect": "architect.md",
        "debugger": "debugger.md",
        "planner": "planner.md",
        "executor": "executor.md",
        "optimizer": "optimizer.md",
        "reviewer": "reviewer.md",
        "tester": "tester.md",
    },
}


def _plugin_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _bridge_path() -> Path:
    return _plugin_root() / "scripts" / "codex_bridge.py"


def _state_root(raw: Any) -> Path:
    if isinstance(raw, str) and raw.strip():
        return Path(raw).expanduser().resolve()
    return DEFAULT_STATE_ROOT


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _registry_path(state_root: Path) -> Path:
    return state_root / "registry.json"


def _read_registry(state_root: Path) -> dict[str, Any]:
    path = _registry_path(state_root)
    if not path.is_file():
        return {"sessions": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"sessions": {}}


def _write_registry(state_root: Path, registry: dict[str, Any]) -> None:
    _ensure_dir(state_root)
    _registry_path(state_root).write_text(
        json.dumps(registry, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _session_key(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name.strip()).strip("-")
    return cleaned or "session"


def _session_dir(state_root: Path, session_name: str) -> Path:
    return state_root / "sessions" / _session_key(session_name)


def _now_token() -> str:
    return time.strftime("%Y%m%d-%H%M%S")


def _resolve_role_file(backend: str, role: Any) -> str:
    if not isinstance(role, str) or not role.strip():
        return ""
    role_value = role.strip()
    maybe_path = Path(role_value).expanduser()
    if maybe_path.is_file():
        return str(maybe_path.resolve())
    mapped = ROLE_MAP.get(backend, {}).get(role_value)
    if not mapped:
        raise ValueError(f"Unknown role: {role_value}")
    role_path = _plugin_root() / "prompts" / backend / mapped
    if not role_path.is_file():
        raise ValueError(f"Role file not found: {role_path}")
    return str(role_path)


def _materialize_prompt(prompt: str, artifacts: list[str]) -> str:
    if not artifacts:
        return prompt
    lines = [prompt.rstrip(), "", "Relevant files:", *[f"- {item}" for item in artifacts]]
    lines.append("Read the listed files if they are relevant before answering.")
    return "\n".join(lines).strip()


def _run_bridge(
    *,
    prompt: str,
    workdir: str,
    backend: str,
    sandbox: str,
    state_dir: Path,
    session_id: str = "",
    role: str = "",
    model: str = "",
    return_all_messages: bool = False,
) -> dict[str, Any]:
    bridge = _bridge_path()
    if not bridge.is_file():
        return {"success": False, "error": f"Bridge not found: {bridge}"}

    runtime_dir = _ensure_dir(state_dir)
    prompt_dir = _ensure_dir(runtime_dir / "prompts")
    output_dir = _ensure_dir(runtime_dir / "outputs")
    stamp = _now_token()
    prompt_path = prompt_dir / f"{stamp}.md"
    output_path = output_dir / f"{stamp}.json"
    prompt_path.write_text(prompt, encoding="utf-8")

    cmd = [
        sys.executable,
        str(bridge),
        "--backend",
        backend,
        "--cd",
        workdir,
        "--sandbox",
        sandbox,
        "--prompt-file",
        str(prompt_path),
    ]
    if session_id:
        cmd.extend(["--SESSION_ID", session_id])
    if role:
        cmd.extend(["--role", role])
    if model:
        cmd.extend(["--model", model])
    if return_all_messages:
        cmd.append("--return-all-messages")

    completed = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()

    if completed.returncode != 0 and not stdout:
        payload: dict[str, Any] = {
            "success": False,
            "error": stderr or f"Bridge failed with exit code {completed.returncode}",
        }
    else:
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            payload = {
                "success": False,
                "error": stderr or stdout or "Failed to decode bridge output",
            }

    payload["output_file"] = str(output_path)
    payload["prompt_file"] = str(prompt_path)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def _json_text(payload: Any) -> list[dict[str, str]]:
    return [{"type": "text", "text": json.dumps(payload, indent=2, ensure_ascii=False)}]


def _tool_result(payload: dict[str, Any], is_error: bool = False) -> dict[str, Any]:
    return {
        "content": _json_text(payload),
        "structuredContent": payload,
        "isError": is_error,
    }


def _tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "name": "codex_once",
            "description": "Run a one-shot Codex/Gemini/Claude task through the CCG bridge without creating a reusable session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "workdir": {"type": "string"},
                    "backend": {"type": "string", "enum": ["codex", "gemini", "claude"], "default": "codex"},
                    "sandbox": {"type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"], "default": "read-only"},
                    "role": {"type": "string", "description": "Optional built-in role name or absolute role file path."},
                    "model": {"type": "string"},
                    "artifacts": {"type": "array", "items": {"type": "string"}},
                    "state_dir": {"type": "string", "description": "Optional directory for persisted prompt/output files."},
                    "return_all_messages": {"type": "boolean", "default": False},
                },
                "required": ["prompt", "workdir"],
            },
        },
        {
            "name": "codex_session_ensure",
            "description": "Create or inspect a reusable named Codex session slot. This reserves role/workdir/backend metadata before the first message is sent.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_name": {"type": "string"},
                    "workdir": {"type": "string"},
                    "backend": {"type": "string", "enum": ["codex", "gemini", "claude"], "default": "codex"},
                    "sandbox": {"type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"], "default": "read-only"},
                    "role": {"type": "string", "description": "Optional built-in role name or absolute role file path."},
                    "state_dir": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["session_name", "workdir"],
            },
        },
        {
            "name": "codex_session_send",
            "description": "Send a prompt to a named reusable session. Reuses SESSION_ID automatically if one already exists; otherwise creates it on the first run.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_name": {"type": "string"},
                    "prompt": {"type": "string"},
                    "workdir": {"type": "string", "description": "Required on first use; later calls default to the registered value."},
                    "backend": {"type": "string", "enum": ["codex", "gemini", "claude"], "default": "codex"},
                    "sandbox": {"type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"], "default": "read-only"},
                    "role": {"type": "string", "description": "Optional built-in role name or absolute role file path."},
                    "model": {"type": "string"},
                    "artifacts": {"type": "array", "items": {"type": "string"}},
                    "state_dir": {"type": "string"},
                    "summary": {"type": "string"},
                    "return_all_messages": {"type": "boolean", "default": False},
                },
                "required": ["session_name", "prompt"],
            },
        },
        {
            "name": "codex_session_status",
            "description": "Read the persisted metadata for a named reusable session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_name": {"type": "string"},
                    "state_dir": {"type": "string"},
                },
                "required": ["session_name"],
            },
        },
        {
            "name": "codex_session_list",
            "description": "List all persisted reusable sessions under the selected state directory.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "state_dir": {"type": "string"},
                },
            },
        },
        {
            "name": "codex_session_close",
            "description": "Mark a reusable session as closed so it is no longer reused by default.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_name": {"type": "string"},
                    "state_dir": {"type": "string"},
                },
                "required": ["session_name"],
            },
        },
    ]


def _ensure_session(arguments: dict[str, Any]) -> dict[str, Any]:
    session_name = str(arguments["session_name"]).strip()
    workdir = str(arguments["workdir"]).strip()
    backend = str(arguments.get("backend") or "codex")
    sandbox = str(arguments.get("sandbox") or "read-only")
    summary = str(arguments.get("summary") or "")
    state_root = _state_root(arguments.get("state_dir"))
    registry = _read_registry(state_root)
    sessions = registry.setdefault("sessions", {})
    key = _session_key(session_name)
    role_file = _resolve_role_file(backend, arguments.get("role"))
    normalized_workdir = str(Path(workdir).expanduser().resolve())

    existing = sessions.get(key)
    if existing:
        if existing.get("workdir") != normalized_workdir:
            raise ValueError(f"Session {session_name} already exists with a different workdir")
        if existing.get("backend") != backend:
            raise ValueError(f"Session {session_name} already exists with backend {existing.get('backend')}")
        if role_file and existing.get("role_file") and existing.get("role_file") != role_file:
            raise ValueError(f"Session {session_name} already exists with a different role")
        if summary:
            existing["summary"] = summary
        _write_registry(state_root, registry)
        return {"created": False, "session": existing, "state_dir": str(state_root)}

    session = {
        "session_name": session_name,
        "session_key": key,
        "session_id": "",
        "backend": backend,
        "sandbox": sandbox,
        "workdir": normalized_workdir,
        "role_file": role_file,
        "status": "ready",
        "summary": summary,
        "last_output_file": "",
        "updated_at": _now_token(),
    }
    _ensure_dir(_session_dir(state_root, session_name))
    sessions[key] = session
    _write_registry(state_root, registry)
    return {"created": True, "session": session, "state_dir": str(state_root)}


def _session_status(arguments: dict[str, Any]) -> dict[str, Any]:
    session_name = str(arguments["session_name"]).strip()
    state_root = _state_root(arguments.get("state_dir"))
    registry = _read_registry(state_root)
    session = registry.get("sessions", {}).get(_session_key(session_name))
    if not session:
        raise ValueError(f"Session not found: {session_name}")
    return {"session": session, "state_dir": str(state_root)}


def _session_list(arguments: dict[str, Any]) -> dict[str, Any]:
    state_root = _state_root(arguments.get("state_dir"))
    registry = _read_registry(state_root)
    sessions = list(registry.get("sessions", {}).values())
    sessions.sort(key=lambda item: item.get("session_name", ""))
    return {"sessions": sessions, "state_dir": str(state_root)}


def _session_close(arguments: dict[str, Any]) -> dict[str, Any]:
    session_name = str(arguments["session_name"]).strip()
    state_root = _state_root(arguments.get("state_dir"))
    registry = _read_registry(state_root)
    session = registry.get("sessions", {}).get(_session_key(session_name))
    if not session:
        raise ValueError(f"Session not found: {session_name}")
    session["status"] = "closed"
    session["updated_at"] = _now_token()
    _write_registry(state_root, registry)
    return {"closed": True, "session": session, "state_dir": str(state_root)}


def _session_send(arguments: dict[str, Any]) -> dict[str, Any]:
    session_name = str(arguments["session_name"]).strip()
    prompt = str(arguments["prompt"])
    backend = str(arguments.get("backend") or "codex")
    sandbox = str(arguments.get("sandbox") or "read-only")
    summary = str(arguments.get("summary") or "")
    return_all_messages = bool(arguments.get("return_all_messages"))
    artifacts = [str(item) for item in arguments.get("artifacts") or []]
    state_root = _state_root(arguments.get("state_dir"))
    registry = _read_registry(state_root)
    sessions = registry.setdefault("sessions", {})
    key = _session_key(session_name)
    session = sessions.get(key)
    requested_workdir = arguments.get("workdir")
    role_file = _resolve_role_file(backend, arguments.get("role"))

    if not session:
        if not requested_workdir:
            raise ValueError("workdir is required on first use of a session")
        created = _ensure_session(arguments)
        session = created["session"]
        registry = _read_registry(state_root)
        sessions = registry.setdefault("sessions", {})
        session = sessions[key]
    else:
        if session.get("status") == "closed":
            raise ValueError(f"Session {session_name} is closed")
        if requested_workdir:
            normalized_workdir = str(Path(str(requested_workdir)).expanduser().resolve())
            if session.get("workdir") != normalized_workdir:
                raise ValueError(f"Session {session_name} already exists with a different workdir")
        if session.get("backend") != backend:
            raise ValueError(f"Session {session_name} already exists with backend {session.get('backend')}")
        if role_file and session.get("role_file") and session.get("role_file") != role_file:
            raise ValueError(f"Session {session_name} already exists with a different role")
        if role_file and not session.get("role_file"):
            session["role_file"] = role_file

    prompt_text = _materialize_prompt(prompt, artifacts)
    session_root = _ensure_dir(_session_dir(state_root, session_name))
    payload = _run_bridge(
        prompt=prompt_text,
        workdir=session["workdir"],
        backend=session["backend"],
        sandbox=session["sandbox"],
        state_dir=session_root,
        session_id=str(session.get("session_id") or ""),
        role=str(session.get("role_file") or ""),
        model=str(arguments.get("model") or ""),
        return_all_messages=return_all_messages,
    )

    session["updated_at"] = _now_token()
    session["summary"] = summary or session.get("summary", "")
    session["last_output_file"] = payload.get("output_file", "")
    session["last_prompt_file"] = payload.get("prompt_file", "")
    session["last_success"] = bool(payload.get("success"))
    if payload.get("success"):
        session["status"] = "active"
        session["session_id"] = payload.get("SESSION_ID", session.get("session_id", ""))
    else:
        session["status"] = "failed"
    _write_registry(state_root, registry)
    return {"session": session, "result": payload, "state_dir": str(state_root)}


def _once(arguments: dict[str, Any]) -> dict[str, Any]:
    prompt = str(arguments["prompt"])
    workdir = str(Path(str(arguments["workdir"])).expanduser().resolve())
    backend = str(arguments.get("backend") or "codex")
    sandbox = str(arguments.get("sandbox") or "read-only")
    role_file = _resolve_role_file(backend, arguments.get("role"))
    artifacts = [str(item) for item in arguments.get("artifacts") or []]
    state_root = _state_root(arguments.get("state_dir"))
    payload = _run_bridge(
        prompt=_materialize_prompt(prompt, artifacts),
        workdir=workdir,
        backend=backend,
        sandbox=sandbox,
        state_dir=_ensure_dir(state_root / "adhoc"),
        role=role_file,
        model=str(arguments.get("model") or ""),
        return_all_messages=bool(arguments.get("return_all_messages")),
    )
    return {"result": payload, "state_dir": str(state_root)}


def _handle_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "codex_once":
        return _once(arguments)
    if name == "codex_session_ensure":
        return _ensure_session(arguments)
    if name == "codex_session_send":
        return _session_send(arguments)
    if name == "codex_session_status":
        return _session_status(arguments)
    if name == "codex_session_list":
        return _session_list(arguments)
    if name == "codex_session_close":
        return _session_close(arguments)
    raise ValueError(f"Unknown tool: {name}")


def _read_message() -> dict[str, Any] | None:
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\r\n", b"\n"):
            if headers:
                break
            continue
        decoded = line.decode("utf-8").strip()
        if ":" not in decoded:
            continue
        key, value = decoded.split(":", 1)
        headers[key.lower().strip()] = value.strip()
    content_length = int(headers.get("content-length", "0"))
    if content_length <= 0:
        return None
    body = sys.stdin.buffer.read(content_length)
    if not body:
        return None
    return json.loads(body.decode("utf-8"))


def _write_message(payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
    sys.stdout.buffer.write(header)
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def _success(message_id: Any, result: dict[str, Any]) -> None:
    _write_message({"jsonrpc": "2.0", "id": message_id, "result": result})


def _error(message_id: Any, code: int, message: str) -> None:
    _write_message({"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}})


def _run_cli_mode() -> int | None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--tool")
    parser.add_argument("--arguments-json")
    parser.add_argument("--tool-definitions", action="store_true")
    args, _unknown = parser.parse_known_args()

    if not args.tool_definitions and not args.tool:
        return None

    try:
        if args.tool_definitions:
            payload: dict[str, Any] = {"success": True, "tools": _tool_definitions()}
        else:
            arguments = json.loads(args.arguments_json) if args.arguments_json else {}
            if not isinstance(arguments, dict):
                raise ValueError("arguments-json must decode to an object")
            payload = _handle_tool(str(args.tool), arguments)
            if "success" not in payload:
                payload = {"success": True, **payload}
    except Exception as error:
        payload = {"success": False, "error": str(error)}

    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    return 0


def _serve_mcp() -> int:
    while True:
        message = _read_message()
        if message is None:
            return 0

        message_id = message.get("id")
        method = message.get("method")
        params = message.get("params") or {}

        try:
            if method == "initialize":
                _success(
                    message_id,
                    {
                        "protocolVersion": PROTOCOL_VERSION,
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                    },
                )
            elif method == "notifications/initialized":
                continue
            elif method == "tools/list":
                _success(message_id, {"tools": _tool_definitions()})
            elif method == "tools/call":
                tool_name = params.get("name")
                arguments = params.get("arguments") or {}
                payload = _handle_tool(str(tool_name), arguments)
                _success(message_id, _tool_result(payload, is_error=False))
            else:
                if message_id is not None:
                    _error(message_id, -32601, f"Method not found: {method}")
        except Exception as error:
            if message_id is not None:
                _success(message_id, _tool_result({"success": False, "error": str(error)}, is_error=True))


def main() -> int:
    cli_result = _run_cli_mode()
    if cli_result is not None:
        return cli_result
    return _serve_mcp()


if __name__ == "__main__":
    raise SystemExit(main())
