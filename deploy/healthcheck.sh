#!/bin/bash
# ============================================================
#  lesson 预约系统 —— 存活告警巡检（cron 每 5 分钟跑一次）
#  文件：/opt/lesson/healthcheck.sh
#  定时：crontab -e 追加
#    */5 * * * * /opt/lesson/healthcheck.sh >> /var/log/lesson/healthcheck.log 2>&1
# ------------------------------------------------------------
#  为什么是这三条：每条都对应一个**已经发生过或极易发生**的静默故障。
#  它们的共同点是「进程活着、日志没报错，但功能已经失效」——
#  systemd 不会重启，日志翻到底也看不出来，只有主动巡检能发现：
#
#   ① 磁盘与日志体积 ← systemd 的 append: 日志永不滚动，写满磁盘会让
#                       MySQL 与两个服务一起异常。
#   ② 上课提醒应发却 0 条 ← 历史上真发生过：NotifyTask 在跑、日志在打，
#                       但租户上下文拿不到被兜底成 tenant_id=-1，
#                       所有查询恒空 → 用户侧"预约成功但课前零通知"。
#  ③ message-service 不可达 ← 上课提醒靠 api 同步 HTTP 投递；msg 挂掉时
#                       api 不会崩，只会把通知全丢。
#
#  退出码：0=全绿；1=有告警（供 cron 邮件/监控采集）
# ============================================================
set -uo pipefail

# ---- 配置（按实际环境改）----
API_URL="${API_URL:-http://127.0.0.1:8081}"
MSG_URL="${MSG_URL:-http://127.0.0.1:8090}"
DISK_WARN="${DISK_WARN:-85}"            # 磁盘使用率告警阈值（%）
LOG_DIR_WARN_MB="${LOG_DIR_WARN_MB:-20480}"  # /var/log/lesson 体积告警（MB）
NOTIFY_LOOKBACK_MIN="${NOTIFY_LOOKBACK_MIN:-30}"
DB_NAME="${DB_NAME:-lesson_appointment}"
# 巡检要不要连库。连库才准确；不配则明确告警而不是静默跳过
#（静默跳过会让人以为这条监控在跑）。
MYSQL_LOGIN_PATH="${MYSQL_LOGIN_PATH:-}"

ALERTS=0
say()   { echo "[$(date '+%F %T')] $*"; }
alert() { echo "[$(date '+%F %T')] 告警：$*"; ALERTS=$((ALERTS+1)); }

# ============================================================ ① 磁盘与日志体积
# 只查日志/程序所在分区：/、/var/log/lesson、/opt/lesson 可能分属不同分区，
# 对每个分区去重后各查一次（对同一分区重复告警是噪音）。
check_disk() {
  local paths="/ /var/log/lesson /opt/lesson"
  local devs
  devs=$(for p in $paths; do
            [ -d "$p" ] && df -P "$p" 2>/dev/null | awk 'NR==2{print $6}'
          done | sort -u)

  if [ -z "$devs" ]; then
    alert "df 无输出，无法判断磁盘占用（df 异常或上述路径均不存在）"
    return
  fi

  for d in $devs; do
    local used
    used=$(df -P "$d" | awk 'NR==2{gsub(/%/,"",$5); print $5}')
    [ -z "$used" ] && continue
    if [ "$used" -ge "$DISK_WARN" ]; then
      alert "磁盘 $d 使用率 ${used}% ≥ ${DISK_WARN}%：$(df -h "$d" | tail -1 | awk '{print $3" 已用 / "$2"总量"}')"
    fi
  done

  # 未到阈值也提醒：日志目录几十 GB 说明滚动配置根本没生效（logrotate 没装）
  if [ -d /var/log/lesson ]; then
    local logmb
    logmb=$(du -sm /var/log/lesson 2>/dev/null | awk '{print $1}')
    if [ -n "${logmb:-}" ] && [ "$logmb" -gt "$LOG_DIR_WARN_MB" ]; then
      alert "/var/log/lesson 已占 ${logmb}MB（阈值 ${LOG_DIR_WARN_MB}MB）—— 怀疑滚动未生效，请装 deploy/logrotate/lesson 并执行 sudo logrotate -d /etc/logrotate.d/lesson"
    fi
  fi
}

