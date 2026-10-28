# ==============================================================================
# 微信云托管 · web 前端服务（方式 B：Nginx 容器）
# 手册 8.1 推荐方式：自建 web 服务反向代理，与现有 nginx 反代思路一致
#
# 构建前准备：
#   1. 本地构建前端：cd <项目根>/frontend && node build.js
#   2. 构建产物在 <项目根>/frontend/dist/
#   3. 把 dist/ 整个目录拷贝到 cloudBased/web/dist/（或修改下方 COPY 源路径）
# ==============================================================================

FROM nginx:1.27-alpine

# ---------- 构建参数（供 envsubst 替换 nginx 模板） ----------
# 声明 ARG 后，docker build --build-arg 才能注入到下面的 RUN envsubst。
ARG API_UPSTREAM=http://REPLACE_WITH_API_INTERNAL_HOST:8081
ARG CLASSROOM_UPSTREAM=http://REPLACE_WITH_CLASSROOM_INTERNAL_HOST:8092

# ---------- 时区 ----------
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# ---------- 默认首页 ----------
COPY dist/ /usr/share/nginx/html/

# ---------- Nginx 配置（反代 /api 到 api 云托管服务，/api/v1/classrooms 与 /ws/classrooms 到 classroom 服务） ----------
# 占位符 ${API_UPSTREAM} / ${CLASSROOM_UPSTREAM} 需在部署前替换为：
#   - 云托管 api 服务的**内网地址**（推荐，免公网流量费、更安全）：
#     内网地址格式：http://api.<envid>.svc.cluster.local:8081
#   - classroom 服务内网地址：http://classroom.<envid>.svc.cluster.local:8092
#   - 或公网地址：https://<api服务>-<envid>.sh.run.tcloudbase.com
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
RUN envsubst '$API_UPSTREAM $CLASSROOM_UPSTREAM' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && \
    rm /etc/nginx/conf.d/default.conf.template

EXPOSE 80

# nginx 前台运行，让容器保持活
CMD ["nginx", "-g", "daemon off;"]
