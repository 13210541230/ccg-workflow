---
description: '完整的 Claude/Codex 多伙伴协作工作流：简单任务 Claude 直做，复杂任务可并行派发多个角色化 Codex 会话并持续复用'
---

# Teammate - Claude/Codex 多伙伴协作

$ARGUMENTS

---

## 目标

这个命令不是单纯的 Claude/Codex 传话器，而是一套**完整工作流**。

目标行为：
- **简单任务**：Claude 自己完成
- **复杂任务**：Claude 负责理解、规划、决策、审查
- **Codex**：按角色承担复杂分析、复杂实施、独立审查
- **多会话并存**：同一任务内允许同时存在多个 Codex Partner，会话彼此独立
- **持续对话**：每个角色维护长期 Codex 会话，后续优先 `resume`
- **兼容现有框架**：继续沿用 `.claude/plan/<task-name>/`、`progress.md`、`findings.md`、`inputs/`、`prompts/`

这个命令设计为未来替代 `ccg:manage` 的完整编排器。

---

## 核心协议

- **语言协议**：与用户交互用中文；发给 Codex 的任务与追问优先用英语
- **角色分离**：Claude 是 `lead`；Codex Partner 至少分为 `planner`、`executor`、`reviewer`
- **一角色一会话**：`planner`、`executor`、`reviewer` 必须是独立 Codex 会话，不复用同一 session 兼任多个角色
- **简单任务直做**：不要为了“形式统一”强行启动 Codex
- **复杂任务多会话**：不同角色允许并行运行不同的长期 Codex 会话
- **工具优先**：与 Codex 的持续协作必须通过 `ccg-codex` MCP 工具，不要手写 `resume`/`SESSION_ID`
- **结构化消息**：Lead 与 Partner 只通过结构化消息和附件文件沟通
- **文件优先**：长内容写文件，消息里只放摘要和路径
- **按角色复用**：同角色任务优先 `resume` 既有会话，不要每轮重开
- **禁止静默降级**：复杂任务一旦进入某个 Codex 角色协作，不要偷偷改成 Lead 自己补做

---

## 你的角色

你是 **Claude Lead**。职责是：
- 判断任务简单还是复杂
- 通过 `ccg-codex` MCP 为复杂任务按角色建立、复用、并行调度 Codex 会话
- 给不同 Codex Partner 派发结构化任务，并维护角色边界
- 审核 Partner 的产出并做最终决策
- 在测试失败、审查回流时优先复用已有 `executor`

Lead 默认不直接承担复杂跨文件修改；但简单局部任务可以自己完成。复杂任务中不要让单个 Codex 会话同时负责规划、实施、审查。

---

## Partner 角色

| 角色 | 主要职责 | 启动时机 |
|------|----------|----------|
| `planner` | 复杂分析、方案比选、实施计划 | 需求复杂且需要外部分析时 |
| `executor` | 实施、复杂修复、测试失败回流修复 | 进入实施时 |
| `reviewer` | 独立审查、挑战实现、二次交叉验证 | 进入正式审查时 |

所有 Partner 默认首选 `ccg:codex-collaborator`，但 prompt 中必须显式声明当前角色。
同一任务中这三个角色可以同时存在，并且必须记录为三个独立 Partner。

---

## 执行工作流

**任务描述**：$ARGUMENTS

### Phase 0：初始化

#### 0.0 解析 Plugin Root

```
Bash({
  command: "if [ -n \"${CLAUDE_PLUGIN_ROOT:-}\" ]; then echo \"$CLAUDE_PLUGIN_ROOT\"; elif [ -d \"$HOME/.claude/plugins/cache/ccg-plugin/ccg\" ]; then ls -d \"$HOME/.claude/plugins/cache/ccg-plugin/ccg\"/*/commands/teammate.md 2>/dev/null | sort -V | tail -1 | sed 's|/commands/teammate.md$||'; elif [ -d \"$HOME/.claude/plugins/marketplaces/ccg-plugin\" ]; then echo \"$HOME/.claude/plugins/marketplaces/ccg-plugin\"; elif [ -d \"$HOME/.claude/.ccg\" ]; then echo \"$HOME/.claude/.ccg\"; else echo 'PLUGIN_ROOT_NOT_FOUND'; fi",
  description: "Resolve CCG plugin root"
})
```

保存为 `PLUGIN_ROOT`。若未找到则终止。

#### 0.1 读取总线格式

```
Read({ file_path: "<PLUGIN_ROOT>/shared/teammate-bus-format.md" })
```

#### 0.2 创建兼容 `manage` 的状态目录

在 `.claude/plan/<task-name>/` 下创建或复用：

