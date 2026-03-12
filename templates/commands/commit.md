---
description: '智能 Git 提交：分析改动生成 Conventional Commit 信息，支持拆分建议'
---

# Commit - 智能 Git 提交

分析当前改动，生成 Conventional Commits 风格的提交信息。

## 使用方法

```bash
/commit [options]
```

## 选项

| 选项 | 说明 |
|------|------|
| `--no-verify` | 跳过 Git 钩子 |
| `--all` | 暂存所有改动 |
| `--amend` | 修补上次提交 |
| `--signoff` | 附加签名 |
| `--emoji` | 包含 emoji 前缀 |
| `--scope <scope>` | 指定作用域 |
| `--type <type>` | 指定提交类型 |

---

## 执行工作流

### 🔍 阶段 1：仓库校验

`[模式：检查]`

1. 验证 Git 仓库状态
2. 检测 rebase/merge 冲突
3. 读取当前分支/HEAD 状态
4. **分支安全检查**：
   - 若当前分支为 `main` 或 `master`：警告用户并用 `AskUserQuestion` 确认是否继续
   - 若 `--amend` 且目标 commit 已推送远端：警告强制推送风险，要求用户明确确认

### 📋 阶段 2：改动检测

`[模式：分析]`

1. 获取已暂存与未暂存改动
2. 若暂存区为空：
   - `--all` → 执行 `git add -A`
   - 否则提示选择

### ✂️ 阶段 3：拆分建议

`[模式：建议]`

按以下维度聚类：
- 关注点（源代码 vs 文档/测试）
- 文件模式（不同目录/包）
- 改动类型（新增 vs 删除）

若检测到多组独立变更（>300 行 / 跨多个顶级目录），建议拆分。

### 🧪 阶段 3.5：提交前验证门控

`[模式：验证]`

**在生成提交信息之前，强制运行验证**：

```bash
# 运行项目测试套件（最小相关范围）
npm test / pnpm test / cargo test / go test ./... / pytest
```

**若测试失败**：
```
测试未通过（N 个失败）。提交已阻塞：

[展示失败列表]

请修复测试后重新运行 /ccg:commit。
```
停止，不进入阶段 4。

**若项目无测试套件**：运行 lint + typecheck（若可用），记录结果后继续。

**若用户传入 `--no-verify`**：跳过此阶段，但在提交信息末尾追加 `[skip-tests]` 标记。

### ✍️ 阶段 4：生成提交信息

`[模式：生成]`

**格式**：`[emoji] <type>(<scope>): <subject>`

- 首行 ≤ 72 字符
- 祈使语气
- 消息体：动机、实现要点、影响范围

**语言**：根据最近 50 次提交判断中文/英文

### ✅ 阶段 5：执行提交

`[模式：执行]`

```bash
git commit [-S] [--no-verify] [-s] -F .git/COMMIT_EDITMSG
```

### 🔀 阶段 6：提交后处置

`[模式：完成]`

提交成功后，展示结构化选项：

```
提交完成：<commit hash> <subject>

后续操作：
1. 推送到远端（git push）
2. 创建 Pull Request（gh pr create）
3. 保持本地，稍后处理
4. 撤销此次提交（git reset HEAD~1）

选择？
```

**选项 4 执行前**：要求用户输入 `undo` 确认，防止误操作。

---

## Type 与 Emoji 映射

| Emoji | Type | 说明 |
|-------|------|------|
| ✨ | `feat` | 新增功能 |
| 🐛 | `fix` | 缺陷修复 |
| 📝 | `docs` | 文档更新 |
| 🎨 | `style` | 代码格式 |
| ♻️ | `refactor` | 重构 |
| ⚡️ | `perf` | 性能优化 |
| ✅ | `test` | 测试相关 |
| 🔧 | `chore` | 构建/工具 |
| 👷 | `ci` | CI/CD |
| ⏪️ | `revert` | 回滚 |

---

## 示例

```bash
# 基本提交
/commit

# 暂存所有并提交
/commit --all

# 带 emoji 提交
/commit --emoji

# 指定类型和作用域
/commit --scope ui --type feat --emoji

# 修补上次提交
/commit --amend --signoff
```

## 关键规则

1. **仅使用 Git** – 不调用包管理器
2. **尊重钩子** – 默认执行，`--no-verify` 可跳过
3. **不改源码** – 只读写 `.git/COMMIT_EDITMSG`
4. **原子提交** – 一次提交只做一件事
