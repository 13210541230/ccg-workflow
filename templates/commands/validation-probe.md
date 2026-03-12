---
description: '编排链路验证探针：仅验证 /ccg:manage 的 analyze -> plan -> execute -> review 链路，不安装'
---
<!-- VALIDATION-ONLY: single-commit rollback target -->

# Validation-Probe - /ccg:manage Orchestration Smoke Test

Use to verify the analyze -> plan -> execute -> review chain is reachable.

1. Confirm the template is discoverable.
2. Do not modify repository files.
3. Return chain reachability report only.
