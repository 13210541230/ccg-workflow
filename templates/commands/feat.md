---
description: '兼容入口：功能开发流程已收口到 /ccg:manage'
---

# Feat - 兼容入口

$ARGUMENTS

`/ccg:feat` 已不再维护独立的规划/实施流程。功能开发统一交给 `/ccg:manage`。

## 处理方式

1. 告知用户：`feat` 已收口到 `manage`
2. 将当前请求视为“功能开发任务”
3. 按以下等价方式执行：

```bash
/ccg:manage $ARGUMENTS
```

## 额外约束

- 若任务偏前端，在 `manage` 的复杂度判断和规划中注明 `frontend-focus`
- 若任务偏后端，在 `manage` 的复杂度判断和规划中注明 `backend-focus`
- 不再依赖旧的 `planner` / `ui-ux-designer` 主流程作为默认路径
