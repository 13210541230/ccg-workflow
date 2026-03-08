---
description: '智能功能开发 - 自动识别输入类型，规划/讨论/实施全流程'
---

# Feat - 智能功能开发

$ARGUMENTS

---

## 多模型调用规范

> **必须先读取共享规范**：使用 Read 工具读取 `~/.claude/.ccg/shared/multi-model-spec.md` 获取调用语法、等待规范、输出丢失检测等通用规范。读取后严格遵循其中的规范执行。

**角色提示词**：

| 阶段 | Codex-A | Codex-B |
|------|---------|---------|
| 分析 | `~/.claude/.ccg/prompts//analyzer.md` | `~/.claude/.ccg/prompts//analyzer.md` |
| 规划 | `~/.claude/.ccg/prompts//architect.md` | `~/.claude/.ccg/prompts//architect.md` |
| 实施 | `~/.claude/.ccg/prompts//architect.md` | `~/.claude/.ccg/prompts//architect.md` |
| 审查 | `~/.claude/.ccg/prompts//reviewer.md` | `~/.claude/.ccg/prompts//reviewer.md` |

**会话复用**：每次调用返回 `SESSION_ID: xxx`，后续阶段用 `resume xxx` 复用上下文。
- **必须保存 SESSION_ID**：分析阶段保存 `CODEX_SESSION` + `CODEX_B_SESSION`。
- **复用链路**：分析（新会话）-> 规划（resume）-> 实施（resume）-> 审查（resume）。
- 全链路复用同一对 Codex 会话，避免每阶段重新扫描项目。

---

## 沟通守则

1. 在需要询问用户时，尽量使用 `AskUserQuestion` 工具进行交互，举例场景：请求用户确认/选择/批准

---

## 核心工作流程

### 1. 输入类型判断

**每次交互必须首先声明**：「我判断此次操作类型为：[具体类型]」

| 类型 | 关键词 | 动作 |
|------|--------|------|
| **需求规划** | 实现、开发、新增、添加、构建、设计 | → 步骤 2（完整规划） |
| **讨论迭代** | 调整、修改、优化、改进、包含计划文件路径 | → 读取现有计划 → 步骤 2.3 |
| **执行实施** | 开始实施、执行计划、按照计划、根据计划 | → 步骤 3（直接实施） |

---

### 2. 需求规划流程

#### 2.0 Prompt 增强

**Prompt 增强**（按 `/ccg:enhance` 的逻辑执行）：分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准），**用增强结果替代原始 $ARGUMENTS，后续调用 Codex 时传入增强后的需求**

#### 2.1 上下文检索

调用 `{{MCP_SEARCH_TOOL}}` 检索相关代码、组件、技术栈。

#### 2.2 任务类型判断

| 任务类型 | 判断依据 | 调用流程 |
|----------|----------|----------|
| **前端** | 页面、组件、UI、样式、布局 | planner |
| **后端** | API、接口、数据库、逻辑、算法 | planner |
| **全栈** | 同时包含前后端 | planner |

#### 2.3 调用 Agents

**前端/全栈任务**：先调用 `ui-ux-designer` agent
```
执行 agent: ~/.claude/agents/ccg/ui-ux-designer.md
输入: 项目上下文 + 用户需求 + 技术栈
输出: UI/UX 设计方案
```

**所有任务**：调用 `planner` agent
```
执行 agent: ~/.claude/agents/ccg/planner.md
输入: 项目上下文 + UI设计方案(如有) + 用户需求
输出: 功能规划文档
```

#### 2.4 保存计划

**文件命名规则**：
- 首次规划：`.claude/plan/功能名.md`
- 迭代版本：`.claude/plan/功能名-1.md`、`.claude/plan/功能名-2.md`...

#### 2.5 交互确认

规划完成后询问用户：
- **开始实施** → 步骤 3
- **讨论调整** → 重新执行步骤 2.3
- **重新规划** → 删除当前计划，重新执行步骤 2
- **仅保存计划** → 退出

---

### 3. 执行实施流程

#### 3.1 读取计划

优先使用用户指定路径，否则读取最新的计划文件。

#### 3.2 任务类型分析

从计划提取任务分类：前端 / 后端 / 全栈

#### 3.3 多模型路由实施

按上方调用规范调用外部模型，**优先使用 `resume $CODEX_SESSION` / `resume $CODEX_B_SESSION` 复用分析阶段的会话**：

- **前端任务**：调用 Codex + `resume $CODEX_B_SESSION`，使用实施提示词
- **后端任务**：调用 Codex + `resume $CODEX_SESSION`，使用实施提示词
- **全栈任务**：并行调用 Codex-A（`resume $CODEX_SESSION`）+ Codex-B（`resume $CODEX_B_SESSION`），用 `TaskOutput` 等待结果

**⚠️ 强制规则：必须等待 TaskOutput 返回所有模型的完整结果后才能进入下一阶段**

**务必遵循上方 `多模型调用规范` 的 `重要` 指示**

#### 3.4 实施后验证

```bash
git status --short
git diff --name-status
```

询问用户是否运行代码审查（`/ccg:review`）。

---

### 4. 关键执行原则

1. **强制响应要求**：每次交互必须首先说明判断的操作类型
2. **文档一致性**：规划文档与实际执行保持同步
3. **依赖关系管理**：前端任务必须确保 UI 设计完整性
4. **多模型信任规则**：
   - 双 Codex 交叉验证
5. **用户沟通透明**：所有判断和动作都要明确告知用户

---

## 使用方法

```bash
/feat <功能描述>
```
