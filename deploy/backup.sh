#!/bin/bash
# ============================================================
# 文件：/opt/lesson/backup.sh
# 用途：每日备份**三个库** + 课堂对象存储目录
#   · lesson_appointment（业务主库）
#   · message_center（消息中心）
#   · classroom（在线课堂）
#   · /opt/lesson/data/oss（课堂讲稿/作品/录制，DB 里只存对象 key）
#
# 前置（一次性，凭据加密存储，脚本里不写明文密码）：
#   mysql_config_editor set --login-path=backup --host=localhost --user=root --password
#
# 定时：crontab -e 追加
#   0 3 * * * /opt/lesson/backup.sh >> /var/log/lesson/backup.log 2>&1
#
# 2026-11-20 变更（原脚本只备两个库，课堂库与 oss 目录完全没覆盖）：
#   ① 补 classroom 库；② 补 oss 目录（tar.gz）；③ 两类**分开保留**——
#      库 dump 保留 14 天（小），oss 包默认只留 3 天（录制可达 GB 级，14 份全量会撑爆磁盘）；
#   ④ 失败不留半截文件：dumps 中途失败会把残缺的 .sql.gz 删掉再报错。
#      半截 dump "看起来有文件"但恢复不了，比没有更危险；
#   ⑤ 某项失败**不阻断**其它项，但整脚本 exit 1，cron 日志里能看见；
#   ⑥ 只有本轮对应类型备份成功，才对本类型做过期清理（否则一次失败会把历史备份删光）；
#   ⑦ 可用环境变量关掉任一类：BACKUP_OSS=0（只备库）/ BACKUP_DBS=0（只备文件）。
#
#   ⚠️ 必须开 pipefail（2026-11-20 实测踩到）：`mysqldump | gzip > out` 的退出码只看
#      **管道最后一个命令**（gzip）。凭据错 / 库不存在时 mysqldump 报 1045 退出，gzip 照样
#      成功产出 20 字节的空包 → 脚本认为"备份成功"，既留下假备份、又照常清理过期文件。
#      加 `set -o pipefail` 后管道任一环失败即视为失败；再配下面的大小校验兜底。
#
# 恢复口径（重要）：
#   库 + oss 目录**必须一起恢复**。只回库不回文件 = 记录都在、点开全 404；
#   只回文件不回库 = 文件在磁盘上但没有任何记录指向它。详见《维护手册》9.3。
# ============================================================
set -eo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BAK_DIR="${BAK_DIR:-/opt/backup}"

# 库 dump 保留天数（表结构 + 数据都是压缩文本，14 天体积可控）
DB_KEEP_DAYS="${DB_KEEP_DAYS:-14}"
# oss 包保留天数。默认 3 天：录制文件动辄 GB 级，按 14 份全量留存很容易撑爆磁盘。
# 需要更长留存请配 rsync/对象存储做异地增量，而不是在本机留更多全量包。
OSS_KEEP_DAYS="${OSS_KEEP_DAYS:-3}"
OSS_ROOT="${OSS_ROOT:-/opt/lesson/data/oss}"

# 单项开关（默认都开）
BACKUP_DBS="${BACKUP_DBS:-1}"
BACKUP_OSS="${BACKUP_OSS:-1}"

# oss 包超过这个体积（MB）时告警，提示改用 rsync 增量
OSS_WARN_MB="${OSS_WARN_MB:-2048}"

DBS="lesson_appointment message_center classroom"

mkdir -p "$BAK_DIR"

FAIL=0
DB_OK=1
OSS_OK=1
CREATED=()

