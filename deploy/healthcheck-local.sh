#!/bin/bash
# ============================================================
#  lesson 预约系统 —— Windows 本机版巡检循环（cron 的等价物）
#  文件：deploy/healthcheck-local.sh
#  用法：
#     bash deploy/healthcheck-local.sh            # 前台跑一次（便于手工验证）
#     bash deploy/healthcheck-local.sh --loop     # 每5 分钟循环（等价 */5 * * * *）
#
#  为什么需要这个文件：服务器上 crontab 的那行
#     */5 * * * * /opt/lesson/healthcheck.sh >> /var/log/lesson/healthcheck.log 2>&1
# 在 Windows 本机**没有等价命令**（无 crontab、无 systemd timer），
# 所以本机调试期只能：(a) 手工跑一次；或 (b) 起一个 sleep 循环代替 cron。
#
#  ⚠️ 长期无人值守请用 Windows「任务计划程序」而不是本脚本：
#     见文件末尾 README 段给出的 schtasks 命令。用 bash 循环当常驻进程，
#     关掉这个终端就没了，且 Windows 休眠期间不会跑。
# ------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTERVAL="${INTERVAL:-300}"      # 巡检间隔秒，默认 300 = 5 分钟，与服务器 cron 对齐

# ---- 本机环境差异（服务器上这些都不需要）----
# ① 日志目录：本机没有 /var/log/lesson，业务日志在 api/logs 与 message-service/logs
export LOG_DIR_LOCAL="${LOG_DIR_LOCAL:-}"
# ② 数据库凭据：本机无 tty，mysql_config_editor 无法非交互写密码，
#    因此默认用 MYSQL_PWD 回退（登录方式见 healthcheck.sh 顶部注释）。
#    **不要把真实密码提交进 Git** —— 需要时在 shell 里 export，或写进
#    被.gitignore 忽略的本机私有文件后 source。
if [ -f "$(dirname "$HERE")/.healthcheck.local.env" ]; then
  # shellcheck disable=SC1091
  . "$(dirname "$HERE")/.healthcheck.local.env"
fi

run_once() {
  # 输出统一追加到本机日志文件，替代服务器上的 >> /var/log/lesson/healthcheck.log
  local log="${HEALTH_LOG:-$HERE/../.workbuddy/healthcheck-local.log}"
  mkdir -p "$(dirname "$log")"
  bash "$HERE/healthcheck.sh" >>"$log" 2>&1
  local rc=$?
  # 退出码非0 = 有告警。本机没有邮件/监控采集，**主动打到控制台**，
  # 否则日志躺在文件里没人看，等于白跑（这是本机与服务器最大的行为差异）。
  if [ "$rc" -ne 0 ]; then
    echo "[$(date '+%F %T')] 巡检退出码 $rc，详见 $log"
    tail -20 "$log"
  fi
  return $rc
}

if [ "${1:-}" = "--loop" ]; then
  echo "本机巡检循环已启动：每 ${INTERVAL}s 一次，Ctrl+C 停止。"
  while true; do
    run_once || true
    sleep "$INTERVAL"
  done
else
  run_once
  exit $?
fi

# ============================================================
#  README：Windows 长期驻留的正确做法（任务计划程序）
# ------------------------------------------------------------
#  打开 PowerShell（管理员）执行一次即可，之后开机自启、关机/重启都不丢：
#
#    schtasks /Create /TN "lesson-healthcheck" /TR "C:\Program Files\Git\bin\bash.exe C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\deploy\healthcheck-local.sh" ^
#             /SC MINUTE /MO 5 /F
#
#  手动立即跑一次：
#    schtasks /Run /TN "lesson-healthcheck"
#  查看结果：
#    schtasks /Query /TN "lesson-healthcheck" /V /FO LIST
#  删除：
#    schtasks /Delete /TN "lesson-healthcheck" /F
#
#  /TR 里路径必须带引号且用反斜杠（Windows 不认 /），
#  且**不要**带参数——bash.exe 的第一个参数就是脚本路径。
# ============================================================