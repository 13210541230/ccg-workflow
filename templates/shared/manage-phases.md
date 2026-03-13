# Manage Phase Workflows (Phase 1-5 + 止损 + 完成)

> 本文件由 manage.md 在进入 Phase 1 时懒加载，不在命令初始化时占用上下文。

---

### Phase 1：分析

#### 1.1 简单任务

写入：
- `inputs/task.md`
- `inputs/context.md`
- `inputs/decisions.md`
- `artifacts/simple-request.md`

派发单 worker agent：

```
Agent({
  subagent_type: "general-purpose",
  prompt: "Role: simple-executor\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nOutput file: <PLAN_DIR>/artifacts/simple-worker-result-1.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/simple-request.md\nMission: Analyze the task, produce a minimal execution plan, implement the approved scope in the workspace, run minimal relevant checks, and write a structured markdown report. If you find the scope is no longer simple, stop before broad edits and report `upgrade_to_complex` with reasons.",
  description: "Simple worker agent"
})
```

记录 `Agent ID` 到 `progress.md`。若 worker 报告 `upgrade_to_complex`，切到复杂路径。

#### 1.2 复杂任务

写入：
- `inputs/task.md`
- `inputs/context.md`
- `inputs/decisions.md`
- `artifacts/analysis-request.md`

**并行派发前置检查（Domain Isolation Check）**：
- [ ] 两个 worker 任务范围是否存在文件重叠？（若重叠则串行化）
- [ ] 两个 worker 是否操作相同状态文件？（若是则串行化）
- [ ] 每个 prompt 是否包含：具体范围 + 明确目标 + 明确约束 + 期望输出格式？

并行派发两个 analyzer worker（默认 subagent）：

```
Agent({ subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze from a logic and behavior perspective. Focus on feasibility, risks, dependencies, edge cases.",
  description: "Codex worker analyzer-a" })

Agent({ subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-b.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze from an architecture and integration perspective. Focus on module boundaries, coupling, extensibility, migration risk.",
  description: "Codex worker analyzer-b" })
```

Team 模式时额外加 `team_name` + `name` 字段。

合并结果后写入 `findings.md`。接受前必须校验两个 analyzer 摘要都含 `runtime_mode / session_id / reuse_eligible / output_file`；任一缺失视为 `codex bypass`。

失败恢复：resume 原 worker → 重建同角色 worker → 记录 `Codex blocked`。

---

### Phase 2：规划

#### 2.1 简单任务

从 `simple-worker-result-1.md` 提取最小实施计划写入 `task_plan.md`。若超出简单范围立即升级。

**强制计划格式**：
```
Task N: [动作] [精确文件路径]
  - 步骤: [2-5 分钟内可完成]
  - 验收: [可验证的完成标准]
```

#### 2.2 复杂任务

写入 `inputs/findings.md` + `artifacts/plan-request.md`。Domain Isolation Check 同 Phase 1。

并行派发两个 planner worker：

```
Agent({ subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Implementation plan focused on execution order, data flow, failure handling, verification checkpoints.",
  description: "Codex worker planner-a" })

Agent({ subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-b.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Implementation plan focused on module boundaries, rollback points, migration safety, regression prevention.",
  description: "Codex worker planner-b" })
```

综合写入 `task_plan.md`。接受前校验 Codex 证据（同 Phase 1）。

**强制计划格式**（零上下文规则）：精确路径 + 完整代码片段 + 可执行命令；TDD 优先；每步 2-5 分钟；任何 worker 无需上下文即可执行。

**Hard Stop**：向用户展示计划，等待明确确认后才能进入 Phase 3。

---

### Phase 3-5：实施 → 测试 → 审查 迭代循环

最多 3 轮：`Phase 3（实施）→ Phase 5（测试）→ Phase 4（审查）→ 回 Phase 3`

退出条件：测试通过 + 无 Critical。

**迭代纪律**：失败后先记录失败模式 → 分析根因 → 单一假设；每次只改一个变量。

---

#### Phase 3：实施

**执行前门控**：Glob 验证路径存在；歧义检查；依赖检查；任务数 ≥5 时每批 ≤3 个。

##### 3.1 简单任务

优先 `resume` 原 `simple-executor`：

```
Agent({ resume: "<SIMPLE_EXECUTOR_AGENT_ID>",
  prompt: "Continue simple-executor thread.\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nOutput file: <PLAN_DIR>/artifacts/simple-worker-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/task_plan.md\n- <PLAN_DIR>/inputs/task.md\nMission: Finish approved implementation, minimal change, update result file.",
  description: "Resume simple worker" })
```

##### 3.2 复杂任务

写入 `inputs/plan.md` + `artifacts/implementation-request.md`。

首次实施：

```
Agent({ subagent_type: "ccg:codex-executor",
  prompt: "Thread: <task-name>\nTeammate role: executor\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-executor\nSandbox: workspace-write\nOutput file: <PLAN_DIR>/artifacts/implementation-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/task_plan.md\n- <PLAN_DIR>/artifacts/implementation-request.md\nMission: Implement approved plan. Batches of 3 steps. STOP immediately on any blocker, output: {\"blocked\":true,\"reason\":\"...\",\"needs\":\"...\"}",
  description: "Codex worker executor" })
```

测试失败/审查回流时，**优先 resume** 原 executor：

