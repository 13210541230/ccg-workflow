#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any


def _claude_root() -> Path:
    return Path.home() / ".claude"


def _ccg_root() -> Path:
    return _claude_root() / ".ccg"


def _registry_path() -> Path:
    return _ccg_root() / "installed-packs.json"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def _write_json(path: Path, payload: Any) -> None:
    _ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _manifest_path(packs_root: Path) -> Path:
    return packs_root / "manifest.json"


def _load_manifest(packs_root: Path) -> dict[str, Any]:
    manifest = _read_json(_manifest_path(packs_root), {})
    packs = manifest.get("packs")
    if not isinstance(packs, dict):
        raise SystemExit("Pack manifest is missing or invalid")
    return manifest


def _load_registry() -> dict[str, Any]:
    return _read_json(_registry_path(), {"installed": {}})


def _commands_dir() -> Path:
    return _claude_root() / "commands" / "ccg"


def _install_pack(packs_root: Path, pack_name: str) -> dict[str, Any]:
    manifest = _load_manifest(packs_root)
    packs = manifest["packs"]
    pack = packs.get(pack_name)
    if not isinstance(pack, dict):
        raise SystemExit(f"Unknown pack: {pack_name}")

    registry = _load_registry()
    installed = registry.setdefault("installed", {})
    pack_root = packs_root / pack_name
    copied: list[str] = []

    for rel_path in pack.get("commands", []):
        source = pack_root / rel_path
        target = _commands_dir() / Path(rel_path).name
        if not source.is_file():
            raise SystemExit(f"Pack file not found: {source}")
        _ensure_dir(target.parent)
        shutil.copyfile(source, target)
        copied.append(str(target))

    installed[pack_name] = {
        "commands": copied,
        "description": pack.get("description", ""),
    }
    _write_json(_registry_path(), registry)
    return {"success": True, "action": "install", "pack": pack_name, "commands": copied}


def _remove_pack(pack_name: str) -> dict[str, Any]:
    registry = _load_registry()
    installed = registry.setdefault("installed", {})
    pack = installed.get(pack_name)
    if not isinstance(pack, dict):
        raise SystemExit(f"Pack is not installed: {pack_name}")

    removed: list[str] = []
    for raw in pack.get("commands", []):
        path = Path(raw)
        if path.exists():
            path.unlink()
            removed.append(str(path))

    installed.pop(pack_name, None)
    _write_json(_registry_path(), registry)
    return {"success": True, "action": "remove", "pack": pack_name, "commands": removed}


def _status(packs_root: Path) -> dict[str, Any]:
    manifest = _load_manifest(packs_root)
    registry = _load_registry()
    installed = registry.get("installed", {})
    packs: list[dict[str, Any]] = []
    for name, payload in manifest["packs"].items():
        packs.append(
            {
                "name": name,
                "description": payload.get("description", ""),
                "commands": payload.get("command_names", []),
                "installed": name in installed,
            }
        )
    packs.sort(key=lambda item: item["name"])
    return {"success": True, "packs": packs, "registry_path": str(_registry_path()), "packs_root": str(packs_root)}


def _resolve_packs_root(plugin_root: str | None, packs_root: str | None) -> Path:
    if packs_root:
        return Path(packs_root).expanduser().resolve()
    if plugin_root:
        return (Path(plugin_root).expanduser().resolve() / "packs")
    default_root = _ccg_root() / "packs"
    return default_root.resolve()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plugin-root")
    parser.add_argument("--packs-root")
    parser.add_argument("action", nargs="?", default="list", choices=["list", "status", "install", "remove"])
    parser.add_argument("pack", nargs="?")
    args = parser.parse_args()

    packs_root = _resolve_packs_root(args.plugin_root, args.packs_root)

    if args.action in {"list", "status"}:
        payload = _status(packs_root)
    elif args.action == "install":
        if not args.pack:
            raise SystemExit("install requires <pack-name>")
        payload = _install_pack(packs_root, args.pack)
    elif args.action == "remove":
        if not args.pack:
            raise SystemExit("remove requires <pack-name>")
        payload = _remove_pack(args.pack)
    else:
        raise SystemExit(f"Unknown action: {args.action}")

    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
