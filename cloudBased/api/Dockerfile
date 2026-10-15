# ==============================================================================
# 微信云托管 · api 服务 Dockerfile
# 基础镜像：Java 17（与 pom.xml 的 java.version 对齐，手册原写 Java 21 为通用示例）
# 时区：Asia/Shanghai — 防 8 小时错位（手册 4.2 节时区坑）
# 入口：--spring.profiles.active=cloud — 加载 application-cloud.properties 覆盖本地默认
# ==============================================================================

FROM eclipse-temurin:17-jre-jammy

# ---------- 时区（手册 4.2 节强制统一） ----------
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ---------- 工作目录 ----------
WORKDIR /app

# ---------- 复制 jar ----------
# 构建命令（本地执行，最稳）：
#   cd <项目根>/api
#   mvn clean package -DskipTests
# 然后从 api/target/ 复制出 booking-api-2.2.0.jar
COPY target/booking-api-2.2.0.jar app.jar

# ---------- 端口（手册 5.1 节致命细节：必须与 server.port 一致） ----------
EXPOSE 8081

# ---------- 入口 ----------
# 云托管环境变量注入由控制台处理（容器启动时注入，详见 cloudBased/env/.env.api.example）
ENTRYPOINT ["java","-jar","app.jar","--spring.profiles.active=cloud"]
