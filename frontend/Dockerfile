# ==============================================================================
# 微信云托管 · frontend 服务（多阶段：Node 构建 → Nginx 运行）
#
# ★ 构建上下文 = **仓库根**（lesson-appointment_saas/），不是 frontend/。
#   原因：build.js 并不自包含，它要读三个兄弟目录：
#     shared/       —— 共享领域层（gen-shared-bridge.js 把 shared/domain/*.js 转译成
#                      frontend/js/shared-domain-bridge.js，缺了它构建直接 ENOENT）
#     tools/        —— check-miniprogram-shared-sync.js（术语镜像一致性守卫，失败即 ABORT）
#     miniprogram/  —— 上面那个守卫要比对的镜像副本
#   云托管参数：dockerfilePath = frontend/Dockerfile，buildDir 留空（= 仓库根）。
#   上下文裁剪见仓库根 .dockerignore。
#
# 与 deploy/nginx/cloudbase-web/Dockerfile 的分工：
#   那份是「先本地 node build.js，再把现成 dist/ 拷进 nginx」，构建机必须装 node；
#   本文件把构建也放进镜像，流水线只上传源码，产出可复现、不依赖本地环境。
#
# ★ 上游地址在**运行时**注入，不烧进镜像：
#     API_UPSTREAM = http://api.<envid>.svc.cluster.local:8081
#     MSG_UPSTREAM = http://message-service.<envid>.svc.cluster.local:8090
#   在云托管控制台「服务设置 → 环境变量」里配。缺任何一个，容器会在启动阶段
#   直接退出并打印中文报错，不会出现「Running 但全站 502」的半死状态。
# ==============================================================================

# ------------------------------------------------------------------------------
# 阶段 1：构建 dist
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

# 国内构建机直连 registry.npmjs.org 经常超时，默认走镜像源；要改官方源在这里覆盖。
ARG NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /build

# 四个目录保持与仓库相同的相对层级 —— build.js 里大量 path.resolve(ROOT, '..', 'shared')
# 这类跨目录引用，层级错一格就全崩。
COPY frontend/ /build/frontend/
COPY shared/ /build/shared/
COPY tools/ /build/tools/
COPY miniprogram/ /build/miniprogram/

WORKDIR /build/frontend

RUN npm install --registry="$NPM_REGISTRY" --no-audit --no-fund

# 先把「构建辅助文件」清掉再跑 build.js：
#   build.js 的 copyAssets() 会把 frontend/ 下除 node_modules/dist/target 之外的一切
#   原样复制进 dist/。不清的话，Dockerfile、nginx/、container.config.json 会被一起打进
#   静态站点 —— 等于把内部上游地址模板和部署规格公开发到公网。
RUN rm -rf ./nginx ./docker-entrypoint.d ./Dockerfile ./container.config.json

# SKIP_DEPLOY_COPY=1 是硬要求，不是优化项：
#   build.js 末尾会 require('../deploy/collect-artifacts.js') 把 dist 镜像到 deploy/dist，
#   构建上下文里没有 deploy/ → 走 catch 分支 → process.exitCode = 1 → 本层 RUN 直接失败。
ENV SKIP_DEPLOY_COPY=1

RUN node build.js \
 && test -f dist/index.html \
 && test -d dist/js \
 && test ! -d dist/nginx \
 && echo "[build] dist 就绪：$(du -sh dist | cut -f1)"

# ------------------------------------------------------------------------------
# 阶段 2：运行
# ------------------------------------------------------------------------------
# 用 unprivileged 变体而不是 nginx:alpine：
#   容器内以非 root（uid 101）运行、监听 8080 这类非特权端口，与 api 服务
#   「appuser 非 root 运行」的等保 P2-1 基线一致。代价是端口从 80 变 8080，
#   container.config.json 的 containerPort 必须同步为 8080。
#   若必须监听 80，换回 nginx:1.27-alpine 并把 nginx/default.conf.template 的
#   listen 改回 80 —— 但那样 master 进程就是 root 了。
FROM nginxinc/nginx-unprivileged:1.27-alpine

# 装 tzdata、改目录属主需要 root，做完立刻切回 nginx
USER root

ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo $TZ > /etc/timezone

COPY --from=builder /build/frontend/dist/ /usr/share/nginx/html/

# 配置模板刻意不放 /etc/nginx/templates：官方 20-envsubst-on-templates.sh 会替换**所有**
# $VAR，把 nginx 自己的 $host / $remote_addr / $proxy_add_x_forwarded_for 也清成空串，
# 反代会丢真实 IP、Host 变空，排查成本极高。详见 40-render-nginx-conf.sh 头部注释。
COPY frontend/nginx/default.conf.template /opt/nginx/default.conf.template
COPY frontend/docker-entrypoint.d/40-render-nginx-conf.sh /docker-entrypoint.d/40-render-nginx-conf.sh

RUN chmod 755 /docker-entrypoint.d/40-render-nginx-conf.sh \
 && rm -f /etc/nginx/conf.d/default.conf \
 && chown -R nginx:nginx /usr/share/nginx/html /opt/nginx /etc/nginx/conf.d

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
