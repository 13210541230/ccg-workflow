---
description: '兼容入口：前端专项流程已收口到 /ccg:manage'
---

# Frontend - 兼容入口

$ARGUMENTS

`/ccg:frontend` 已收口到 `/ccg:manage`。保留该命令仅用于兼容旧入口。

## 处理方式

1. 告知用户：前端专项命令已统一并入 `manage`
2. 将当前任务标记为 `frontend-focus`
3. 按以下等价方式执行：

```bash
/ccg:manage [frontend-focus] $ARGUMENTS
```

## 前端聚焦规则

- 在分析和规划阶段优先关注组件边界、交互、样式系统、可访问性
- 如果任务足够简单，可由 Claude 直接完成
- 如果任务复杂，仍由 `manage` 决定是否进入 `codex-* teammate` 路径
