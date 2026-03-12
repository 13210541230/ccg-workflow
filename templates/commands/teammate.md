---
description: '兼容入口：teammate 模式已并回 /ccg:manage'
---

# Teammate - 兼容入口

$ARGUMENTS

`/ccg:teammate` 不再作为独立主命令维护。它的有效能力已经并回 `/ccg:manage`。

## 处理方式

1. 告知用户：`teammate` 已收口到 `manage`
2. 将当前请求视为“强制启用复杂协作路径”的 `manage` 任务
3. 按以下等价方式执行：

```bash
/ccg:manage [force-complex-teammate] $ARGUMENTS
```

## 兼容规则

- 若任务原本只是验证 Codex 协作链路，仍由 `manage` 生成状态目录并走 teammate 路径
- 不再维护单独的 `bus/messages.jsonl` 工作流解释作为主入口
- 所有长期 teammate/session 复用规则以 `manage` 为准
