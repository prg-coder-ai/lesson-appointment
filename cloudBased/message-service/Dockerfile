# ==============================================================================
# 微信云托管 · message-service 服务 Dockerfile
# 消息中心独立服务，与 api 共享 JWT_SECRET / AES_KEY / HMAC_KEY（密钥域逐字符一致）
# server.port=8090（与 application.properties 一致）
# ==============================================================================

FROM eclipse-temurin:17-jre-jammy

# ---------- 时区（与 api 服务、MySQL 三者统一 Asia/Shanghai） ----------
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ---------- 工作目录 ----------
WORKDIR /app

# ---------- 复制 jar ----------
# 构建命令（-Pprod 必带：顶掉 swagger profile，否则 springdoc/swagger-ui 会一起打进镜像）：
#   cd <项目根>/api/message-service
#   mvn clean package -DskipTests -Pprod
COPY target/message-service-1.1.0.jar app.jar

# ---------- 端口（必须与 server.port=8090 一致） ----------
EXPOSE 8090

# ---------- 入口 ----------
ENTRYPOINT ["java","-jar","app.jar","--spring.profiles.active=cloud"]
