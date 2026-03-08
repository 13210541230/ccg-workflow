# Manage 状态文件格式规范

存放路径：`.claude/plan/<task-name>/`

## 四个状态文件

| 文件 | 用途 | 更新频率 |
|------|------|----------|
| `task_plan.md` | 任务拆解 + 依赖关系 + 子任务描述 | 动态：规划后补充实施步骤，执行偏差时追加偏差记录 |
| `decisions.md` | 讨论阶段确认的关键决策集（复杂任务） | Phase 0.5 写入，后续只读 |
| `progress.md` | 各阶段状态 + 时间线 + 阶段产出摘要 | 动态，每阶段更新 |
| `findings.md` | 子Agent产出的发现/问题/审查结果 | 累积追加 |

## progress.md 模板

```markdown
# Progress: <任务名>

## 状态: <initializing|discussing|decisions_confirmed|analyzing|planning|confirmed|executing|reviewing|testing|complete>

## 复杂度: <简单|复杂>
<评估依据>

## 时间线
- [HH:MM] 初始化完成（复杂度：简单/复杂）
- [HH:MM] 讨论阶段完成（N 个决策已确认）← 仅复杂任务
- [HH:MM] 分析阶段完成
- [HH:MM] 规划阶段完成
- [HH:MM] 用户确认计划
- [HH:MM] 实施阶段完成
- [HH:MM] 审查阶段完成
- [HH:MM] 测试阶段完成

## 阶段产出

### 分析
<摘要>

### 规划
<摘要>

### 实施
<摘要>

### 审查
<摘要>

### 测试
<摘要>

## 错误日志

| 时间 | 阶段 | Worker | 错误描述 | 尝试次数 | 解决方式 |
|------|------|--------|----------|----------|----------|

## 会话日志

| 时间 | 阶段 | Worker | 关键动作 | 结果 |
|------|------|--------|----------|------|
```

## findings.md 模板

```markdown
# Findings: <任务名>

## 分析发现
- [来源: analyze-worker] <发现内容>

## 规划产出
- [来源: plan-worker] <产出内容>

## 实施产出
- [来源: execute-worker] <变更文件列表 + diff 摘要>

## 审查结果
- [来源: review-worker] <按 Critical/Major/Minor/Suggestion 分级>

## 测试结果
- [来源: test-worker] <测试结果>
```

## decisions.md 模板

```markdown
# Decisions: <任务名>

## 复杂度评估
- 子任务数：N
- 涉及文件数：N
- 架构变更：是/否
- 备选方案数：N
- 风险等级：低/中/高
- **结论**：复杂 → 进入讨论阶段

## 已确认决策

### 决策 1: <决策点名称>
- **问题**: <需要决策的问题>
- **选项**: A) ... / B) ... / C) ...
- **用户选择**: <选项>
- **原因**: <理由>

## 决策摘要（供后续阶段引用）
<将所有已确认决策整理为一段简洁的约束描述>
```
