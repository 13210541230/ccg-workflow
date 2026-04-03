# agent-platform-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python MCP server (`agent-platform-mcp`) that wraps mycodex/claude_code/gemini CLI backends with capability-based model selection driven by `~/.agent-platform/config.json`.

**Architecture:** Pure Python using the official `mcp` SDK. Four focused modules (config, session, bridge, server) each with one responsibility, wired together in `server.py`. Session state persists in `~/.agent-platform/mcp/sessions/registry.json`.

**Tech Stack:** Python 3.11+, `mcp>=1.0`, `pydantic>=2.0`, `pytest`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/config.py` | Load `~/.agent-platform/config.json`, resolve capability→(model, effort) |
| `src/session.py` | Read/write session registry JSON |
| `src/bridge.py` | subprocess call to mycodex/claude_code, temp file prompt, output parsing |
| `src/server.py` | MCP Server entry point, 6 tool definitions, routes to above modules |
| `tests/test_config.py` | Unit tests for config loading and capability resolution |
| `tests/test_session.py` | Unit tests for session registry CRUD |
| `tests/test_bridge.py` | Unit tests for bridge command building (subprocess mocked) |
| `pyproject.toml` | Package definition and dependencies |

---

## Task 1: Repo Scaffold

**Files:**
- Create: `D:/C_projects/agent-platform-mcp/pyproject.toml`
- Create: `D:/C_projects/agent-platform-mcp/src/__init__.py` (empty)
- Create: `D:/C_projects/agent-platform-mcp/tests/__init__.py` (empty)

- [ ] **Step 1: Create repo and directory structure**

```bash
mkdir -p D:/C_projects/agent-platform-mcp/src
mkdir -p D:/C_projects/agent-platform-mcp/tests
cd D:/C_projects/agent-platform-mcp
git init
```

- [ ] **Step 2: Write pyproject.toml**

Create `D:/C_projects/agent-platform-mcp/pyproject.toml`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "agent-platform-mcp"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "mcp>=1.0",
    "pydantic>=2.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23"]

[tool.hatch.build.targets.wheel]
packages = ["src"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: Create empty placeholder files**

Create `D:/C_projects/agent-platform-mcp/src/__init__.py` — empty file.

Create `D:/C_projects/agent-platform-mcp/tests/__init__.py` — empty file.

- [ ] **Step 4: Install dependencies**

```bash
cd D:/C_projects/agent-platform-mcp
pip install -e ".[dev]"
```

Expected: no errors, `mcp` and `pydantic` installed.

- [ ] **Step 5: Commit scaffold**

```bash
git add pyproject.toml src/__init__.py tests/__init__.py
git commit -m "chore: scaffold agent-platform-mcp repo"
```

---

## Task 2: config.py — Capability Resolution

**Files:**
- Create: `D:/C_projects/agent-platform-mcp/src/config.py`
- Create: `D:/C_projects/agent-platform-mcp/tests/test_config.py`

- [ ] **Step 1: Write failing tests**

Create `D:/C_projects/agent-platform-mcp/tests/test_config.py`:

```python
import json
import pytest
from pathlib import Path

# Add src/ to path so imports work
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import config


SAMPLE_CONFIG = {
    "default_executor": "mycodex",
    "default_model": "gpt-5.4",
    "executor_paths": {
        "mycodex": "mycodex",
        "claude_code": "claude",
    },
    "executor_model_table": {
        "mycodex": {
            "small": [{"model": "gpt-5.4-mini", "reasoning_effort": "low"}],
            "medium": [{"model": "gpt-5.4", "reasoning_effort": "medium"}],
            "large": [{"model": "gpt-5.4", "reasoning_effort": "high"}],
        }
    },
}


def test_resolve_capability_small(tmp_path):
    model, effort = config.resolve_capability("mycodex", "small", SAMPLE_CONFIG)
    assert model == "gpt-5.4-mini"
    assert effort == "low"


def test_resolve_capability_medium(tmp_path):
    model, effort = config.resolve_capability("mycodex", "medium", SAMPLE_CONFIG)
    assert model == "gpt-5.4"
    assert effort == "medium"


def test_resolve_capability_large(tmp_path):
    model, effort = config.resolve_capability("mycodex", "large", SAMPLE_CONFIG)
    assert model == "gpt-5.4"
    assert effort == "high"


def test_resolve_capability_unknown_executor_falls_back():
    model, effort = config.resolve_capability("unknown_exec", "medium", SAMPLE_CONFIG)
    assert model == "gpt-5.4"   # default_model
    assert effort == "medium"