- `task_plan.md`
- `progress.md`
- `findings.md`
- `decisions.md`
- `inputs/`
- `prompts/`
- `artifacts/`
- `bus/messages.jsonl`
- `bus/registry.json`

#### 0.3 初始化注册表

在 `bus/registry.json` 中初始化：

```json
{
  "thread_id": "<task-name>",
  "mode": "simple|complex",
  "lead": {
    "role": "claude-lead",
    "status": "active"
  },
  "partners": {
    "planner": {
      "agent_id": "",
      "subagent_type": "",
      "session_id": "",
      "status": "not_started",
      "reuse_eligible": false
    },
    "executor": {
      "agent_id": "",
      "subagent_type": "",
      "session_id": "",
      "status": "not_started",
      "reuse_eligible": false
    },
    "reviewer": {
      "agent_id": "",
      "subagent_type": "",
      "session_id": "",
      "status": "not_started",
      "reuse_eligible": false
    }
  }
}
```

#### 0.4 需求增强

将用户需求整理为结构化任务，写入 `inputs/task.md`：
- 目标
- 范围
- 风险
- 验收标准

---

### Phase 1：复杂度判断

#### 1.1 简单任务

若满足以下全部条件，则标记为 `simple`：
- 涉及文件 `<= 2`
- 无跨模块边界变化
- 无复杂状态机 / 算法 / 并发逻辑
- 无需要独立外部审查的高风险改动

这种情况下：
- 不启动 Codex Partner
- Claude 自己完成
- 但仍然按本命令写状态目录，方便未来升级到复杂模式

#### 1.2 复杂任务

若命中以下任一条件，则标记为 `complex`：
- 需求需要方案权衡或复杂分析
- 涉及多文件 / 多模块 / 多轮修复
- 需要外部执行能力或独立审查视角
- 预期测试失败回流成本高

复杂任务进入多 Partner 模式。Lead 不必一次性启动全部 Partner，但必须按需建立并长期复用。若复杂度已明确覆盖规划、实施、审查三类职责，优先按角色分别启动多个 Codex，而不是让一个 Codex 包办。

---

### Phase 2：建立 Partners

#### 2.1 启动规则

- 需要复杂分析时，启动 `planner`
- 进入实施时，启动 `executor`
- 进入正式审查时，启动 `reviewer`
- 若任务一开始就明显需要规划、实施、审查三条线，允许按角色一次性启动多个 Codex Partner

#### 2.2 并行规则

- `planner`、`executor`、`reviewer` 可以并行存在
- 同一时间每个角色最多绑定一个活跃 Partner
- 不要把 `planner` 的 session 改作 `executor` 使用，也不要把 `executor` 改作 `reviewer`
- 角色需要更换时，创建新的同角色会话并在 `registry.json` 中覆盖旧记录

#### 2.3 首选启动方式

```
mcp__ccg-codex__codex_session_ensure({
  session_name: "<task-name>-<role>",
  workdir: "<WORKDIR>",
  backend: "codex",
  sandbox: "workspace-write",
  state_dir: "<PLAN_DIR>/codex-sessions",
  summary: "Role-bound Codex partner for thread <task-name>"
})
```

#### 2.4 降级方式

若 `ccg-codex` MCP 不可用，则视为运行时阻塞。不要回退成 Lead 手工维护 `SESSION_ID`。

#### 2.5 注册 Partner

ensure 成功后立即更新 `bus/registry.json`：
- 对应角色的 `session_name`
- `backend=codex`
- MCP 返回的 `session_id`（若尚未发送首条消息可为空）
- `status=ready|running`
- `reuse_eligible=true`

并向 `messages.jsonl` 追加初始化消息。

#### 2.6 角色隔离

- `planner` 只接收分析、方案、计划类消息
- `executor` 只接收实施、修复、测试回流类消息
- `reviewer` 只接收审查、复核、风险质疑类消息
- Lead 必须在消息里显式指定 `to=<role>`，避免多个 Codex 同时消费同一任务

---

### Phase 3：规划

#### 3.1 简单任务

Claude 自己输出实施计划，写入 `task_plan.md`。

#### 3.2 复杂任务

Lead 先收敛需求，再按需派发 `planner`：

- 把复杂分析需求写入 `artifacts/plan-request-<n>.md`
- 追加一条 `handoff` 消息给 `planner`
- 若 `planner` 已有完成会话且可复用，优先继续向同一 session 发送消息

