FROM nginx:alpine

# ==============================================================================
# 前端静态资源（dist）→ /var/www/frontend（必须与 default.conf.template 的 root 一致）
# ==============================================================================
COPY dist /var/www/frontend

# ★ 清掉 dist 里可能混入的部署文件：build.js 的 copyAssets() 会把 frontend/ 下除
#   node_modules/dist/target 之外的一切原样复制进 dist/。不清的话，上游地址模板与
#   部署规格（container.config.json）会随静态站点发到公网，任何人 GET 一下就能拿到
#   内部架构。2026-11-08 实测 dist/ 里确实有这堆文件。
RUN rm -rf /var/www/frontend/Dockerfile \
           /var/www/frontend/nginx \
           /var/www/frontend/docker-entrypoint.d \
           /var/www/frontend/container.config.json \
           /var/www/frontend/*.orig \
 && test -f /var/www/frontend/index.html \
 || (echo "ERROR: dist/index.html 不存在 —— dist 未构建或构建失败" >&2; exit 1)

# ==============================================================================
# Nginx 配置：★ 运行时渲染（不是构建期）
#
# 上游地址是「部署环境」信息，不是「镜像」信息 —— 所以不设 ARG、不烧进镜像，
# 由 00-resolver.sh 在容器启动时读环境变量渲染。好处：
#   · 换内网域名 / 换环境 = 控制台改环境变量 + 重启实例，同一个镜像可复用；
#   · 内网域名每次重新部署都可能变，烧进镜像必然过期（2026-11-08 那次 502 的成因）。
#
# 必须在云托管控制台「服务设置 → 环境变量」配置：
#   API_UPSTREAM  = http://api-xxxxxxxx.<region>.internal-run.tcloudbase.com:8081
#   MSG_UPSTREAM  = http://message-service-xxxxxxxx.<region>.internal-run.tcloudbase.com:8090
# （内网域名从「内网访问」处复制，必须带端口 8081/8090，且是 http；公网兜底则是 https 不带端口）
# 缺任何一个 → 容器启动即失败并打印中文原因，不会出现「Running 但接口全 502」。
# ==============================================================================

# 模板**故意不放** /etc/nginx/templates：官方 20-envsubst-on-templates.sh 会替换**所有**
# $VAR，把 nginx 自己的 $host / $remote_addr 清成空串（反代丢真实 IP、Host 变空）。
# 这里放 /opt/nginx，由我们自己的脚本用白名单渲染。
COPY default.conf.template /opt/nginx/default.conf.template

# 启动引导：渲染配置 → 生成 resolver → nginx -t 自检。文件名以 00 开头，
# 保证在官方 10-/20-/30- 脚本之前执行。
COPY resolver-entrypoint.sh /docker-entrypoint.d/00-resolver.sh

# ★ 归一 CRLF：本机 core.autocrlf=true，这个 .sh 一旦以 CRLF 检出，镜像里 shebang 会变成
#   "#!/bin/sh\r" → busybox 执行报 not found → 配置不渲染 → nginx 起不来或全站 502。
#   Git Bash 下 bash 能容忍 \r，容易造成"本地没事、容器里必炸"的假绿；这里强制归一，
#   并用 sh -n 在构建阶段做语法体检。
RUN sed -i 's/\r$//' /docker-entrypoint.d/00-resolver.sh \
 && chmod +x /docker-entrypoint.d/00-resolver.sh \
 && sh -n /docker-entrypoint.d/00-resolver.sh

# 删掉镜像自带的默认站点（listen 80 + root /usr/share/nginx/html）。
# 不删的话它会在我们脚本渲染前就占着 conf.d：脚本失败也能"起来"，但平台按 8080
# 探活拿不到东西 → 502，且症状与配置错几乎一样，白白多绕一圈。
RUN rm -f /etc/nginx/conf.d/default.conf

# 容器端口：必须与控制台 containerPort、模板 listen 三者一致（8080）
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