def test_resolve_capability_unknown_capability_falls_back():
    model, effort = config.resolve_capability("mycodex", "xlarge", SAMPLE_CONFIG)
    assert model == "gpt-5.4"
    assert effort == "medium"


def test_get_executor_path():
    assert config.get_executor_path("mycodex", SAMPLE_CONFIG) == "mycodex"
    assert config.get_executor_path("claude_code", SAMPLE_CONFIG) == "claude"


def test_get_executor_path_unknown_returns_name():
    assert config.get_executor_path("gemini", SAMPLE_CONFIG) == "gemini"


def test_get_default_executor():
    assert config.get_default_executor(SAMPLE_CONFIG) == "mycodex"


def test_load_config_missing_file_returns_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CONFIG_PATH", tmp_path / "nonexistent.json")
    cfg = config.load_config()
    assert cfg["default_executor"] == "mycodex"
    assert "default_model" in cfg


def test_load_config_reads_file(tmp_path, monkeypatch):
    cfg_file = tmp_path / "config.json"
    cfg_file.write_text(json.dumps({"default_executor": "claude_code", "default_model": "claude-sonnet-4-6"}))
    monkeypatch.setattr(config, "CONFIG_PATH", cfg_file)
    cfg = config.load_config()
    assert cfg["default_executor"] == "claude_code"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd D:/C_projects/agent-platform-mcp
pytest tests/test_config.py -v
```

Expected: `ModuleNotFoundError: No module named 'config'`

- [ ] **Step 3: Implement config.py**

Create `D:/C_projects/agent-platform-mcp/src/config.py`:

```python
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONFIG_PATH = Path.home() / ".agent-platform" / "config.json"

_DEFAULTS: dict[str, Any] = {
    "default_executor": "mycodex",
    "default_model": "gpt-5.4",
    "executor_paths": {
        "mycodex": "mycodex",
        "claude_code": "claude",
        "codex": "codex",
    },
    "executor_model_table": {},
}


def load_config() -> dict[str, Any]:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return _DEFAULTS.copy()


