#!/usr/bin/env bash
# ==============================================================================
# 回滚到上一版本（或指定版本）—— 只是 switch.sh 的取版本号外壳
#
# 用法（服务器上，root/sudo）：
#   sudo bash rollback.sh booking            # 回到该服务「上一次成功切换前」的版本
#   sudo bash rollback.sh booking 2.2.0-a1b2c3d   # 回到指定版本
#   sudo bash rollback.sh frontend
#
# ★ 镜像必须还在本机。发布脚本从不 docker rmi 旧镜像，就是为了让回滚随时可用；
#   若要清理，只清 30 天前的 tag（README 第十节给了命令），别清最近的。
#
# ★ 回滚的是**代码**，不是**数据库**。数据库迁移是单向的：新版本跑过 DDL/DML 之后，
#   回到旧版本一般没问题（新表新列旧代码不读），但旧版本写的行新代码可能读不了。
#   所以发布纪律是：DDL 一律「加」不「删」，字段先加后用、下个版本才删。
# ==============================================================================
set -euo pipefail

DIR="/opt/lesson/docker"
LOG="$DIR/releases.log"
SWITCH="$DIR/switch.sh"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "请用 root 执行：sudo bash $0 ..."
[ -x "$SWITCH" ] || die "缺 $SWITCH（switch.sh 必须可执行）"

SERVICE="${1:-}"
TARGET="${2:-}"
[ -n "$SERVICE" ] || die "用法：$0 <booking|message|classroom|frontend> [目标版本]"

if [ -z "$TARGET" ]; then
  [ -f "$LOG" ] || die "没有 $LOG，无法推断上一版本。请显式给版本号：$0 $SERVICE <tag>"
  # 取该服务最近一条 ok 记录的 old 列（第 3 列）。
  # 用 awk 而不是 grep+tail：一行里同时有 old/new，「上一次跑的是哪个」只能按列取。
  TARGET="$(awk -F'\t' -v s="$SERVICE" '$2==s && $5=="ok" {t=$3} END{print t}' "$LOG")"
  [ -n "$TARGET" ] || die "releases.log 里没有 $SERVICE 的成功记录，请显式给版本号"
  say "从 releases.log 推得 $SERVICE 上一版本：$TARGET"
fi

exec bash "$SWITCH" "$SERVICE" "$TARGET"
