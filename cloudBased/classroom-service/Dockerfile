# ==============================================================================
# 微信云托管 · classroom-service 服务 Dockerfile
# 在线教学独立服务，与 api 共享 JWT_SECRET / AES_KEY / HMAC_KEY（密钥域逐字符一致）
# server.port=8092（与 application.properties 一致）
# ==============================================================================

FROM eclipse-temurin:17-jre-jammy

# ---------- 时区 ----------
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ---------- 工作目录 ----------
WORKDIR /app

# ---------- 复制 jar ----------
# 构建命令：
#   cd <项目根>/api/classroom-service
#   mvn clean package -DskipTests
COPY target/classroom-service-1.0.0.jar app.jar

# ---------- 端口 ----------
EXPOSE 8092

# ---------- 入口 ----------
ENTRYPOINT ["java","-jar","app.jar","--spring.profiles.active=cloud"]