def resolve_capability(
    executor: str,
    capability: str,
    cfg: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Return (model, reasoning_effort) for the given executor and capability level."""
    if cfg is None:
        cfg = load_config()
    table = cfg.get("executor_model_table", {})
    entries = table.get(executor, {}).get(capability, [])
    if entries:
        entry = entries[0]
        return entry["model"], entry["reasoning_effort"]
    return cfg.get("default_model", "gpt-5.4"), "medium"


def get_executor_path(executor: str, cfg: dict[str, Any] | None = None) -> str:
    if cfg is None:
        cfg = load_config()
    return cfg.get("executor_paths", {}).get(executor, executor)


def get_default_executor(cfg: dict[str, Any] | None = None) -> str:
    if cfg is None:
        cfg = load_config()
    return cfg.get("default_executor", "mycodex")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_config.py -v
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.py tests/test_config.py
git commit -m "feat: add config.py with capability resolution"
```

---

## Task 3: session.py — Registry CRUD

**Files:**
- Create: `D:/C_projects/agent-platform-mcp/src/session.py`
- Create: `D:/C_projects/agent-platform-mcp/tests/test_session.py`

- [ ] **Step 1: Write failing tests**

Create `D:/C_projects/agent-platform-mcp/tests/test_session.py`:

```python
import json
import pytest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import session


@pytest.fixture()
def reg_path(tmp_path, monkeypatch):
    p = tmp_path / "sessions" / "registry.json"
    monkeypatch.setattr(session, "REGISTRY_PATH", p)
    monkeypatch.setattr(session, "SESSIONS_DIR", p.parent)
    return p


def test_ensure_session_creates_new(reg_path):
    entry = session.ensure_session("s1", {"executor": "mycodex", "model": "gpt-5.4",
                                          "capability": "medium", "reasoning_effort": "medium",
                                          "workdir": "."})
    assert entry["executor"] == "mycodex"
    assert "created_at" in entry
    assert reg_path.exists()


def test_ensure_session_is_idempotent(reg_path):
    session.ensure_session("s1", {"executor": "mycodex", "model": "gpt-5.4",
                                  "capability": "medium", "reasoning_effort": "medium", "workdir": "."})
    session.ensure_session("s1", {"executor": "claude_code", "model": "claude-sonnet-4-6",
                                  "capability": "large", "reasoning_effort": "high", "workdir": "."})
    entry = session.get_session("s1")
    # Second call should NOT overwrite existing entry
    assert entry["executor"] == "mycodex"


def test_get_session_missing_returns_none(reg_path):
    assert session.get_session("nonexistent") is None


def test_update_session(reg_path):
    session.ensure_session("s1", {"executor": "mycodex", "model": "gpt-5.4",
                                  "capability": "medium", "reasoning_effort": "medium", "workdir": "."})
    session.update_session("s1", {"session_id": "sess_abc"})
    entry = session.get_session("s1")
    assert entry["session_id"] == "sess_abc"
    assert "last_used" in entry


def test_list_sessions(reg_path):
    session.ensure_session("s1", {"executor": "mycodex", "model": "gpt-5.4",
                                  "capability": "medium", "reasoning_effort": "medium", "workdir": "."})
    session.ensure_session("s2", {"executor": "mycodex", "model": "gpt-5.4",
                                  "capability": "small", "reasoning_effort": "low", "workdir": "."})
    sessions = session.list_sessions()
    names = [s["name"] for s in sessions]
    assert "s1" in names
    assert "s2" in names


def test_close_session_removes_entry(reg_path):
    session.ensure_session("s1", {"executor": "mycodex", "model": "gpt-5.4",
                                  "capability": "medium", "reasoning_effort": "medium", "workdir": "."})
    removed = session.close_session("s1")
    assert removed is True
    assert session.get_session("s1") is None


def test_close_session_missing_returns_false(reg_path):
    assert session.close_session("nonexistent") is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_session.py -v
```

Expected: `ModuleNotFoundError: No module named 'session'`

- [ ] **Step 3: Implement session.py**

Create `D:/C_projects/agent-platform-mcp/src/session.py`:

```python
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SESSIONS_DIR = Path.home() / ".agent-platform" / "mcp" / "sessions"
REGISTRY_PATH = SESSIONS_DIR / "registry.json"


def _load() -> dict[str, Any]:
    if REGISTRY_PATH.exists():
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return {}


def _save(registry: dict[str, Any]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2, ensure_ascii=False), encoding="utf-8")


def ensure_session(name: str, metadata: dict[str, Any]) -> dict[str, Any]:
    """Create session if it doesn't exist. Returns existing entry if already present."""
    registry = _load()
    if name not in registry:
        registry[name] = {
            "session_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            **metadata,
        }
        _save(registry)
    return registry[name]


def get_session(name: str) -> dict[str, Any] | None:
    return _load().get(name)


def update_session(name: str, updates: dict[str, Any]) -> None:
    registry = _load()
    if name in registry:
        registry[name].update(updates)
        registry[name]["last_used"] = datetime.now(timezone.utc).isoformat()
        _save(registry)


def list_sessions() -> list[dict[str, Any]]:
    registry = _load()
    return [{"name": k, **v} for k, v in registry.items()]


def close_session(name: str) -> bool:
    registry = _load()
    if name in registry:
        del registry[name]
        _save(registry)
        return True
    return False
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_session.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session.py tests/test_session.py
git commit -m "feat: add session.py with registry CRUD"
```

---

## Task 4: bridge.py — Subprocess Execution

**Files:**
- Create: `D:/C_projects/agent-platform-mcp/src/bridge.py`
- Create: `D:/C_projects/agent-platform-mcp/tests/test_bridge.py`

- [ ] **Step 1: Write failing tests**

Create `D:/C_projects/agent-platform-mcp/tests/test_bridge.py`:

```python
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import bridge


def make_completed_process(stdout="output", returncode=0):
    m = MagicMock()
    m.stdout = stdout
    m.returncode = returncode
    m.stderr = ""
    return m


def test_run_once_basic_command(tmp_path):
    with patch("bridge.subprocess.run", return_value=make_completed_process("result")) as mock_run:
        result = bridge.run_once(
            prompt="do something",
            executor_path="mycodex",
            model="gpt-5.4",
            reasoning_effort="medium",
            workdir="/tmp",
            sandbox="workspace-write",
        )
    assert result == "result"
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "mycodex"
    assert "--model" in cmd
    assert "gpt-5.4" in cmd
    assert "--reasoning-effort" in cmd
    assert "medium" in cmd
    assert "--sandbox" in cmd
    assert "workspace-write" in cmd
    assert "--cd" in cmd
    assert "/tmp" in cmd
    assert "--json" in cmd


def test_run_once_with_session_id(tmp_path):
    with patch("bridge.subprocess.run", return_value=make_completed_process("out")) as mock_run:
        bridge.run_once(
            prompt="continue",
            executor_path="mycodex",
            model="gpt-5.4",
            reasoning_effort="medium",
            session_id="sess_abc",
        )
    cmd = mock_run.call_args[0][0]
    assert "--session" in cmd
    assert "sess_abc" in cmd


def test_run_once_without_session_id_no_session_flag(tmp_path):
    with patch("bridge.subprocess.run", return_value=make_completed_process("out")) as mock_run:
        bridge.run_once(
            prompt="hello",
            executor_path="mycodex",
            model="gpt-5.4",
            reasoning_effort="medium",
        )
    cmd = mock_run.call_args[0][0]
    assert "--session" not in cmd


def test_run_once_raises_on_nonzero_exit():
    proc = make_completed_process(returncode=1)
    proc.stderr = "some error"
    with patch("bridge.subprocess.run", return_value=proc):
        with pytest.raises(RuntimeError, match="Executor failed"):
            bridge.run_once(
                prompt="fail",
                executor_path="mycodex",
                model="gpt-5.4",
                reasoning_effort="medium",
            )


def test_resolve_role_content_absolute_path(tmp_path):
    role_file = tmp_path / "myrole.md"
    role_file.write_text("You are a planner.")
    content = bridge.resolve_role_content(str(role_file), "mycodex")
    assert content == "You are a planner."


def test_resolve_role_content_builtin_role(tmp_path, monkeypatch):
    prompts_dir = tmp_path / ".agent-platform" / "prompts" / "mycodex"
    prompts_dir.mkdir(parents=True)
    (prompts_dir / "planner.md").write_text("Built-in planner.")
    monkeypatch.setattr(bridge, "PROMPTS_BASE", tmp_path / ".agent-platform" / "prompts")
    content = bridge.resolve_role_content("planner", "mycodex")
    assert content == "Built-in planner."


def test_resolve_role_content_none_returns_none():
    assert bridge.resolve_role_content(None, "mycodex") is None


def test_resolve_role_content_missing_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(bridge, "PROMPTS_BASE", tmp_path / "prompts")
    content = bridge.resolve_role_content("nonexistent", "mycodex")
    assert content is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_bridge.py -v
```

Expected: `ModuleNotFoundError: No module named 'bridge'`

- [ ] **Step 3: Implement bridge.py**

Create `D:/C_projects/agent-platform-mcp/src/bridge.py`:

```python
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

PROMPTS_BASE = Path.home() / ".agent-platform" / "prompts"


def run_once(
    prompt: str,
    executor_path: str,
    model: str,
    reasoning_effort: str,
    workdir: str = ".",
    sandbox: str = "workspace-write",
    role_content: str | None = None,
    session_id: str | None = None,
) -> str:
    """Run a task via the executor subprocess. Returns stdout string."""
    cmd = [
        executor_path, "exec",
        "--model", model,
        "--reasoning-effort", reasoning_effort,
        "--sandbox", sandbox,
        "--cd", workdir,
        "--json",
    ]
    if session_id:
        cmd += ["--session", session_id]

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        if role_content:
            f.write(role_content)
            f.write("\n\n")
        f.write(prompt)
        prompt_file = f.name

    try:
        cmd.append(prompt_file)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"Executor failed: {result.stderr}")
        return result.stdout
    finally:
        Path(prompt_file).unlink(missing_ok=True)


