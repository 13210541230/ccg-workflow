#!/usr/bin/env bash
# release.sh - CCG 发版自动化脚本（插件模式）
# 用法: bash release.sh <new-version> [--skip-plugin]
#
# 功能:
#   1. 更新 package.json 版本号
#   2. 构建插件 (build-plugin.mjs)
#   3. 运行测试 (vitest)
#   4. 同步插件到 ccg-plugin 仓库 + 推送

set -euo pipefail

# ── 参数解析 ──────────────────────────────────────────────
VERSION=""
SKIP_PLUGIN=false
PROJECT_ROOT=""
PLUGIN_REPO=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-plugin)  SKIP_PLUGIN=true; shift ;;
        --project-root) PROJECT_ROOT="$2"; shift 2 ;;
        --plugin-repo)  PLUGIN_REPO="$2"; shift 2 ;;
        -*)             echo "Unknown option: $1"; exit 1 ;;
        *)              VERSION="$1"; shift ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    echo "Usage: bash release.sh <version> [options]"
    echo ""
    echo "Options:"
    echo "  --skip-plugin       跳过插件构建和同步"
    echo "  --project-root PATH 指定 ccg-workflow 根目录"
    echo "  --plugin-repo PATH  指定 ccg-plugin 仓库路径"
    echo ""
    echo "Example: bash release.sh 1.7.69"
    exit 1
fi

# 自动检测项目根目录
if [[ -z "$PROJECT_ROOT" ]]; then
    PROJECT_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
fi
cd "$PROJECT_ROOT"

# 自动检测 ccg-plugin 仓库路径（与 ccg-workflow 同级）
if [[ -z "$PLUGIN_REPO" ]]; then
    PLUGIN_REPO="$(cd "$PROJECT_ROOT/.." && pwd)/ccg-plugin"
fi

TOTAL_STEPS=5
if [[ "$SKIP_PLUGIN" == "true" ]]; then TOTAL_STEPS=3; fi

echo "══════════════════════════════════════════"
echo "  CCG Release v${VERSION}"
echo "══════════════════════════════════════════"

STEP=0

# ── Step 1: 更新 package.json 版本号 ──────────────────────
STEP=$((STEP + 1))
echo ""
echo "▶ [${STEP}/${TOTAL_STEPS}] 更新 package.json 版本号..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
pkg.version = '${VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✓ version: ' + pkg.version);
"

# ── Step 2: 构建插件 ─────────────────────────────────────
if [[ "$SKIP_PLUGIN" == "false" ]]; then
    STEP=$((STEP + 1))
    echo ""
    echo "▶ [${STEP}/${TOTAL_STEPS}] 构建插件..."
    node scripts/build-plugin.mjs --verbose 2>&1 | tail -3
    echo "  ✓ 插件构建完成"
fi

# ── Step 3: 运行测试 ─────────────────────────────────────
STEP=$((STEP + 1))
echo ""
echo "▶ [${STEP}/${TOTAL_STEPS}] 运行测试..."
if npx vitest run 2>&1 | tail -5; then
    echo "  ✓ 测试通过"
else
    echo "  ✗ 测试失败，中止发版"
    exit 1
fi

# ── Step 4: 同步到 ccg-plugin 仓库 ──────────────────────
if [[ "$SKIP_PLUGIN" == "false" ]]; then
    STEP=$((STEP + 1))
    echo ""
    echo "▶ [${STEP}/${TOTAL_STEPS}] 同步插件到 ccg-plugin 仓库..."

    if [[ ! -d "$PLUGIN_REPO/.git" ]]; then
        echo "  ✗ ccg-plugin 仓库不存在: $PLUGIN_REPO"
        echo "  请用 --plugin-repo 指定路径或 git clone 到 $PLUGIN_REPO"
        exit 1
    fi

    # 按当前插件产物逐目录复制（保留 .git 和 README.md）
    for dir in .claude-plugin agents commands hooks output-styles prompts scripts shared skills; do
        rm -rf "$PLUGIN_REPO/$dir"
        if [[ -d "dist/plugin/$dir" ]]; then
            cp -r "dist/plugin/$dir" "$PLUGIN_REPO/$dir"
        fi
    done
    cp dist/plugin/.mcp.json "$PLUGIN_REPO/.mcp.json"

    echo "  ✓ 已同步到 $PLUGIN_REPO"

    # ── Step 5: 提交并推送 ccg-plugin ────────────────────
    STEP=$((STEP + 1))
    echo ""
    echo "▶ [${STEP}/${TOTAL_STEPS}] 提交并推送 ccg-plugin..."
    WORKFLOW_COMMIT=$(git rev-parse --short HEAD)
    cd "$PLUGIN_REPO"
    git add -A
    if git diff --cached --quiet; then
        echo "  ✓ ccg-plugin 无变更，跳过提交"
    else
        git commit -m "sync: update from ccg-workflow v${VERSION}

Synced from ccg-workflow@${WORKFLOW_COMMIT}."
        git push origin main
        echo "  ✓ ccg-plugin 已推送到 origin/main"
    fi
    cd "$PROJECT_ROOT"
fi

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ Release v${VERSION} 完成"
echo "══════════════════════════════════════════"
echo ""
echo "后续手动步骤："
echo "  1. 确认 CHANGELOG.md / CLAUDE.md 已更新"
echo "  2. git add && git commit -m 'chore: bump version to ${VERSION}'"
echo "  3. git push origin main"
echo "  4. 用户执行 /plugin update 获取更新"
