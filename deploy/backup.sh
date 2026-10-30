#!/bin/bash
# ============================================================
# 文件：/opt/lesson/backup.sh
# 用途：每日备份 lesson_appointment + message_center 两个库，保留 14 天
# 前置：先执行一次，凭据加密存储（脚本里不写明文密码）
#   mysql_config_editor set --login-path=backup --host=localhost --user=root --password
# 定时：crontab -e 追加
#   0 3 * * * /opt/lesson/backup.sh >> /var/log/lesson/backup.log 2>&1
# ============================================================
set -e

DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=14
BAK_DIR=/opt/backup

mkdir -p "$BAK_DIR"

mysqldump --login-path=backup --single-transaction --routines --set-gtid-purged=OFF \
  lesson_appointment | gzip > "$BAK_DIR/lesson_appointment_${DATE}.sql.gz"

mysqldump --login-path=backup --single-transaction --routines --set-gtid-purged=OFF \
  message_center | gzip > "$BAK_DIR/message_center_${DATE}.sql.gz"

find "$BAK_DIR" -name "*.sql.gz" -mtime +${KEEP_DAYS} -delete

echo "[$(date '+%F %T')] backup done: $(ls -1 $BAK_DIR/*_${DATE}.sql.gz 2>/dev/null | wc -l) file(s)"
