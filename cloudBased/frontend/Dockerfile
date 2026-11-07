FROM nginx:alpine

# 前端静态资源（dist）复制到 /var/www/frontend
COPY dist /var/www/frontend

# nginx 配置模板：容器启动时官方镜像会自动对 /etc/nginx/templates/*.template
# 执行 envsubst，替换其中定义过的环境变量后输出到 /etc/nginx/conf.d/default.conf
COPY default.conf.template /etc/nginx/templates/default.conf.template

# 双上游地址（模板占位符），构建时可用 --build-arg 覆盖，运行时可用 -e 覆盖
# 推荐：内网地址（K8s / 云托管内网），也可改为公网域名
ARG API_UPSTREAM=http://booking-api:8081
ARG MSG_UPSTREAM=http://message-service:8090
ENV API_UPSTREAM=$API_UPSTREAM \
    MSG_UPSTREAM=$MSG_UPSTREAM

# 模板中 server 监听 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