def resolve_role_content(role: str | None, executor: str) -> str | None:
    """Resolve role name or path to its markdown content, or None if not found."""
    if role is None:
        return None
    p = Path(role)
    if p.is_absolute() and p.exists():
        return p.read_text(encoding="utf-8")
    role_path = PROMPTS_BASE / executor / f"{role}.md"
    if role_path.exists():
        return role_path.read_text(encoding="utf-8")
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_bridge.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bridge.py tests/test_bridge.py
git commit -m "feat: add bridge.py with subprocess executor calls"
```

---

## Task 5: server.py — MCP Server Entry Point

**Files:**
- Create: `D:/C_projects/agent-platform-mcp/src/server.py`

- [ ] **Step 1: Run full test suite to confirm green baseline**

```bash
pytest -v
```

Expected: all 25 tests PASS before touching server.py.

- [ ] **Step 2: Implement server.py**

Create `D:/C_projects/agent-platform-mcp/src/server.py`:

```python
#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# Ensure src/ is on the path when run as a script
sys.path.insert(0, str(Path(__file__).parent))

import config as cfg
import bridge
import session as sess
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

server = Server("agent-platform-mcp")

# ── Tool schemas ──────────────────────────────────────────────────────────────

_EXEC_PROPS = {
    "executor": {"type": "string", "description": "Executor name: mycodex, claude_code, gemini"},
    "capability": {"type": "string", "enum": ["small", "medium", "large"],
                   "description": "Cost/quality tier. Maps to model via config."},
    "model": {"type": "string", "description": "Override model from capability mapping"},
    "reasoning_effort": {"type": "string", "description": "Override reasoning effort"},
    "workdir": {"type": "string", "description": "Working directory for executor"},
    "role": {"type": "string", "description": "Built-in role name or absolute path to .md file"},
    "sandbox": {"type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"],
                "description": "Executor sandbox mode"},
}

