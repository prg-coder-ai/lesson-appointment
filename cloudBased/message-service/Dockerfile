# ==============================================================================
# 微信云托管 · message-service 服务 Dockerfile（等保 P2-1：非 root 用户运行）
# 消息中心独立服务，与 api 共享 JWT_SECRET / AES_KEY / HMAC_KEY（密钥域逐字符一致）
# server.port=8090（与 application.properties 一致）
# ==============================================================================

FROM eclipse-temurin:17-jre-jammy

# ---------- 时区（与 api 服务、MySQL 三者统一 Asia/Shanghai） ----------
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ---------- 【新增 P2-1】创建非 root 运行用户 ----------
RUN groupadd -r appuser \
 && useradd -r -g appuser -d /app -s /usr/sbin/nologin appuser

# ---------- 工作目录 ----------
WORKDIR /app

# ---------- 复制 jar ----------
COPY --chown=appuser:appuser target/message-service-1.1.0.jar app.jar

# ---------- 切换到非 root 用户 ----------
USER appuser

EXPOSE 8090

# ---------- 入口 ----------
ENTRYPOINT ["java","-jar","app.jar","--spring.profiles.active=cloud"]
