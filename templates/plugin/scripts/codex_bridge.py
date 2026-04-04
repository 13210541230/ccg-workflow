"""
CCG Bridge Script for Claude Agent Skills.
Wraps Codex/Gemini/Claude CLIs behind a single JSON-based interface.
"""
from __future__ import annotations

import argparse
import json
import os
import queue
import re
import shutil
import threading
import time
import subprocess
import sys
from pathlib import Path
from typing import Any, Generator, List, Optional


def _get_windows_npm_paths() -> List[Path]:
    """Return candidate directories for npm global installs on Windows."""
    if os.name != "nt":
        return []
    paths: List[Path] = []
    env = os.environ
    if prefix := env.get("NPM_CONFIG_PREFIX") or env.get("npm_config_prefix"):
        paths.append(Path(prefix))
    if appdata := env.get("APPDATA"):
        paths.append(Path(appdata) / "npm")
    if localappdata := env.get("LOCALAPPDATA"):
        paths.append(Path(localappdata) / "npm")
    if programfiles := env.get("ProgramFiles"):
        paths.append(Path(programfiles) / "nodejs")
    return paths


def _augment_path_env(env: dict) -> None:
    """Prepend npm global directories to PATH if missing."""
    if os.name != "nt":
        return
    path_key = next((k for k in env if k.upper() == "PATH"), "PATH")
    path_entries = [p for p in env.get(path_key, "").split(os.pathsep) if p]
    lower_set = {p.lower() for p in path_entries}
    for candidate in _get_windows_npm_paths():
        if candidate.is_dir() and str(candidate).lower() not in lower_set:
            path_entries.insert(0, str(candidate))
            lower_set.add(str(candidate).lower())
    env[path_key] = os.pathsep.join(path_entries)


def _resolve_executable(name: str, env: dict) -> str:
    """Resolve executable path, checking npm directories for .cmd/.bat on Windows."""
    if os.path.isabs(name) or os.sep in name or (os.altsep and os.altsep in name):
        return name
    path_key = next((k for k in env if k.upper() == "PATH"), "PATH")
    path_val = env.get(path_key)
    win_exts = {".exe", ".cmd", ".bat", ".com"}
    if resolved := shutil.which(name, path=path_val):
        if os.name == "nt":
            suffix = Path(resolved).suffix.lower()
            if not suffix:
                resolved_dir = str(Path(resolved).parent)
                for ext in (".cmd", ".bat", ".exe", ".com"):
                    candidate = Path(resolved_dir) / f"{name}{ext}"
                    if candidate.is_file():
                        return str(candidate)
            elif suffix not in win_exts:
                return resolved
        return resolved
    if os.name == "nt":
        for base in _get_windows_npm_paths():
            for ext in (".cmd", ".bat", ".exe", ".com"):
                candidate = base / f"{name}{ext}"
                if candidate.is_file():
                    return str(candidate)
    return name


def _extract_session_id(event: dict[str, Any]) -> str:
    for key in ("thread_id", "session_id"):
        value = event.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def _normalize_codex_text(text: Any) -> str:
    if isinstance(text, str):
        return text
    if isinstance(text, list):
        return "".join(part for part in text if isinstance(part, str))
    return ""


def _is_completion_event(line: str, backend: str) -> bool:
    try:
        data = json.loads(line)
    except (json.JSONDecodeError, TypeError):
        return False

    event_type = data.get("type")
    if backend == "codex":
        return event_type in {"turn.completed", "thread.completed"}
    if backend == "gemini":
        return event_type == "result" and data.get("status") in {"success", "error", "complete", "failed"}
    if backend == "claude":
        return event_type == "result"
    return False


