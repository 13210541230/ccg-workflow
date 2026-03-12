---
description: '多模型调试：Codex 后端诊断 + Codex 架构诊断，交叉验证定位问题'
---

# Debug - 多模型调试

双模型并行诊断，交叉验证快速定位问题根因。

## 使用方法

```bash
/debug <问题描述>
```

## 你的角色

你是**调试协调者**，编排多模型诊断流程：
- **Codex-A** – 后端诊断（**后端问题权威**）
- **Codex-B** – 架构诊断（**架构视角**）
- **Claude (自己)** – 综合诊断、执行修复

---

## 多模型调用规范

> **必须先读取共享规范**：使用 Read 工具读取 `~/.claude/.ccg/shared/multi-model-spec.md` 获取调用语法、等待规范、输出丢失检测等通用规范。读取后严格遵循其中的规范执行。

**角色提示词**：

| 模型 | 提示词 |
|------|--------|
| Codex-A | `~/.claude/.ccg/prompts/codex/debugger.md` |
| Codex-B | `~/.claude/.ccg/prompts/codex/debugger.md` |

---

## 执行工作流

**问题描述**：$ARGUMENTS

### 🔍 阶段 0：Prompt 增强（可选）

`[模式：准备]` - **Prompt 增强**（按 `/ccg:enhance` 的逻辑执行）：分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准），**用增强结果替代原始 $ARGUMENTS，后续调用 Codex 时传入增强后的需求**

### 🔍 阶段 1：上下文收集

1. 复现问题（最小复现步骤）
2. 收集相关日志
3. 检查环境配置
4. 完整阅读错误信息（不截断，不跳过堆栈）
5. 检查近期变更（git log / git diff）
6. 收集多组件证据（前端、后端、DB、网络各层）
7. 识别变更类型（类型 ID：配置/代码/依赖/环境）
⛔ 若无法复现 → 记录触发条件，禁止提出修复

### 🧠 阶段 1.5：结构化假设推理

`[模式：推理]`

**使用 sequential-thinking 构建诊断假设链**：

基于阶段 1 收集的错误日志、堆栈信息和上下文，调用 `mcp__sequential-thinking__sequentialthinking` 进行链式推理：

1. **症状梳理**（thought 1）：归纳已知症状，区分直接表现与间接影响
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "梳理已知症状：<错误日志摘要>。直接表现：...；间接影响：...",
     thoughtNumber: 1,
     totalThoughts: 4,
     nextThoughtNeeded: true
   })
   ```

2. **原因推导**（thought 2）：基于症状推导可能原因，按概率排序
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "基于上述症状，可能原因（按概率排序）：1) ... 2) ... 3) ...",
     thoughtNumber: 2,
     totalThoughts: 4,
     nextThoughtNeeded: true
   })
   ```

3. **验证方案**（thought 3）：为每个假设设计最小验证方案
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "验证方案：假设1 → 检查...; 假设2 → 检查...; 假设3 → 检查...",
     thoughtNumber: 3,
     totalThoughts: 4,
     nextThoughtNeeded: true
   })
   ```

4. **假设关系**（thought 4）：识别假设间的依赖和排斥关系，确定诊断优先级
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "假设关系：假设1与假设2互斥（因为...），假设3独立。诊断优先级：...",
     thoughtNumber: 4,
     totalThoughts: 4,
     nextThoughtNeeded: false
   })
   ```

**产出**：结构化假设列表（按优先级排序），作为阶段 2 Codex 双模型诊断的附加输入。

### 🔬 阶段 2：并行诊断

`[模式：诊断]`

**⚠️ 必须发起两个并行 Bash 调用**（参照上方调用规范）：

1. **Codex 后端诊断**：`Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: true })`
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/debugger.md`
   - OUTPUT：诊断假设（按可能性排序），每个假设包含原因、证据、修复建议

2. **Codex 架构诊断**：`Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: true })`
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/debugger.md`
   - OUTPUT：诊断假设（按可能性排序），每个假设包含原因、证据、修复建议

用 `TaskOutput` 等待两个模型的诊断结果。**必须等所有模型返回后才能进入下一阶段**。

**务必遵循上方 `多模型调用规范` 的 `重要` 指示**

### 🔀 阶段 3：假设整合

`[模式：验证]`

1. 交叉验证双方诊断结果
2. 筛选 **Top 1-2 最可能原因**
3. 设计验证策略

### 🔍 阶段 3.5：模式对比分析

`[模式：比对]`

对 Top 1-2 假设，执行以下对比：

1. **寻找工作参照**：在代码库中找到与故障代码相似的、正常运行的代码
2. **逐项对比差异**：列出所有差异（不论大小），避免"这不可能有影响"的主观判断
3. **理解依赖关系**：故障组件依赖哪些配置、环境变量、上下文状态？
4. 将差异列表附加到假设中，作为阶段 4（用户确认）的补充证据

### ⛔ 阶段 4：用户确认（Hard Stop）

`[模式：确认]`

```markdown
## 🔍 诊断结果

### Codex-A 分析（后端视角）
<诊断摘要>

### Codex-B 分析（架构视角）
<诊断摘要>

### 综合诊断
**最可能原因**：<具体诊断>
**验证方案**：<如何确认>

---
**确认后我将执行修复。是否继续？(Y/N)**
```

**⚠️ 必须等待用户确认后才能进入阶段 5**

### 🔧 阶段 5：修复与验证

**修复验证 4 步协议**：
1. 应用修复
2. 运行完整测试套件
3. 验证原始症状消失
4. 检查无回归

**修复计数器**：第 1-2 次失败继续迭代；≥3 次失败 → 停止，进入架构问题门控。

**架构问题门控**（3 问）：
- (a) 是否是根本设计缺陷？
- (b) 是否需要更大范围重构？
- (c) 是否需要升级用户？

**禁止**：未过架构门控，禁止进行第 4 次以上修复尝试。

---

## 关键规则

1. **用户确认** – 修复前必须获得确认
2. **信任规则** – 双 Codex 交叉验证
3. 外部模型对文件系统**零写入权限**
