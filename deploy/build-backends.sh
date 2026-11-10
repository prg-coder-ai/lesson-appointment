#!/usr/bin/env bash
# ==============================================================================
# deploy/build-backends.sh —— 三个后端打包 + 产物收口（Git Bash / Linux / macOS）
#
# 用法：
#   bash deploy/build-backends.sh                         # 打包 booking + message-service（classroom 有 pom 才打）+ 收口
#   bash deploy/build-backends.sh --only booking         # 只打一个
#   bash deploy/build-backends.sh --only booking,message,classroom
#   bash deploy/build-backends.sh --no-clean             # 增量 package（不 clean，快）
#   bash deploy/build-backends.sh --no-collect           # 只打包，不复制到 deploy/jars
#
# 产物：deploy/jars/booking-api-*.jar、message-service-*.jar、classroom-service-*.jar
#       （与 frontend/build.js 的 deploy/dist/ 一起构成上传脚本的唯一取件点）
#
# 本机兼容：系统 `mvn` 若不可用/损坏，自动回落到直接调 Maven launcher JAR
#           （unset CLASSPATH + plexus-classworlds，绕开 mvn.cmd 的 GBK/换行问题）。
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NO_CLEAN=0
NO_COLLECT=0
ONLY=""
while [ $# -gt 0 ]; do
    case "$1" in
        --no-clean)   NO_CLEAN=1 ;;
        --no-collect) NO_COLLECT=1 ;;
        --only)       shift; ONLY="${1:-}" ;;
        --only=*)     ONLY="${1#--only=}" ;;
        -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "未知参数: $1"; exit 2 ;;
    esac
    if [ $# -gt 0 ]; then shift; fi   # --only 吃掉下一个参数后可能已无参数，空 shift 会触发 set -e
done

# 模块表：key|相对目录|pom 文件|显示名（classroom-service 在 wx_user_account 分支尚无 pom，见下方跳过逻辑）
MODULES=(
  "booking|api|booking-api"
  "message|api/message-service|message-service"
  "classroom|api/classroom-service|classroom-service"
)

want() {
    [ -z "$ONLY" ] && return 0
    case ",$ONLY," in *,"$1",*) return 0 ;; *) return 1 ;; esac
}

# --- Maven 命令探测 -----------------------------------------------------------
USE_LAUNCHER=0
if command -v mvn >/dev/null 2>&1 && mvn -v >/dev/null 2>&1; then
    USE_LAUNCHER=0
else
    USE_LAUNCHER=1
    M2="${MAVEN_HOME:-C:\\Program Files\\apache-maven-3.9.11}"
    echo "⚠ mvn 不可用，回落 Maven launcher：$M2"
fi

run_mvn() {
    local dir="$1"; shift
    if [ "$USE_LAUNCHER" -eq 1 ]; then
        ( cd "$dir" && unset CLASSPATH && java \
            -classpath "$M2\\boot\\plexus-classworlds-2.9.0.jar" \
            "-Dclassworlds.conf=$M2\\bin\\m2.conf" \
            "-Dmaven.home=$M2" \
            "-Dmaven.multiModuleProjectDirectory=$PWD" \
            org.codehaus.plexus.classworlds.launcher.Launcher -B "$@" )
    else
        ( cd "$dir" && mvn -B "$@" )
    fi
}

GOAL="clean package"
[ "$NO_CLEAN" -eq 1 ] && GOAL="package"

BUILT=0
SKIPPED=()
for m in "${MODULES[@]}"; do
    IFS='|' read -r key dir label <<< "$m"
    want "$key" || continue
    if [ ! -f "$ROOT/$dir/pom.xml" ]; then
        echo "⏭  跳过 $label：本分支没有 $dir/pom.xml（不构建）"
        SKIPPED+=("$label")
        continue
    fi
    echo "==> 打包 $label  ($dir)  [$GOAL -DskipTests]"
    # shellcheck disable=SC2086
    run_mvn "$ROOT/$dir" $GOAL -DskipTests -q
    BUILT=$((BUILT + 1))
done

if [ "$BUILT" -eq 0 ]; then
    echo "❌ 没有成功打包任何模块（检查 --only 参数或 pom.xml）"
    exit 1
fi
echo "✅ 已打包 $BUILT 个模块"

if [ "${#SKIPPED[@]}" -gt 0 ]; then
    echo "ℹ  未构建：${SKIPPED[*]}。注意：若其 target/ 下留有历史 jar，收口脚本仍会把它复制到 deploy/jars/，"
    echo "   上传前请看一眼 deploy/collect-artifacts.js 打印的 jar 时间，别把旧构建发到服务器。"
fi

if [ "$NO_COLLECT" -eq 0 ]; then
    echo "==> 收口 jar → deploy/jars/"
    node "$ROOT/deploy/collect-artifacts.js" --only jars
else
    echo "⏭  跳过收口 (--no-collect)"
fi

echo ""
echo "完成。产物目录：$ROOT/deploy/jars/ ；前端产物由 node frontend/build.js 自动收口到 $ROOT/deploy/dist/"