def run_shell_command(cmd: List[str], backend: str) -> Generator[str, None, None]:
    """Execute a command and stream its output line-by-line."""
    env = os.environ.copy()
    _augment_path_env(env)

    popen_cmd = cmd.copy()
    exe_path = _resolve_executable(cmd[0], env)
    popen_cmd[0] = exe_path

    # Windows .cmd/.bat files need cmd.exe wrapper (avoid shell=True for security)
    if os.name == "nt" and Path(exe_path).suffix.lower() in {".cmd", ".bat"}:
        # Escape shell metacharacters for cmd.exe
        def _cmd_quote(arg: str) -> str:
            if not arg:
                return '""'
            # For Windows batch files, % and ^ must be escaped before quoting
            arg = arg.replace('%', '%%')
            arg = arg.replace('^', '^^')
            if any(c in arg for c in '&|<>()^" \t'):
                # To safely escape " inside "...", close quote, escape ", reopen
                escaped = arg.replace('"', '"^""')
                return f'"{escaped}"'
            return arg
        cmdline = " ".join(_cmd_quote(a) for a in popen_cmd)
        comspec = env.get("COMSPEC", "cmd.exe")
        popen_cmd = f'"{comspec}" /d /s /c "{cmdline}"'

    process = subprocess.Popen(
        popen_cmd,
        shell=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        encoding='utf-8',
        errors='replace',
        env=env,
    )

    output_queue: queue.Queue[Optional[str]] = queue.Queue()
    GRACEFUL_SHUTDOWN_DELAY = 0.3

    def read_output() -> None:
        if process.stdout:
            for line in iter(process.stdout.readline, ""):
                stripped = line.strip()
                output_queue.put(stripped)
                if _is_completion_event(stripped, backend):
                    time.sleep(GRACEFUL_SHUTDOWN_DELAY)
                    process.terminate()
                    break
            process.stdout.close()
        output_queue.put(None)

    thread = threading.Thread(target=read_output)
    thread.start()

    while True:
        try:
            line = output_queue.get(timeout=0.5)
            if line is None:
                break
            yield line
        except queue.Empty:
            if process.poll() is not None and not thread.is_alive():
                break

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    thread.join(timeout=5)

    while not output_queue.empty():
        try:
            line = output_queue.get_nowait()
            if line is not None:
                yield line
        except queue.Empty:
            break

def windows_escape(prompt):
    """Windows style string escaping for newlines and special chars in prompt text."""
    result = prompt.replace('\n', '\\n')
    result = result.replace('\r', '\\r')
    result = result.replace('\t', '\\t')
    return result


def configure_windows_stdio() -> None:
    """Configure stdout/stderr to use UTF-8 encoding on Windows."""
    if os.name != "nt":
        return
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8")
            except (ValueError, OSError):
                pass


def _build_command(args: argparse.Namespace, prompt: str) -> List[str]:
    backend = args.backend
    if backend == "codex":
        cmd = ["mycodex", "exec", "--sandbox", args.sandbox, "--cd", args.cd, "--json"]

        if args.image:
            cmd.extend(["--image", ",".join(args.image)])
        if args.model:
            cmd.extend(["--model", args.model])
        if args.profile:
            cmd.extend(["--profile", args.profile])
        if args.yolo:
            cmd.append("--yolo")
        if args.skip_git_repo_check:
            cmd.append("--skip-git-repo-check")
        if args.SESSION_ID:
            cmd.extend(["resume", args.SESSION_ID])

        cmd += ["--", prompt]
        return cmd

    if backend == "gemini":
        cmd = ["gemini"]
        if args.model:
            cmd.extend(["-m", args.model])
        cmd.extend(["-o", "stream-json", "-y"])
        if args.SESSION_ID:
            cmd.extend(["-r", args.SESSION_ID])
        cmd.extend(["-p", prompt])
        return cmd

    cmd = ["claude", "-p", "--setting-sources", "", "--output-format", "stream-json", "--verbose"]
    if args.yolo:
        cmd.append("--dangerously-skip-permissions")
    if args.SESSION_ID:
        cmd.extend(["-r", args.SESSION_ID])
    cmd.append(prompt)
    return cmd


def _collect_agent_output(backend: str, event: dict[str, Any], agent_messages: str) -> str:
    if backend == "codex":
        item = event.get("item")
        if isinstance(item, dict) and item.get("type") == "agent_message":
            return agent_messages + _normalize_codex_text(item.get("text"))
        return agent_messages

    if backend == "gemini":
        content = event.get("content")
        if isinstance(content, str) and content:
            return agent_messages + content
        return agent_messages

    result = event.get("result")
    if isinstance(result, str) and result:
        return result
    return agent_messages


def _collect_errors(backend: str, event: dict[str, Any]) -> List[str]:
    errors: List[str] = []

    if backend == "codex":
        if "fail" in str(event.get("type", "")):
            errors.append(event.get("error", {}).get("message", ""))
        if "error" in str(event.get("type", "")):
            error_msg = event.get("message", "")
            is_reconnecting = isinstance(error_msg, str) and bool(re.match(r"^Reconnecting\.\.\.\s+\d+/\d+$", error_msg))
            if not is_reconnecting:
                errors.append(error_msg)
        return [err for err in errors if err]

    event_type = str(event.get("type", ""))
    status = str(event.get("status", ""))
    if status in {"error", "failed"}:
        errors.append(str(event.get("message") or event.get("content") or "backend returned an error status"))
    if event_type == "error":
        errors.append(str(event.get("message") or event.get("error") or "backend emitted an error event"))
    return [err for err in errors if err]


