---
description: '扩展包管理：列出、安装、卸载可选命令包'
---

# Packs - 扩展包管理

$ARGUMENTS

## 用途

这个命令用于管理 CCG 的可选扩展包。扩展包不会默认进入插件主命令列表，需要按需安装到用户本地 `~/.claude/commands/ccg/`。

运行时根目录解析规则：
- 若存在 `$CLAUDE_PLUGIN_ROOT`，则把 packs 根目录视为 `$CLAUDE_PLUGIN_ROOT/packs`
- 否则回退到源码安装目录 `~/.claude/.ccg/packs`

支持的操作：
- `list`
- `status`
- `install <pack-name>`
- `remove <pack-name>`

## 执行规则

1. 若未提供参数，默认执行 `list`
2. 先确定 packs 根目录：
- 插件模式：`$CLAUDE_PLUGIN_ROOT/packs`
- 源码安装模式：`~/.claude/.ccg/packs`

3. 使用内置脚本：

```bash
python "$CLAUDE_PLUGIN_ROOT/scripts/ccg_pack_manager.py" --packs-root "$CLAUDE_PLUGIN_ROOT/packs" list
```

若未处于插件环境，则改用源码安装路径：

```bash
python "~/.claude/.ccg/scripts/ccg_pack_manager.py" --packs-root "~/.claude/.ccg/packs" list
```

4. 若用户提供了参数，则按参数执行：

```bash
python "$CLAUDE_PLUGIN_ROOT/scripts/ccg_pack_manager.py" --packs-root "$CLAUDE_PLUGIN_ROOT/packs" $ARGUMENTS
```

若未处于插件环境，则改用源码安装路径：

```bash
python "~/.claude/.ccg/scripts/ccg_pack_manager.py" --packs-root "~/.claude/.ccg/packs" $ARGUMENTS
```

5. 执行后向用户输出：
   - 可用扩展包
   - 已安装扩展包
   - 本次安装/卸载结果

## 当前扩展包

- `legacy`
  - `workflow`
  - `feat`
  - `frontend`
  - `backend`
  - `teammate`

- `extras`
  - `optimize`
  - `test`
  - `clean-branches`

- `spec`
  - `spec-init`
  - `spec-research`
  - `spec-plan`
  - `spec-impl`
  - `spec-review`

- `team`
  - `team-research`
  - `team-plan`
  - `team-exec`
  - `team-review`

## 关键规则

1. 不要手工复制 pack 文件，统一通过脚本安装
2. 安装/卸载后要明确告诉用户哪些命令已生效
3. 若 pack 不存在，直接报错并列出可用 pack
4. `install` / `remove` 完成后提醒用户新命令写入的是 `~/.claude/commands/ccg/`
