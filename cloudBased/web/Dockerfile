# ==============================================================================
# 微信云托管 · web 前端服务（方式 B：Nginx 容器）
# 手册 8.1 推荐方式：自建 web 服务反向代理，与现有 nginx 反代思路一致
#
# 构建前准备：
#   1. 本地构建前端：cd <项目根>/frontend && node build.js
#   2. 构建产物在 <项目根>/frontend/dist/
#   3. 把 dist/ 整个目录拷贝到 cloudBased/web/dist/（或修改下方 COPY 源路径）
#
# ★ 2026-10-25 修订：后端已拆成两个独立云托管实例，需传两个上游
#   docker build \
#     --build-arg API_UPSTREAM=http://api.<envid>.svc.cluster.local:8081 \
#     --build-arg MSG_UPSTREAM=http://message-service.<envid>.svc.cluster.local:8090 \
#     -t booking-web:latest .
#   不给参数会**在构建阶段直接失败**（下面有非空校验），不会产出一个 proxy_pass 为空的坏镜像。
# ==============================================================================

FROM nginx:1.27-alpine

# ---------- 时区 ----------
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# ---------- 默认首页 ----------
COPY dist/ /usr/share/nginx/html/

# ---------- Nginx 配置（双上游反代）----------
# 占位符 ${API_UPSTREAM} / ${MSG_UPSTREAM} 在构建时替换：
#   - 云托管 api 服务的**内网地址**（推荐，免公网流量费、更安全、XFF 可被后端采信）：
#       http://api.<envid>.svc.cluster.local:8081
#       http://message-service.<envid>.svc.cluster.local:8090
#   - 或公网域名：https://api-<envid>.sh.run.tcloudbase.com
#                 https://message-service-<envid>.sh.run.tcloudbase.com
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# ARG 必须在 envsubst 之前声明：`docker build --build-arg X=...` 只对声明过的 ARG 生效，
# 没声明的话参数被静默忽略 → envsubst 拿到空串 → proxy_pass 变成空 → 镜像能构建但全部 502。
ARG API_UPSTREAM=
ARG MSG_UPSTREAM=
ENV API_UPSTREAM=${API_UPSTREAM} \
    MSG_UPSTREAM=${MSG_UPSTREAM}

# 兜底去掉尾斜杠：proxy_pass 带尾斜杠会变成"替换前缀"，把 /api/v1/ 吃掉 → 后端全 404
RUN set -e; \
    API_UPSTREAM="${API_UPSTREAM%/}"; \
    MSG_UPSTREAM="${MSG_UPSTREAM%/}"; \
    if [ -z "$API_UPSTREAM" ]; then \
      echo 'ERROR: 缺少构建参数 API_UPSTREAM（例：http://api.<envid>.svc.cluster.local:8081）' >&2; exit 1; fi; \
    if [ -z "$MSG_UPSTREAM" ]; then \
      echo 'ERROR: 缺少构建参数 MSG_UPSTREAM（例：http://message-service.<envid>.svc.cluster.local:8090）' >&2; exit 1; fi; \
    case "$API_UPSTREAM" in *message*) echo "ERROR: API_UPSTREAM 指向了消息服务：$API_UPSTREAM" >&2; exit 1;; esac; \
    case "$MSG_UPSTREAM" in *message-service*) ;; *) echo "WARN: MSG_UPSTREAM 看起来不像消息服务：$MSG_UPSTREAM" >&2;; esac; \
    echo "  API_UPSTREAM=$API_UPSTREAM"; \
    echo "  MSG_UPSTREAM=$MSG_UPSTREAM"; \
    envsubst '$API_UPSTREAM $MSG_UPSTREAM' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf; \
    rm /etc/nginx/conf.d/default.conf.template; \
    grep -nE 'proxy_pass' /etc/nginx/conf.d/default.conf

# 注意：这里**不做** nginx -t。
#   内网地址 api.<envid>.svc.cluster.local 只有在集群内才解析得到，构建机解析不了，
#   nginx -t 会报 "host not found in upstream" 把构建搞挂（不是配置写错）。
#   容器启动时 nginx 若配置有语法错会直接退出，云托管日志里能看到，排查成本很低。

EXPOSE 80

# nginx 前台运行，让容器保持活
CMD ["nginx", "-g", "daemon off;"]