# ============================================================ ② 上课提醒"应发却 0 条"
# 判据：存在课次，其某一提醒档位的应发时刻（上课时刻 - offset_minutes）
#      已经落在 [now - TOLERANCE(5min), now] 窗口内，
#      但 notification_dispatch_log 里没有对应的成功记录。
#
# 下面 SQL 的口径**逐条对齐 NotifyDispatchService 的真实实现**（改动时必须同步）：
#   · 应发窗口  → isDue(): expect.plusMinutes(TOLERANCE_MINUTES) >= now，TOLERANCE=5
#     见 NotifyDispatchService:230；SQL 用 expect BETWEEN now-5min AND now
#   · 候选课次  → 未来 SCAN_DAYS=30 天内、状态不在 DEAD_APPOINTMENT_STATUS
#     见 NotifyDispatchService:531-535
#   · 档位来源  → course_notify_rule（按课程）→ course_notify_rule_point
#     **注意关联链路**：appointment **没有 schedule_id 列**，
#     必须 appointment → booking（booking.schedule_id）→ course_schedule → course
#     （与 NotifyDispatchService.resolveCourseId 同口径）
#   · 成功口径  → notification_dispatch_log.status = 'SENT'
check_notify() {
  if [ -z "$MYSQL_LOGIN_PATH" ]; then
    alert "通知巡检未启用：MYSQL_LOGIN_PATH 未配置，无法判断'应发却 0 条'。
       配置：mysql_config_editor set --login-path=health --host=localhost --user=root --password，
       然后在本脚本顶部 export MYSQL_LOGIN_PATH=health"
    return
  fi

  # 应发条数：课次 × 到点档位 × 有效规则
  local q_should
  q_should="
    SELECT COUNT(*)
      FROM appointment a
      JOIN booking b          ON b.booking_id = a.booking_id
      JOIN course_schedule s  ON s.schedule_id = b.schedule_id
      JOIN course_notify_rule r        ON r.course_id = s.course_id AND r.enabled = 1
      JOIN course_notify_rule_point p  ON p.rule_id = r.id
     WHERE a.appointment_datetime > NOW()
       AND a.appointment_datetime <= DATE_ADD(NOW(), INTERVAL 30 DAY)
       AND a.status NOT IN ('completed','cancelled','canceled','changed','frozen',
                            'cancelling','canceling','s-cancelling','t-cancelling',
                            'rej-booking','rej-cancelling','delete')
       AND DATE_ADD(a.appointment_datetime, INTERVAL -p.offset_minutes MINUTE)
           BETWEEN DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND NOW()
       AND NOT EXISTS (
             SELECT 1 FROM notification_dispatch_log d
              WHERE d.appointment_id = a.id AND d.seq = p.seq AND d.status = 'SENT')
  "

  # 实际发送条数（近 N 分钟，含 FAILED 以便区分"发过但失败"与"压根没发"）
  #
  # ⚠️ 必须用 COALESCE 包住SUM：流水表为空时 SUM() 返回 **NULL**（不是 0），
  #    直接进 cut -d/ -f1 会得到空串，`[ "" -eq 0 ]` 在 bash 里报语法错，
  #    整条巡检随之中断 —— 实测踩到过。COUNT() 同理。
  local q_sent
  q_sent="
    SELECT CONCAT(COALESCE(SUM(status = 'SENT'), 0), '/', COALESCE(COUNT(*), 0))
      FROM notification_dispatch_log
     WHERE sent_at >= DATE_SUB(NOW(), INTERVAL ${NOTIFY_LOOKBACK_MIN} MINUTE)
  "

  local should sent_ratio
  should=$(mysql --login-path="$MYSQL_LOGIN_PATH" -N -B -D "$DB_NAME" -e "$q_should" 2>/dev/null)
  if [ -z "$should" ]; then
    alert "通知巡检查询失败：表名/字段与当前 schema 不符，或 DB 不可达。
       本查询依赖 appointment / booking / course_schedule / course_notify_rule /
       course_notify_rule_point / notification_dispatch_log 六张表。
       手工核对：mysql --login-path=$MYSQL_LOGIN_PATH -D $DB_NAME -e '$q_should'"
    return
  fi

  sent_ratio=$(mysql --login-path="$MYSQL_LOGIN_PATH" -N -B -D "$DB_NAME" -e "$q_sent" 2>/dev/null)
  local sent failed
  sent=$(echo "${sent_ratio:-0/0}" | cut -d/ -f1)
  failed=$(echo "${sent_ratio:-0/0}" | cut -d/ -f2)

  if [ "${should:-0}" -gt 0 ]; then
    if [ "${sent:-0}" -eq 0 ]; then
      if [ "${failed:-0}" -gt 0 ]; then
        alert "上课提醒近 ${NOTIFY_LOOKBACK_MIN} 分钟有 ${failed} 条记录但成功 0 条（应发 ${should} 条）—— 投递全失败。
           看 message_center 库 msg_delivery 与 api 日志里的'上课提醒推送失败'。"
      else
        alert "上课提醒应发 ${should} 条但近 ${NOTIFY_LOOKBACK_MIN} 分钟**一条记录都没有** —— 任务在跑但没产出。
           排查顺序：① sys_system_config 里 notify.task.enabled 是否为 0（为 0 时静默跳过，日志无异常）
                     ② message-service 是否可达（$MSG_URL/actuator/health/readiness）
                     ③ 租户上下文：NotifyTask 若没逐个 setTenantId，插件会兜底 tenant_id=-1 导致恒空"
      fi
    fi
  fi
}

# ============================================================ ③ 两个服务的探针
check_probe() {
  local name="$1" url="$2" code
  # --noproxy：服务器上常设 http_proxy，本机回环必须绕开，否则探针永远失败
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 --noproxy '*' \
         "$url/actuator/health/readiness" 2>/dev/null)
  if [ "$code" != "200" ]; then
    alert "$name 探针异常：$url/actuator/health/readiness → ${code:-连接失败}（期望 200）。
       503 多为 DB 不可达；000 为进程未起/端口不通。查：systemctl status $name"
  fi
}

# ============================================================ 主流程
check_disk
check_probe "booking"         "$API_URL"
check_probe "message-service" "$MSG_URL"
check_notify

if [ "$ALERTS" -eq 0 ]; then
  say "巡检通过：磁盘正常、两个服务探针 200、通知流水无异常。"
  exit 0
fi
say "巡检完成，共 $ALERTS 条告警。"
exit 1