```
Agent({ resume: "<EXECUTOR_AGENT_ID>",
  prompt: "Continue executor thread.\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nOutput file: <PLAN_DIR>/artifacts/implementation-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/test-failure-<n>.md\n- <PLAN_DIR>/artifacts/review-failure-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Fix only the newly reported issues.",
  description: "Resume Codex executor" })
```

重建新 executor 的条件：Agent ID 缺失 / 输出为空或损坏 / 卡死不可恢复 / `reuse_eligible=no`。重建时 prompt 必须内嵌完整 task 文本 + 已完成摘要 + 失败原因 + 范围约束（禁止让新 executor 自行判断范围）。

接受 `implementation-result-<n>.md` 前必须校验 Codex 证据；缺失则视为 `codex bypass`，本轮无效。

---

#### Phase 5：测试

**铁律：Lead 禁止在主 Agent 中直接运行测试命令。** 所有测试执行必须通过 test-worker subagent 完成。

##### 5.1 写入 test-request artifact

写入 `artifacts/test-request-<n>.md`，包含：
- 需要运行的测试命令（完整命令）
- 预期行为与验收标准
- 本轮迭代编号 N

##### 5.2 派发 test-worker

优先 `resume` 原 test-worker：

```
Agent({ resume: "<TEST_WORKER_AGENT_ID>",
  prompt: "Continue test-worker thread.\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nRound: <N>\nOutput file: <PLAN_DIR>/artifacts/test-result-<N>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/test-request-<N>.md\nMission: Re-run the test suite as specified. Record COMPLETE verbatim command output. Update the structured report.",
  description: "Resume test worker" })
```

首次或 resume 不可用时新建：

```
Agent({ subagent_type: "general-purpose",
  prompt: "Role: test-worker\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nRound: <N>\nOutput file: <PLAN_DIR>/artifacts/test-result-<N>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/test-request-<N>.md\n- <PLAN_DIR>/task_plan.md\nMission: Run the test suite exactly as specified in test-request-<N>.md. Do NOT summarize or truncate output. Write a structured markdown report to the output file with ALL of the following fields:\n  test_status: pass|fail\n  commands_run: [list of exact commands]\n  original_issue_resolved: yes|no|unknown\n  regression_detected: yes|no\n  failure_details: <verbatim error if any>\nThen append a section '## Full Output' with the complete verbatim terminal output.",
  description: "Test worker agent" })
```

记录 `Agent ID` 到 `progress.md` 的 Test Worker Registry。

##### 5.3 Lead 读取 artifact 并裁决

```
Read({ file_path: "<PLAN_DIR>/artifacts/test-result-<N>.md" })
```

校验 artifact 必须包含全部必需字段：`test_status / commands_run / original_issue_resolved / regression_detected`。缺少任一字段 → 视为无效 artifact，重试 test-worker。

根据 `test_status` 裁决：
- `pass` 且 `regression_detected=no` → 进入 Phase 4（审查）
- `fail` 或 `regression_detected=yes` → 写入 `artifacts/test-failure-<N>.md`（摘录关键失败信息）→ 回 Phase 3

| 声称 | 必需证据 | 不充分 |
|------|----------|--------|
| 测试通过 | test-result artifact 中 `test_status=pass` + Full Output | Lead 凭记忆声称通过 |
| 功能正常 | test-result 中 `original_issue_resolved=yes` + 实际运行日志 | 代码看起来正确 |
| 无回归 | test-result 中 `regression_detected=no` + 全套测试输出 | 部分测试通过 |

更新 `progress.md`（测试轮次 + 裁决结果 + artifact 路径）。失败 → 回 Phase 3，最多 3 轮。

---

#### Phase 4：审查

##### 4.1 简单任务

Lead 裁决但不改码。有修复需求则回 Phase 3 resume 原 `simple-executor`。

##### 4.2 复杂任务

写入 `artifacts/review-request-<n>.md` + `artifacts/diff-<n>.txt`，并行派发两个 reviewer：

```
Agent({ subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-a-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review correctness, safety, performance, error handling. Return findings grouped by severity.",
  description: "Codex worker reviewer-a" })

Agent({ subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-b-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review architecture consistency, maintainability, regression risk, testing gaps. Return findings grouped by severity.",
  description: "Codex worker reviewer-b" })
```

合并到 `findings.md`。接受前校验 Codex 证据（同 Phase 1）。

若有 Critical → 写 `review-failure-<n>.md` → 追加到 `inputs/task.md` → 回 Phase 3 resume 原 executor。

---

### 止损

若 `ITERATION >= 3` 且仍未收敛：

```
AskUserQuestion({
  question: "经过 N 轮迭代仍未收敛。请选择后续处理方式。",
  options: ["继续迭代", "接受当前状态并完成", "回退主要变更"]
})
```

---

### 完成

条件：目标完成 + 关键测试通过（或用户同意跳过）+ 无未决 Critical。

1. 更新 `progress.md` 状态为 `complete`
2. 汇总最终摘要到 `findings.md`
3. Worker / session 注册表状态更新为 `completed`
4. 若用过 Team 模式：`TeamDelete({ team_name: "<TEAM_NAME>" })`（失败只记录，不影响完成状态）
5. 向用户输出：变更摘要 / 测试结果 / 审查结果 / 迭代次数 / worker 复用情况