_SESSION_PROPS = {"session_name": {"type": "string", "description": "Unique session identifier"}}


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="codex_once",
            description="Run a one-shot task without session context.",
            inputSchema={
                "type": "object",
                "required": ["prompt"],
                "properties": {"prompt": {"type": "string"}, **_EXEC_PROPS},
            },
        ),
        Tool(
            name="codex_session_ensure",
            description="Create a named session (or reuse if exists) and send first prompt.",
            inputSchema={
                "type": "object",
                "required": ["session_name", "prompt"],
                "properties": {"prompt": {"type": "string"}, **_SESSION_PROPS, **_EXEC_PROPS},
            },
        ),
        Tool(
            name="codex_session_send",
            description="Send a prompt to an existing named session.",
            inputSchema={
                "type": "object",
                "required": ["session_name", "prompt"],
                "properties": {"prompt": {"type": "string"}, **_SESSION_PROPS, **_EXEC_PROPS},
            },
        ),
        Tool(
            name="codex_session_status",
            description="Get metadata for a named session.",
            inputSchema={
                "type": "object",
                "required": ["session_name"],
                "properties": {**_SESSION_PROPS},
            },
        ),
        Tool(
            name="codex_session_list",
            description="List all active sessions.",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="codex_session_close",
            description="Close and remove a named session.",
            inputSchema={
                "type": "object",
                "required": ["session_name"],
                "properties": {**_SESSION_PROPS},
            },
        ),
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_exec(args: dict) -> tuple[str, str, str, str]:
    """Returns (executor_path, model, reasoning_effort, executor_name)."""
    c = cfg.load_config()
    executor_name = args.get("executor") or cfg.get_default_executor(c)
    capability = args.get("capability", "medium")
    model, effort = cfg.resolve_capability(executor_name, capability, c)
    if args.get("model"):
        model = args["model"]
    if args.get("reasoning_effort"):
        effort = args["reasoning_effort"]
    executor_path = cfg.get_executor_path(executor_name, c)
    return executor_path, model, effort, executor_name


def _parse_session_id(output: str) -> str | None:
    """Extract session_id from JSON executor output if present."""
    try:
        data = json.loads(output)
        return data.get("session_id")
    except Exception:
        return None


