---
description: '管理 Git Worktree：在 ../.ccg/项目名/ 目录创建，支持 IDE 集成和内容迁移'
---

# Worktree - Git Worktree 管理

在结构化目录管理 Git worktree，支持智能默认和 IDE 集成。

## 使用方法

```bash
/worktree <add|list|remove|prune|migrate> [options]
```

## 子命令

| 命令 | 说明 |
|------|------|
| `add <path>` | 创建新 worktree |
| `list` | 列出所有 worktree |
| `remove <path>` | 删除指定 worktree |
| `prune` | 清理无效引用 |
| `migrate <target>` | 迁移内容到目标 worktree |

## 选项

| 选项 | 说明 |
|------|------|
| `-b <branch>` | 创建新分支 |
| `-o, --open` | 创建后用 IDE 打开 |
| `--from <source>` | 迁移源路径 |
| `--stash` | 迁移 stash 内容 |
| `--track` | 跟踪远程分支 |
| `--detach` | 分离 HEAD |
| `--lock` | 锁定 worktree |

---

## 目录结构

```
parent-directory/
├── your-project/           # 主项目
│   ├── .git/
│   └── src/
└── .ccg/                   # worktree 管理目录
    └── your-project/
        ├── feature-ui/     # 功能分支
        ├── hotfix/         # 修复分支
        └── debug/          # 调试 worktree
```

---

## 执行工作流

### Add - 创建 Worktree

`[模式：创建]`

1. 验证 Git 仓库
2. 计算路径：`../.ccg/项目名/<path>`
3. 创建 worktree
4. 自动复制环境文件（`.env` 等）
5. 可选：用 IDE 打开

### Migrate - 迁移内容

`[模式：迁移]`

1. 验证源有未提交内容
2. 确保目标干净
3. 显示即将迁移的改动
3.5. **分支分歧检查**：
   - 检测目标 worktree 是否已从源分支分歧（`git log --oneline source..target` 有输出）
   - 若有分歧：展示分歧 commit 列表，要求用户确认迁移策略（覆盖 / cherry-pick / 放弃）
4. 安全迁移
5. 确认结果

---

## 示例

```bash
# 基本创建
/worktree add feature-ui

# 创建并用 IDE 打开
/worktree add feature-ui -o

# 创建指定分支
/worktree add hotfix -b fix/login -o

# 迁移未提交内容
/worktree migrate feature-ui --from main

# 迁移 stash 内容
/worktree migrate feature-ui --stash

# 管理操作
/worktree list
/worktree remove feature-ui
/worktree prune
```

## 输出示例

```
✅ Worktree created at ../.ccg/项目名/feature-ui
✅ 已复制 .env
✅ 已复制 .env.local
📋 已从 .gitignore 复制 2 个环境文件
🖥️ 是否在 IDE 中打开？[y/n]: y
🚀 正在用 VS Code 打开...
```

---

## 智能特性

1. **智能默认** – 未指定分支时使用路径名
2. **IDE 集成** – 自动检测 VS Code / Cursor / WebStorm
3. **环境文件** – 自动复制 `.gitignore` 中的 `.env` 文件
4. **路径安全** – 始终使用绝对路径防止嵌套问题
5. **分支保护** – 验证分支未被其他地方使用

## 并行开发模式（与 /ccg:manage 联动）

当 `/ccg:manage` 派发多个并行 executor 时，推荐为每个独立任务创建隔离 worktree：

**前置检查**（派发并行 agents 前）：
- [ ] 各 agent 的任务是否涉及不同文件集合？（若有重叠，不适合并行 worktree）
- [ ] 每个 worktree 能否独立运行测试？
- [ ] 合并策略是否已确定（顺序合并 / cherry-pick）？

**创建步骤**：
```bash
/worktree add task-a -b feat/task-a
/worktree add task-b -b feat/task-b
```

**完成后合并顺序**：
1. 在每个 worktree 中运行测试，确保通过
2. 按依赖顺序逐个合并到主分支
3. 每次合并后重新运行完整测试套件
4. 所有合并完成后运行 `/ccg:commit`

**禁止**：将有文件重叠的任务分配到并行 worktree（会导致合并冲突）。

## 注意事项

- Worktree 共享 `.git` 目录，节省磁盘空间
- 迁移仅限未提交改动，已提交内容用 `git cherry-pick`
- 支持 Windows、macOS、Linux
