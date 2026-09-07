#!/usr/bin/env bash
#
# =============================================================================
#  setup-services.sh
#  在 Ubuntu 上为一键部署两个 Spring Boot 服务配置 systemd 开机自启：
#    1. booking（预约主服务）      -> /opt/lesson/booking-0.2.0.jar
#    2. message-service（消息中心）-> /opt/lesson/message-service-1.0.0.jar
#
#  每个服务的行为（与需求一一对应）：
#    - 开机自动启动        : WantedBy=multi-user.target + systemctl enable
#    - 程序退出自动重启     : Restart=on-failure + RestartSec=10s
#    - 最多重试 3 次        : StartLimitIntervalSec=600 + StartLimitBurst=3
#      （600 秒内连续失败 3 次后放弃，服务进入 failed 不再自动拉起）
#
#  用法：
#    sudo bash setup-services.sh
#
#  说明：脚本需要 root 权限（systemctl / useradd 均要求 root）。
# =============================================================================

set -euo pipefail   # 任一命令失败即退出；未定义变量报错；管道任一环节失败即失败

# -----------------------------------------------------------------------------
# 1. 集中配置区（按需修改）
# -----------------------------------------------------------------------------
SVC_USER="lesson"                 # 运行服务的非 root 用户
SVC_GROUP="lesson"
APP_DIR="/opt/lesson"             # jar 与运行目录

# 两个服务的定义：数组元素格式 "服务名|jar文件名|描述"
# 用此结构可轻松扩展更多服务
SERVICES=(
  "booking|booking-0.2.0.jar|Lesson Booking Service"
  "message-service|message-service-1.0.0.jar|Lesson Message Service"
)

# 重启/重试策略（两服务共用）
RESTART_POLICY="on-failure"       # 进程非 0 退出时重启；改 always 则任何退出都重启
RESTART_SEC="10s"                 # 每次重启前的等待，避免崩溃雪崩
LIMIT_INTERVAL="600"              # 统计窗口（秒）
LIMIT_BURST="3"                   # 窗口内最大自动重试次数

JAVA_BIN="/usr/bin/java"          # Java 可执行文件；按实际环境修改
# JVM 参数（按需）：例如 "-Xms256m -Xmx512m"
JAVA_OPTS=""

# -----------------------------------------------------------------------------
# 2. 权限与前置检查
# -----------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "错误：请使用 root 运行（sudo bash setup-services.sh）" >&2
  exit 1
fi

# 创建运行用户（已存在则跳过）
if ! id -u "$SVC_USER" &>/dev/null; then
  echo ">> 创建运行用户 $SVC_USER"
  useradd -r -s /bin/false "$SVC_USER"
else
  echo ">> 用户 $SVC_USER 已存在，跳过创建"
fi

# 确保运行目录存在并归属运行用户
if [[ ! -d "$APP_DIR" ]]; then
  echo ">> 创建目录 $APP_DIR"
  mkdir -p "$APP_DIR"
fi
chown -R "$SVC_USER:$SVC_GROUP" "$APP_DIR"

# -----------------------------------------------------------------------------
# 3. 为每个服务生成 systemd unit 文件并启用
# -----------------------------------------------------------------------------
for entry in "${SERVICES[@]}"; do
  # 拆解数组元素
  IFS='|' read -r SVC_NAME JAR_FILE SVC_DESC <<< "$entry"
  JAR_PATH="$APP_DIR/$JAR_FILE"
  UNIT_FILE="/etc/systemd/system/${SVC_NAME}.service"

  # 校验 jar 是否存在（不存在仅告警，不阻断其它服务）
  if [[ ! -f "$JAR_PATH" ]]; then
    echo "!! 警告：未找到 $JAR_PATH，跳过 $SVC_NAME（请先部署 jar）" >&2
    continue
  fi

  echo ">> 写入 unit 文件 $UNIT_FILE"

  # 用 heredoc 生成 unit 文件（带详细注释）
  cat > "$UNIT_FILE" <<EOF
[Unit]
Description=${SVC_DESC}
After=network.target
Wants=network.target

[Service]
Type=simple
# 以非 root 用户运行
User=${SVC_USER}
Group=${SVC_GROUP}
# 工作目录（jar 内的相对路径、日志等以此为准）
WorkingDirectory=${APP_DIR}
# 前台启动 jar；JAVA_OPTS 为空时不影响执行
ExecStart=${JAVA_BIN} ${JAVA_OPTS} -jar ${JAR_PATH}
# 进程异常退出（非 0）自动拉起；Always=任何退出都重启
Restart=${RESTART_POLICY}
# 每次重启前等待，避免崩溃雪崩
RestartSec=${RESTART_SEC}
# 统计窗口内最多自动重试次数，超过则放弃
StartLimitIntervalSec=${LIMIT_INTERVAL}
StartLimitBurst=${LIMIT_BURST}

[Install]
# 多用户模式下开机自启
WantedBy=multi-user.target
EOF

  # 重载 systemd 配置（新增/修改 unit 后必须执行）
  systemctl daemon-reload

  # 设置开机自启并立即启动
  systemctl enable "$SVC_NAME"
  systemctl restart "$SVC_NAME"   # restart 兼具首次 start 的语义

  # 输出当前状态
  echo ">> $SVC_NAME 状态："
  systemctl --no-pager status "$SVC_NAME" --lines=0 || true
  echo "------------------------------------------------------------"
done

# -----------------------------------------------------------------------------
# 4. 收尾提示
# -----------------------------------------------------------------------------
echo "完成。常用命令："
echo "  查看日志 : journalctl -u <服务名> -f"
echo "  重启服务 : sudo systemctl restart <服务名>"
echo "  停止服务 : sudo systemctl stop <服务名>"
echo "  清除失败计数(连续3次失败后): sudo systemctl reset-failed <服务名>"
echo ""
echo "本脚本部署的服务："
for entry in "${SERVICES[@]}"; do
  IFS='|' read -r SVC_NAME _ _ <<< "$entry"
  echo "  - $SVC_NAME"
done