def main():
    configure_windows_stdio()
    parser = argparse.ArgumentParser(description="CCG multi-backend bridge")
    parser.add_argument("--backend", default="codex", choices=["codex", "gemini", "claude"], help="Backend CLI to invoke. Defaults to codex.")
    parser.add_argument("--PROMPT", default="", help="Instruction for the task. Required unless --prompt-file is used.")
    parser.add_argument("--cd", required=True, help="Workspace root for the backend CLI.")
    parser.add_argument("--role", default="", help="Path to a role prompt file. Its content is prepended to PROMPT.")
    parser.add_argument("--prompt-file", default="", help="Read PROMPT from a file instead of CLI argument (avoids command-line length limits).")
    parser.add_argument("--sandbox", default="read-only", choices=["read-only", "workspace-write", "danger-full-access"], help="Sandbox policy for model-generated commands. Defaults to `read-only`.")
    parser.add_argument("--SESSION_ID", default="", help="Resume the specified backend session. Defaults to empty, start a new session.")
    parser.add_argument("--skip-git-repo-check", action="store_true", help="Allow codex running outside a Git repository when explicitly needed.")
    parser.add_argument("--return-all-messages", action="store_true", help="Return all streamed messages instead of only the final agent reply.")
    parser.add_argument("--image", action="append", default=[], help="Attach one or more image files to the initial prompt. Separate multiple paths with commas or repeat the flag.")
    parser.add_argument("--model", default="", help="Backend-specific model override. Only pass when explicitly requested by the user.")
    parser.add_argument("--yolo", action="store_true", help="Run every command without approvals or sandboxing. Only use when `sandbox` couldn't be applied.")
    parser.add_argument("--profile", default="", help="Codex profile name from `~/.codex/config.toml`. Only valid for backend=codex.")

    args = parser.parse_args()

    # Resolve PROMPT: --prompt-file overrides --PROMPT; --role prepends
    PROMPT = args.PROMPT
    if args.prompt_file:
        prompt_path = Path(os.path.expanduser(args.prompt_file)).expanduser()
        if not prompt_path.is_file():
            print(json.dumps({"success": False, "error": f"--prompt-file not found: {prompt_path}"}, ensure_ascii=False))
            sys.exit(1)
        PROMPT = prompt_path.read_text(encoding="utf-8").strip()

    if not PROMPT:
        print(json.dumps({"success": False, "error": "--PROMPT or --prompt-file is required."}, ensure_ascii=False))
        sys.exit(1)

    if args.role:
        role_path = Path(os.path.expanduser(args.role)).expanduser()
        if not role_path.is_file():
            print(json.dumps({"success": False, "error": f"--role file not found: {role_path}"}, ensure_ascii=False))
            sys.exit(1)
        role_content = role_path.read_text(encoding="utf-8").strip()
        PROMPT = role_content + "\n\n" + PROMPT

    if os.name == "nt":
        PROMPT = windows_escape(PROMPT)

    cmd = _build_command(args, PROMPT)

    # Execution Logic
    all_messages = []
    agent_messages = ""
    success = True
    err_message = ""
    thread_id = None

    for line in run_shell_command(cmd, args.backend):
        try:
            line_dict = json.loads(line.strip())
            all_messages.append(line_dict)
            agent_messages = _collect_agent_output(args.backend, line_dict, agent_messages)

            event_session_id = _extract_session_id(line_dict)
            if event_session_id:
                thread_id = event_session_id

            for backend_error in _collect_errors(args.backend, line_dict):
                success = False if len(agent_messages) == 0 else success
                err_message += f"\n\n[{args.backend} error] {backend_error}"

        except json.JSONDecodeError:
            err_message += "\n\n[json decode error] " + line
            continue

        except Exception as error:
            err_message += "\n\n[unexpected error] " + f"Unexpected error: {error}. Line: {line!r}"
            success = False
            break

    if thread_id is None:
        success = False
        err_message = f"Failed to get `SESSION_ID` from the {args.backend} session. \n\n" + err_message

    if len(agent_messages) == 0:
        success = False
        err_message = f"Failed to get `agent_messages` from the {args.backend} session. \n\n You can try to set `return_all_messages` to `True` to get the full reasoning information. " + err_message

    if success:
        result = {
            "success": True,
            "backend": args.backend,
            "SESSION_ID": thread_id,
            "agent_messages": agent_messages,
        }

    else:
        result = {"success": False, "backend": args.backend, "error": err_message}

    if args.return_all_messages:
        result["all_messages"] = all_messages

    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
