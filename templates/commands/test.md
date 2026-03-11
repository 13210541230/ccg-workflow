---
description: '多模型测试生成：智能路由 Codex 后端测试 / Codex 架构测试'
---

# Test - 多模型测试生成

根据代码类型智能路由，生成高质量测试用例。

## 使用方法

```bash
/test <测试目标>
```

## 上下文

- 测试目标：$ARGUMENTS
- 智能路由：后端 → Codex，架构/设计 → Codex，全栈 → 并行
- 遵循项目现有测试框架和风格

## 你的角色

你是**测试工程师**，编排测试生成流程：
- **Codex-A** – 后端测试生成（**后端权威**）
- **Codex-B** – 架构测试生成（**架构视角**）
- **Claude (自己)** – 整合测试、验证运行

---

## 多模型调用规范

> **必须先读取共享规范**：使用 Read 工具读取 `~/.claude/.ccg/shared/multi-model-spec.md` 获取调用语法、等待规范、输出丢失检测等通用规范。读取后严格遵循其中的规范执行。

**角色提示词**：

| 模型 | 提示词 |
|------|--------|
| Codex-A | `~/.claude/.ccg/prompts/codex/tester.md` |
| Codex-B | `~/.claude/.ccg/prompts/codex/tester.md` |

**智能路由**：

| 代码类型 | 路由 |
|---------|------|
| 后端 | Codex |
| 架构/设计 | Codex |
| 全栈 | 并行执行两者 |

---

## 执行工作流

**测试目标**：$ARGUMENTS

### 🔍 阶段 0：Prompt 增强（可选）

`[模式：准备]` - **Prompt 增强**（按 `/ccg:enhance` 的逻辑执行）：分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准），**用增强结果替代原始 $ARGUMENTS，后续调用 Codex 时传入增强后的需求**

### 🔍 阶段 1：测试分析

`[模式：研究]`

1. 检索目标代码的完整实现
2. 查找现有测试文件和测试框架配置
3. 识别代码类型：[后端/前端/全栈]
4. 评估当前测试覆盖率和缺口

### 🔬 阶段 2：智能路由测试生成

`[模式：生成]`

**⚠️ 根据代码类型必须调用对应模型**（参照上方调用规范）：

- **后端代码** → `Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: false })`
  - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/tester.md`
- **架构/设计代码** → `Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: false })`
  - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/tester.md`
- **全栈代码** → 并行调用两者：
  1. `Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: true })`
     - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/tester.md`
  2. `Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: true })`
     - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/tester.md`
  用 `TaskOutput` 等待结果

OUTPUT：完整测试代码（使用项目现有测试框架，覆盖正常路径、边界条件、异常处理）

**必须等所有模型返回后才能进入下一阶段**。

**务必遵循上方 `多模型调用规范` 的 `重要` 指示**

### 🔀 阶段 3：测试整合

`[模式：计划]`

1. 收集模型输出
2. Claude 重构：统一风格、确保命名一致、优化结构、移除冗余

### ✅ 阶段 4：测试验证

`[模式：执行]`

1. 创建测试文件
2. 运行生成的测试
3. 如有失败，分析原因并修复

---

## 输出格式

```markdown
## 🧪 测试生成：<测试目标>

### 分析结果
- 代码类型：[后端/前端/全栈]
- 测试框架：<检测到的框架>

### 生成的测试
- 测试文件：<文件路径>
- 测试用例数：<数量>

### 运行结果
- 通过：X / Y
- 失败：<如有，列出原因>
```

## 测试策略金字塔

```
    /\      E2E (10%)
   /--\     Integration (20%)
  /----\    Unit (70%)
```

---

## 关键规则

1. **测试行为，不测试实现** – 关注输入输出
2. **智能路由** – 后端测试用 Codex，架构测试用 Codex
3. **复用现有模式** – 遵循项目已有的测试风格
4. 外部模型对文件系统**零写入权限**
