# ==============================================================================
# 微信云托管 · classroom-service 服务 Dockerfile
# 在线教学独立服务，与 api 共享 JWT_SECRET / AES_KEY / HMAC_KEY（密钥域逐字符一致）
# server.port=8092（与 application.properties / container.config.json 三者一致）
#
# 注意：本目录是「本机构建 jar → 拷进来打包」的发布流程，因此这里不做多阶段构建。
# 从源码直接出镜像请用 api/classroom-service/Dockerfile。
# ==============================================================================

FROM eclipse-temurin:17-jre-jammy

# ---------- 时区 ----------
# 不设时区会让 LocalDateTime.now() 走 UTC，出勤/课时的边界判定整体偏 8 小时
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ---------- 非 root 运行 ----------
# 云托管默认以 root 起容器，一旦有 RCE 就等于交出整个容器。
# 这里显式降权；/app 下的 logs 与本地对象存储目录必须随之 chown，否则启动即写日志失败。
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

# ---------- 工作目录 ----------
WORKDIR /app

# ---------- 复制 jar ----------
# 构建命令（-Pprod 必带：顶掉 swagger profile，否则 springdoc/swagger-ui 会一起打进镜像）：
#   cd <项目根>/api/classroom-service
#   mvn clean package -DskipTests -Pprod
COPY target/classroom-service-1.0.0.jar app.jar

RUN mkdir -p /app/logs /app/data && chown -R app:app /app

USER app

# ---------- 端口 ----------
EXPOSE 8092

# ---------- JVM ----------
# 云托管的内存规格在控制台调整，用百分比而不是固定 -Xmx，改规格不必重建镜像。
# ExitOnOutOfMemoryError：OOM 后直接退出让云托管拉起新实例，
# 留着一个半死不活的进程继续接课堂流量比崩掉更难排查。
ENV JAVA_OPTS="-XX:InitialRAMPercentage=50 -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8"

# ---------- 入口 ----------
# 这里不加 HEALTHCHECK：云托管按 container.config.json 的 initialDelaySeconds 自行探活，
# 镜像内再探一次既重复又需要额外安装 curl（jammy 的 jre 镜像默认没有）。
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar --spring.profiles.active=cloud"]