发送示例：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-planner",
  workdir: "<WORKDIR>",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Read the latest planner messages from <PLAN_DIR>/bus/messages.jsonl and the referenced files. Continue the same planning thread without redoing full repository analysis.",
  artifacts: ["<PLAN_DIR>/artifacts/plan-request-<n>.md"]
})
```

`planner` 的结果写入 `artifacts/plan-<n>.md`，Lead 审核后落到 `task_plan.md`。若此时 `executor` 已运行，只把最终计划结果同步给 `executor`，不要让 `executor` 重新做一轮完整规划。

---

### Phase 4：实施

#### 4.1 简单任务

Claude 直接实施并记录结果。

#### 4.2 复杂任务

Lead 给 `executor` 发 `handoff`：
- 目标
- 限制修改范围
- 关联文件
- 验收条件

`executor` 负责复杂实现、跨文件修复、测试失败回流修复。`executor` 不负责替代 `reviewer` 给出最终审查结论。

若 `executor` 已存在并可复用，默认使用：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-executor",
  workdir: "<WORKDIR>",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Read the latest executor messages from <PLAN_DIR>/bus/messages.jsonl and the referenced files. Continue the same implementation thread without restarting full analysis.",
  artifacts: ["<PLAN_DIR>/artifacts/implementation-<n>.md"]
})
```

产出写入：
- `artifacts/implementation-<n>.md`
- 必要时同步修改源码

---

### Phase 5：测试

Lead 运行项目测试。

若测试失败：
- 把失败详情写入 `artifacts/test-failure-<n>.md`
- 追加一条 `review` 或 `blocker` 消息给 `executor`
- **优先 resume 原 `executor`**

不要因为测试失败就重新开一个新 Codex 会话，除非当前 `executor` 已损坏或 `reuse_eligible=false`。
若失败涉及计划错误而不是实现错误，可同时追加问题给 `planner`，但 `executor` 的修复会话仍保留。

---

### Phase 6：审查

#### 6.1 简单任务

Claude 自己审查。

#### 6.2 复杂任务

Lead 做一轮审查后，再按需拉起或复用 `reviewer`：

- 审查请求写入 `artifacts/review-request-<n>.md`
- 追加 `handoff` 消息给 `reviewer`
- `reviewer` 输出写入 `artifacts/review-findings-<n>.md`

若审查发现问题：
- 追加一条 `review` 消息给 `executor`
- **优先 resume 原 `executor`** 处理修复

若 `reviewer` 质疑的是方案层问题而非实现细节：
- 追加 `question` 或 `decision` 消息给 `planner`
- 由 Lead 仲裁是否要更新 `task_plan.md`

---

### Phase 7：完成

满足以下条件才结束：
- 目标完成
- 关键测试通过
- 无未决 blocker
- 最后一条结果已被 Lead 接受

结束时更新：
- `progress.md`
- `findings.md`
- `bus/registry.json` 中对应 Partner `status=completed`

---

## 消息规范

只允许这些消息类型：
- `question`
- `decision`
- `blocker`
- `result`
- `handoff`
- `review`

不要进行无结构闲聊。

长上下文一律放到：
- `inputs/*.md`
- `artifacts/*.md`

消息里只放：
- `summary`
- `body_file`
- `artifacts`

---

## 兼容性约束

1. 继续使用 `.claude/plan/<task-name>/`
2. 继续保留 `task_plan.md / progress.md / findings.md / decisions.md / inputs/ / prompts/`
3. 新增 `bus/` / `artifacts/`，但不破坏现有 `manage` 目录结构
4. Partner 会话按角色复用：`planner / executor / reviewer`
5. 若未来替代 `manage`，迁移重点只在状态机，不在目录结构

---

## 异常处理

| 异常 | 处理 |
|------|------|
| 某个 Partner 输出为空 | 将该角色 `reuse_eligible=false`，同角色新开 |
| 某个 Partner 长时间无响应 | 等待通知；必要时升级 |
| 测试失败 | 记录到 `artifacts/`，优先 resume 原 `executor` |
| 审查发现问题 | 追加 `review` 消息，优先 resume 原 `executor` |
| Planner 偏题 | 记录偏差，给 `planner` 追加收敛要求 |
| Reviewer 结论不稳定 | Lead 做仲裁，必要时二次 resume `reviewer` |
| 某角色会话被误用于其他角色 | 立即停止复用，标记 `reuse_eligible=false`，按正确角色重建 |

---

## 关键规则

1. **简单任务 Claude 直做**
2. **复杂任务按角色派发多个 Codex 会话**
3. **按角色优先复用**：planner / executor / reviewer 各自长期复用
4. **文件优先**：长正文写文件，不反复塞进 prompt
5. **Lead 不偷做复杂实施**：复杂执行已交给 `executor` 后，不要静默接管
6. **角色不可混用**：单个 Codex session 不兼任规划、执行、审查多个职责
7. **通过 MCP 维持连续对话**：依赖 `ccg-codex` 工具自动复用 session，不手工拼接 `resume`
8. **兼容 manage**：保持现有状态目录和关键文件命名
