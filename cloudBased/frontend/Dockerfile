FROM nginx:alpine

# 前端静态资源（dist）复制到 /var/www/frontend
COPY dist /var/www/frontend

COPY default.conf.template /etc/nginx/templates/default.conf.template

# 启动时生成 resolver 配置（从 /etc/resolv.conf 提取 DNS），
# 供 proxy_pass 变量在运行时解析上游域名。
# 文件名以 00 开头，保证在官方 20-envsubst 等脚本之前执行。
COPY resolver-entrypoint.sh /docker-entrypoint.d/00-resolver.sh
RUN chmod +x /docker-entrypoint.d/00-resolver.sh

# 双上游地址（模板占位符）在构建阶段用 envsubst 渲染成最终配置。
# ⚠ 不要依赖运行时环境变量：CloudBase 云托管运行时不参与官方镜像的
#   模板渲染，会渲染出字面量 ${...} 导致 nginx emerg。
# 上游写成 nginx 变量 + resolver，域名解析推迟到运行时按请求进行，
# 构建时 nginx -t 不会解析域名，后端暂不可达时也只是 502 而非 crash-loop。
# ⚠ 默认值按实际 CloudBase 环境填写：
#   内网（推荐）：http://<服务名>.<环境ID>.svc.cluster.local:<端口>
#   公网兜底：  https://api-329614-8-1475810246.sh.run.tcloudbase.com
#              https://message-service-329614-8-1475810246.sh.run.tcloudbase.com
ARG API_UPSTREAM=http://api.329614-8-1475810246.svc.cluster.local:8081
ARG MSG_UPSTREAM=http://message-service.329614-8-1475810246.svc.cluster.local:8090
RUN API_UPSTREAM="${API_UPSTREAM}" MSG_UPSTREAM="${MSG_UPSTREAM}" \
    envsubst '$API_UPSTREAM $MSG_UPSTREAM' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf \
    && rm /etc/nginx/templates/default.conf.template

# 构建时校验渲染后的配置（变量形式不会触发 DNS 解析，可安全执行）
RUN nginx -t

# 模板中 server 监听 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
