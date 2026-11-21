# syntax=docker/dockerfile:1.6
# ==============================================================================
# 前端静态站点镜像（nginx）—— 自建云服务器（CVM / ECS）用
#
# 与 cloudBased/frontend/Dockerfile（微信云托管用）的区别，别看错文件：
#
#   云托管版            本文件（自建 CVM）
#   ------------------  ------------------------------------------------------
#   listen 8080          listen 8080（同样只监听回环/内网，80/443 留给宿主机 nginx）
#   上游是跨主机的      上游是同机 127.0.0.1（后端也在本机，host 网络可达）
#   内网域名 → 必须     127.0.0.1 静态可得 → proxy_pass 用**字面量**渲染，
#     resolver + 变量    不需要 resolver，也不会踩「变量形式导致 Host 变成 IP」
#
# 构建上下文 = deploy/docker/frontend/，里面必须有一个 dist/ 子目录（见 build.sh）。
# ==============================================================================
FROM nginx:1.27-alpine

# 版本标识：只用于日志与 /healthz 回显，不参与配置
ARG BUILD_VERSION=dev

# ------------------------------------------------------------------------------
# 1) 静态资源
# ------------------------------------------------------------------------------
COPY dist /var/www/frontend

# ⚠ 这一段是「防事故」不是「讲卫生」：
#   frontend/build.js 的 copyAssets() 用**黑名单**挡非站点文件，一旦名单与目录
#   不同步（改过大小写、新增了部署资产），部署文件就会随静态站点发到公网 ——
#   任何人 GET 一下 /Dockerfile、/container.config.json 就能看到内部架构。
#   镜像层再兜一次底：清完还要断言两个入口页都在，否则是个空站点（nginx 回 403，
#   看着像权限问题，实际是 dist 没构建或构建失败）。
RUN set -eux; \
    cd /var/www/frontend; \
    rm -rf Dockerfile nginx docker-entrypoint.d container.config.json .dockerignore; \
    find . -name '*.orig' -delete; \
    find . -name '.DS_Store' -delete; \
    find . -maxdepth 1 -iname 'readme.md' -delete; \
    test -f index.html; \
    test -f login.html; \
    test -f build-info.json; \
    echo "dist 入口页校验通过"

# ------------------------------------------------------------------------------
# 2) nginx 配置模板（运行时渲染，不烧死上游地址）
#
# 上游地址是「部署环境」信息，不是「镜像」信息：同一镜像既要在测试机跑
# 127.0.0.1:8081，也可能在另一台机器跑 127.0.0.1:9081。渲染放在**容器启动时**，
# 换端口只改 docker-compose 的 environment 并重启容器，不重建镜像。
#
# 模板故意不放 /etc/nginx/templates：官方 20-envsubst-on-templates.sh 会替换
# **所有** $VAR，把 nginx 自己的 $host / $remote_addr 清成空串（反代丢真实 IP、
# Host 变空），而且它替换完不做 nginx -t 就起服务。放 /opt/nginx 由自己的
# entrypoint 用白名单 envsubst，控制得住。
# ------------------------------------------------------------------------------
COPY nginx/default.conf.template /opt/nginx/default.conf.template

# 反代公共头（容器版，X-Forwarded-Proto 与宿主机版不同，见文件内注释）
COPY nginx/proxy_params /opt/nginx/proxy_params

# 跨层协议透传 map：必须落在 http{} 上下文，所以放 conf.d（而不是 server 块里）
COPY nginx/00-proxy-map.conf /etc/nginx/conf.d/00-proxy-map.conf

# ------------------------------------------------------------------------------
# 3) 启动引导（在 nginx 官方 entrypoint 启动 nginx 之前执行）
# ------------------------------------------------------------------------------
COPY entrypoint/00-preflight.sh /docker-entrypoint.d/00-preflight.sh

# CRLF 归一 + 语法体检：
#   本机 core.autocrlf=true，这两个文件一旦以 CRLF 检出，镜像里 shebang 会变成
#   "#!/bin/sh\r" → busybox 报 not found → 配置不渲染 → nginx 起不来或全站 502。
#   Git Bash 下 bash 能容忍 \r，所以「本地没事、容器里必炸」很容易漏过。
#   sh -n 在构建期做语法体检，把错误挡在镜像外。
RUN set -eux; \
    sed -i 's/\r$//' /docker-entrypoint.d/00-preflight.sh \
                     /opt/nginx/default.conf.template \
                     /opt/nginx/proxy_params \
                     /etc/nginx/conf.d/00-proxy-map.conf; \
    chmod +x /docker-entrypoint.d/00-preflight.sh; \
    sh -n /docker-entrypoint.d/00-preflight.sh

# 删掉两个官方引导脚本：
#   10-listen-on-ipv6-by-default.sh  会试图改 default.conf 的 listen，我们的配置
#     没有 [::]:80，它每次都 WARN 一句「already modified」，日志里天天有噪音；
#   20-envsubst-on-templates.sh      见上文，它是全量替换，会毁掉 nginx 变量。
# 保留 30-tune-worker-processes.sh（worker 数自适应，无害且有用）。
RUN rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
          /docker-entrypoint.d/20-envsubst-on-templates.sh

# 镜像自带默认站点会监听 80 并 root /usr/share/nginx/html。我们的配置渲染失败时
# 它能让容器「看起来起来了」，但探活拿到的是 nginx 欢迎页 → 排障方向全错。
# 这里先删；00-preflight.sh 渲染成功后才写出我们的 default.conf。
RUN rm -f /etc/nginx/conf.d/default.conf

# 构建期自检：模板必须存在且含三个占位符（少一个说明 COPY 错了或模板被改坏）
RUN set -eux; \
    grep -qF '${BOOKING_UPSTREAM}' /opt/nginx/default.conf.template; \
    grep -qF '${MSG_UPSTREAM}' /opt/nginx/default.conf.template; \
    grep -qF '${CLASSROOM_UPSTREAM}' /opt/nginx/default.conf.template

# 健康检查只打本容器的 /healthz（不依赖上游）。上游宕机时容器不该被判死重启 ——
# 那是后端的病，前端重启治不好，还会把静态站点一起弄没。
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

# 容器内端口：必须与 nginx 模板的 listen、以及宿主机反代的 proxy_pass 三者一致
EXPOSE 8080

LABEL org.opencontainers.image.title="lesson-frontend" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.description="预约系统前端静态站点（nginx + 三上游反代）"

CMD ["nginx", "-g", "daemon off;"]