# ── Tool dispatch ─────────────────────────────────────────────────────────────

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "codex_once":
        executor_path, model, effort, executor_name = _resolve_exec(arguments)
        role_content = bridge.resolve_role_content(arguments.get("role"), executor_name)
        result = bridge.run_once(
            prompt=arguments["prompt"],
            executor_path=executor_path,
            model=model,
            reasoning_effort=effort,
            workdir=arguments.get("workdir", "."),
            sandbox=arguments.get("sandbox", "workspace-write"),
            role_content=role_content,
        )
        return [TextContent(type="text", text=result)]

    elif name == "codex_session_ensure":
        executor_path, model, effort, executor_name = _resolve_exec(arguments)
        session_name = arguments["session_name"]
        entry = sess.ensure_session(session_name, {
            "executor": executor_name,
            "model": model,
            "capability": arguments.get("capability", "medium"),
            "reasoning_effort": effort,
            "workdir": arguments.get("workdir", "."),
        })
        role_content = bridge.resolve_role_content(arguments.get("role"), executor_name)
        result = bridge.run_once(
            prompt=arguments["prompt"],
            executor_path=executor_path,
            model=model,
            reasoning_effort=effort,
            workdir=arguments.get("workdir", "."),
            sandbox=arguments.get("sandbox", "workspace-write"),
            role_content=role_content,
            session_id=entry.get("session_id"),
        )
        if sid := _parse_session_id(result):
            sess.update_session(session_name, {"session_id": sid})
        return [TextContent(type="text", text=result)]

    elif name == "codex_session_send":
        session_name = arguments["session_name"]
        entry = sess.get_session(session_name)
        if not entry:
            return [TextContent(type="text",
                                text=f"Session '{session_name}' not found. Use codex_session_ensure first.")]
        merged = {
            "executor": entry.get("executor", "mycodex"),
            "capability": entry.get("capability", "medium"),
            **arguments,
        }
        executor_path, model, effort, executor_name = _resolve_exec(merged)
        result = bridge.run_once(
            prompt=arguments["prompt"],
            executor_path=executor_path,
            model=model,
            reasoning_effort=effort,
            workdir=arguments.get("workdir", entry.get("workdir", ".")),
            sandbox=arguments.get("sandbox", "workspace-write"),
            session_id=entry.get("session_id"),
        )
        if sid := _parse_session_id(result):
            sess.update_session(session_name, {"session_id": sid})
        return [TextContent(type="text", text=result)]

    elif name == "codex_session_status":
        entry = sess.get_session(arguments["session_name"])
        text = json.dumps(entry, indent=2) if entry else f"Session '{arguments['session_name']}' not found."
        return [TextContent(type="text", text=text)]

    elif name == "codex_session_list":
        return [TextContent(type="text", text=json.dumps(sess.list_sessions(), indent=2))]

    elif name == "codex_session_close":
        removed = sess.close_session(arguments["session_name"])
        msg = (f"Session '{arguments['session_name']}' closed."
               if removed else f"Session '{arguments['session_name']}' not found.")
        return [TextContent(type="text", text=msg)]

    return [TextContent(type="text", text=f"Unknown tool: {name}")]


# ── Entry point ───────────────────────────────────────────────────────────────

async def _main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(_main())
```

- [ ] **Step 3: Smoke test — verify server imports without error**

```bash
cd D:/C_projects/agent-platform-mcp
python -c "
import sys
sys.path.insert(0, 'src')
import config, session, bridge, server
print('import OK')
"
```

Expected: `import OK` with no errors.

- [ ] **Step 4: Run full test suite**

```bash
pytest -v
```

Expected: all 25 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.py
git commit -m "feat: add server.py MCP entry point with 6 tools"
```

---

## Task 6: Registration + README

**Files:**
- Create: `D:/C_projects/agent-platform-mcp/README.md`

- [ ] **Step 1: Register MCP server in ~/.claude.json**

Edit `C:/Users/20557/.claude.json` — add to `mcpServers`:

```json
"agent-platform-mcp": {
  "type": "stdio",
  "command": "python",
  "args": ["D:/C_projects/agent-platform-mcp/src/server.py"],
  "startup_timeout_ms": 15000
}
```

- [ ] **Step 2: Reload plugins and verify connection**

In Claude Code, run:
```
/reload-plugins
```

Expected: `agent-platform-mcp` appears in MCP server list without connection error.

- [ ] **Step 3: Write README.md**

Create `D:/C_projects/agent-platform-mcp/README.md`:

```markdown
# agent-platform-mcp

Standalone MCP server for AI agent execution via mycodex/claude_code/gemini backends.
Reads `~/.agent-platform/config.json` for capability-based model selection.

## Install

```bash
git clone <repo> D:/C_projects/agent-platform-mcp
cd D:/C_projects/agent-platform-mcp
pip install -e ".[dev]"
```

## Register in ~/.claude.json

```json
"agent-platform-mcp": {
  "type": "stdio",
  "command": "python",
  "args": ["D:/C_projects/agent-platform-mcp/src/server.py"],
  "startup_timeout_ms": 15000
}
```

## Tools

| Tool | Description |
|------|-------------|
| `codex_once` | One-shot task, no session |
| `codex_session_ensure` | Create/reuse named session |
| `codex_session_send` | Send to existing session |
| `codex_session_status` | Get session metadata |
| `codex_session_list` | List active sessions |
| `codex_session_close` | Close session |

## capability levels

`small` → low-cost model + low effort  
`medium` → balanced (default)  
`large` → high-capability model + high reasoning effort  

Mappings come from `~/.agent-platform/config.json` → `executor_model_table`.
```

- [ ] **Step 4: Final test run**

```bash
cd D:/C_projects/agent-platform-mcp
pytest -v
```

Expected: all 25 tests PASS.

- [ ] **Step 5: Commit and tag**

```bash
git add README.md
git commit -m "docs: add README with install and registration instructions"
git tag v0.1.0
```
