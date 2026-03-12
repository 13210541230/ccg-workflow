---
description: '兼容入口：完整开发工作流已收口到 /ccg:manage'
---

# Workflow - 兼容入口

$ARGUMENTS

`/ccg:workflow` 已不再维护独立工作流实现。该命令保留仅用于兼容旧习惯，新的统一入口是 `/ccg:manage`。

## 处理方式

1. 明确告知用户：`workflow` 已并入 `manage`
2. 保留用户原始任务意图
3. 按以下等价方式执行：

```bash
/ccg:manage $ARGUMENTS
```

## 兼容规则

- 不再使用旧的 6 阶段独立文案
- 不再维护独立的双 Codex 会话协议
- 若任务明显是复杂开发任务，直接走 `manage` 的复杂 teammate 路径
- 若任务明显简单，直接走 `manage` 的简单直做路径
