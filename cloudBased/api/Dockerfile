# ==============================================================================
# 微信云托管 · api 服务 Dockerfile（等保 P2-1：非 root 用户运行）
# 基础镜像：Java 17 JRE（不含 JDK，体积更小、攻击面更小）
# 时区：Asia/Shanghai
# 运行用户：appuser（UID/GID 999，系统账号，最小权限）
# ==============================================================================

FROM eclipse-temurin:17-jre-jammy

# ---------- 时区 ----------
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ---------- 【新增 P2-1】创建非 root 运行用户 ----------
# groupadd/useradd 用 -r 创建系统账号；/usr/sbin/nologin 禁用 shell
RUN groupadd -r appuser \
 && useradd -r -g appuser -d /app -s /usr/sbin/nologin appuser

# ---------- 工作目录 ----------
WORKDIR /app

# ---------- 复制 jar 并赋权给 appuser ----------
COPY --chown=appuser:appuser target/booking-api-2.2.0.jar app.jar

# ---------- 切换到非 root 用户 ----------
USER appuser

EXPOSE 8081

# ---------- 健康检查 ----------
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:8081/actuator/health || exit 1

# ---------- 入口 ----------
ENTRYPOINT ["java","-jar","app.jar","--spring.profiles.active=cloud"]