# ------------------------------------------------------------
# 1) 三个库
# ------------------------------------------------------------
if [ "$BACKUP_DBS" = "1" ]; then
  for db in $DBS; do
    out="$BAK_DIR/${db}_${DATE}.sql.gz"
    # 两道判定：① 管道整体成功（pipefail）② 产物不是空壳（正常 dump 至少几百字节；
    # gzip 空包恒为 20 字节，是"mysqldump 没出东西"的典型指纹）
    if mysqldump --login-path=backup --single-transaction --routines --set-gtid-purged=OFF \
         "$db" | gzip > "$out" && [ "$(stat -c%s "$out" 2>/dev/null || echo 0)" -gt 100 ]; then
      CREATED+=("$out")
    else
      echo "[$(date '+%F %T')] ✗ 备份失败：${db}（残缺文件已删除）" >&2
      rm -f "$out"        # 半截 dump 恢复不了，不能留着冒充备份
      FAIL=1
      DB_OK=0
    fi
  done
else
  echo "[$(date '+%F %T')] BACKUP_DBS=0，跳过数据库备份"
fi

# ------------------------------------------------------------
# 2) 课堂对象存储目录（讲稿 / 作品 / 录制）
# ------------------------------------------------------------
if [ "$BACKUP_OSS" = "1" ]; then
  if [ ! -d "$OSS_ROOT" ]; then
    echo "[$(date '+%F %T')] ⚠ 未找到 $OSS_ROOT，跳过课堂文件备份（课堂未启用时属正常）"
  elif [ -z "$(ls -A "$OSS_ROOT" 2>/dev/null || true)" ]; then
    echo "[$(date '+%F %T')] · $OSS_ROOT 为空，跳过课堂文件备份"
  else
    # 体积先量一下：大于阈值时只告警不阻断（告警要能在 cron 日志里被看见）
    size_mb=$(du -sm "$OSS_ROOT" 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$size_mb" ] && [ "$size_mb" -gt "$OSS_WARN_MB" ]; then
      echo "[$(date '+%F %T')] ⚠ $OSS_ROOT 已达 ${size_mb}MB（阈值 ${OSS_WARN_MB}MB）：" \
           "本机全量包会长期占用 ${size_mb}MB × ${OSS_KEEP_DAYS} 份，" \
           "建议改用 rsync/对象存储做异地增量，并把 OSS_KEEP_DAYS 降到 1~2" >&2
    fi
    out="$BAK_DIR/oss_${DATE}.tar.gz"
    # -C 进目录再打包 "."，恢复时直接解到目标目录即可（不产生 oss/oss/... 这种套层）
    if tar -C "$OSS_ROOT" -czf "$out" . && [ -s "$out" ]; then
      CREATED+=("$out")
    else
      echo "[$(date '+%F %T')] ✗ 备份失败：$OSS_ROOT（残缺文件已删除）" >&2
      rm -f "$out"
      FAIL=1
      OSS_OK=0
    fi
  fi
else
  echo "[$(date '+%F %T')] BACKUP_OSS=0，跳过课堂文件备份"
fi

# ------------------------------------------------------------
# 3) 过期清理：**只清本轮成功的那一类**，避免一次失败把历史备份删光
# ------------------------------------------------------------
if [ "$DB_OK" = "1" ] && [ "$BACKUP_DBS" = "1" ]; then
  find "$BAK_DIR" -maxdepth 1 -name "*.sql.gz" -mtime +"$DB_KEEP_DAYS" -delete
fi
if [ "$OSS_OK" = "1" ] && [ "$BACKUP_OSS" = "1" ]; then
  find "$BAK_DIR" -maxdepth 1 -name "oss_*.tar.gz" -mtime +"$OSS_KEEP_DAYS" -delete
fi

# ------------------------------------------------------------
# 4) 收尾：报告本轮产物与备份目录占用
# ------------------------------------------------------------
echo "[$(date '+%F %T')] backup done: $(ls -1 "$BAK_DIR"/*_"${DATE}".* 2>/dev/null | wc -l) file(s)" \
     "| 目录占用 $(du -sh "$BAK_DIR" 2>/dev/null | awk '{print $1}')" \
     "| DB 保留 ${DB_KEEP_DAYS}d / OSS 保留 ${OSS_KEEP_DAYS}d"

if [ "$FAIL" != "0" ]; then
  echo "[$(date '+%F %T')] ✗ 本次备份有失败项，见上文" >&2
  exit 1
fi
