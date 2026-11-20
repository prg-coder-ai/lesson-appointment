#!/usr/bin/env bash
# ==============================================================================
# 在云服务器上安装 Docker CE + compose v2（Ubuntu/Debian 与 RHEL 系双路径）
#
# 用法（root 或有 sudo 的账号执行）：
#   sudo bash install-docker.sh
#   sudo DATA_ROOT=/data/docker bash install-docker.sh   # 系统盘小、数据盘挂 /data 时
#
# 设计要点（都是踩过的坑，不是风格偏好）：
#   1. 装**官方 docker-ce**，不装发行版自带的 docker.io。
#      Ubuntu 的 docker.io 没有 compose v2 插件、版本常年落后，`docker compose` 直接不存在；
#      而本项目所有脚本都用 compose v2 语法（v1 的 docker-compose 已 EOL）。
#   2. 先卸掉 docker.io / docker-compose / containerd 这些冲突包。
#      不卸的话 apt 会报 "docker-ce : Conflicts: docker.io"，而报错信息不足以让人想到要卸。
#   3. daemon.json 必配 log-opts 上限。默认 json-file 无上限，容器 stdout 能写到磁盘满，
#      表现是全站挂掉但每个服务都"在跑"。
#   4. live-restore 打开：升级 docker 本体时容器不被一起停（否则升级=停机）。
#   5. 不用 curl | bash 装（等保不允许）。apt 源密钥走官方 GPG。
# ==============================================================================
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "请用 root 执行：sudo bash $0" >&2; exit 1; }

DATA_ROOT="${DATA_ROOT:-/var/lib/docker}"
MIRROR_REGION="${MIRROR_REGION:-tencent}"   # tencent | aliyun | official

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m   ⚠ %s\033[0m\n' "$*"; }

# ------------------------------------------------------------------ 发行版识别
. /etc/os-release
ID_LIKE_RAW="${ID_LIKE:-} ${ID:-}"
case "$ID_LIKE_RAW" in
  *debian*|*ubuntu*) FAMILY=debian ;;
  *rhel*|*centos*|*fedora*|*anolis*|*rocky*|*almalinux*|*openEuler*|*kylin*) FAMILY=rhel ;;
  *)
    echo "无法识别的发行版：ID=$ID ID_LIKE=${ID_LIKE:-}" >&2
    echo "请按官方文档手工安装：https://docs.docker.com/engine/install/" >&2
    exit 1
    ;;
esac
say "发行版：$PRETTY_NAME（$FAMILY 系）"

# ------------------------------------------------------------------ 卸载冲突包
say "卸载可能冲突的旧包（docker.io / docker-compose / 旧 containerd）"
if [ "$FAMILY" = debian ]; then
  for p in docker docker-engine docker.io containerd runc docker-compose docker-compose-v2 podman-docker; do
    dpkg -l "$p" 2>/dev/null | grep -q "^ii" && apt-get remove -y "$p" || true
  done
else
  for p in docker docker-client docker-client-latest docker-common docker-latest \
           docker-latest-logrotate docker-logrotate docker-engine docker.io podman-docker; do
    rpm -q "$p" >/dev/null 2>&1 && dnf remove -y "$p" || true
  done
fi

# ------------------------------------------------------------------ 配置软件源
say "配置 Docker CE 软件源（镜像：$MIRROR_REGION）"
case "$MIRROR_REGION" in
  tencent)  BASE="https://mirrors.cloud.tencent.com/docker-ce" ;;
  aliyun)   BASE="https://mirrors.aliyun.com/docker-ce" ;;
  official) BASE="https://download.docker.com" ;;
  *) echo "MIRROR_REGION 只支持 tencent|aliyun|official" >&2; exit 1 ;;
esac

if [ "$FAMILY" = debian ]; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -s /etc/apt/keyrings/docker.asc ]; then
    # 密钥也要走镜像，否则国内 download.docker.com 这一步常年超时
    curl -fsSL "$BASE/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc \
      || curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  ARCH="$(dpkg --print-architecture)"
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] $BASE/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  PKGS="docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
  apt-get install -y --no-install-recommends $PKGS
else
  # RHEL 系：容器 ID 用 centos 目录（官方兼容路径），Anolis/Rocky/openEuler 都适用
  dnf install -y dnf-plugins-core ca-certificates curl
  dnf config-manager --add-repo "$BASE/linux/centos/docker-ce.repo" 2>/dev/null \
    || (curl -fsSL "$BASE/linux/centos/docker-ce.repo" -o /etc/yum.repos.d/docker-ce.repo)
  # ★ 必须 --nobest 或显式排除：某些 Anolis/Rocky 版本会把 containerd.io 判成
  #   "只装了旧版本"，导致 install 直接失败并给出看不懂的依赖树。
  dnf install -y --allowerasing docker-ce docker-ce-cli containerd.io \
                  docker-buildx-plugin docker-compose-plugin || \
  dnf install -y --nobest --allowerasing docker-ce docker-ce-cli containerd.io \
                  docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# ------------------------------------------------------------------ daemon.json
say "写 /etc/docker/daemon.json（data-root=$DATA_ROOT）"
mkdir -p /etc/docker "$DATA_ROOT"
if [ -f /etc/docker/daemon.json ] && [ ! -f /etc/docker/daemon.json.lesson-bak ]; then
  cp -a /etc/docker/daemon.json /etc/docker/daemon.json.lesson-bak
  warn "已备份原 daemon.json → daemon.json.lesson-bak"
fi

# registry-mirrors 留给需要拉公共镜像的人；只用私有/自建镜像时可以整段删掉。
# 注意：公共加速器地址变动频繁、且多数已停止对个人开放，失效时**不会报错**，
# 只会让 docker pull 变慢或超时 —— 所以这里默认不写死，需要时手工加。
cat > /etc/docker/daemon.json <<EOF
{
  "data-root": "$DATA_ROOT",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  },
  "live-restore": true,
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 }
  }
}
EOF

# ------------------------------------------------------------------ 启动
say "启动 docker 并校验"
if [ "$FAMILY" = debian ]; then
  systemctl enable --now docker
fi
systemctl restart docker
sleep 2
docker version --format '   client {{.Client.Version}} / server {{.Server.Version}}'
docker compose version | sed 's/^/   /'

# ------------------------------------------------------------------ 自检
say "自检"
docker info --format '   data-root: {{.DockerRootDir}}
   logging:   {{.LoggingDriver}}
   cgroup:    {{.CgroupDriver}}/{{.CgroupVersion}}' || true

echo
echo "完成。接下来："
echo "  1) 创建部署账号并加入 docker 组（等效 root，注意等保口径）："
echo "       sudo useradd -r -m -s /bin/bash lesson   # 已有则跳过"
echo "       sudo usermod -aG docker lesson"
echo "     ⚠ 加入 docker 组 = 可挂载宿主根目录 = 等效 root。等保场景建议不给普通账号，"
echo "       只用 sudo 白名单跑固定脚本（见 README 第三节末尾）。"
echo "  2) 建目录并授权（容器以 lesson uid 运行，必须可写）："
echo "       sudo mkdir -p /var/log/lesson/{api,message,classroom} \\"
echo "                     /opt/lesson/data/{oss,redis,teacher-uploads} \\"
echo "                     /opt/lesson/docker /var/www/releases"
echo "       sudo chown -R lesson:lesson /var/log/lesson /opt/lesson/data /var/www/releases"
echo "  3) 放编排文件并首次启动：见 deploy/docker/README.md 第四节"
