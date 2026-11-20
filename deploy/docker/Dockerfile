# syntax=docker/dockerfile:1
# ==============================================================================
# lesson 三服务通用运行镜像（booking 8081 / message 8090 / classroom 8092）
#
# 一个 Dockerfile 服务三个后端：三者运行时需求完全一致（Java 17 + JRE + curl +
# ca-certificates + Asia/Shanghai），差异只有 jar 与端口，用 build-arg 区分即可。
# 不复制三份，是为了让「时区 / 非 root / 信任库 / JVM 参数」这类跨服务约定只有一处。
#
# ★ 构建上下文必须是 deploy/jars（不要用仓库根）
#   仓库根有 node_modules / target / frontend/dist / .git，context 会到 GB 级，
#   每次构建都要打包发给 daemon。deploy/jars 里只有三个 jar，138MB 封顶。
#   构建命令见 deploy/docker/build-images.sh，手工等价于：
#     docker build -f deploy/docker/Dockerfile \
#       --build-arg JAR_FILE=booking-api-2.2.0.jar \
#       --build-arg SERVICE_PORT=8081 \
#       -t lesson/booking-api:2.2.0-abc1234 \
#       deploy/jars
#
# ★ 为什么保留信任库阶段（不是所有服务都要调外网 TLS）
#   booking 要调 api.weixin.qq.com，JDK 自带的 cacerts 在容器里验证不过微信的证书链
#   （根为 DigiCert Global Root G2），2026-11-10 在云托管上真实踩过 PKIX 失败。
#   三个服务共用一份镜像，就统一带上；多出来的成本只是镜像里 150KB 的 jks。
# ==============================================================================

# ------------------------------------------------------------------------------
# 阶段 1：合成信任库（JDK cacerts + 系统 CA）
#
# ⚠ 不能直接在运行镜像里 keytool 导入：eclipse-temurin:17-**jre** 不含 keytool，
#   那是 JDK 的工具。所以必须先起一个 JDK 阶段，把产物 COPY 到运行阶段。
# ------------------------------------------------------------------------------
FROM eclipse-temurin:17-jdk-jammy AS truststore

ENV DEBIAN_FRONTEND=noninteractive

# 国内直连 archive.ubuntu.com 常年龟速；传 --build-arg APT_MIRROR=（空值）可跳过替换。
ARG APT_MIRROR=http://mirrors.cloud.tencent.com/ubuntu

RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://archive.ubuntu.com/ubuntu|$APT_MIRROR|g; \
              s|http://security.ubuntu.com/ubuntu|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates openssl; \
    update-ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# 以 JDK 自带 cacerts 为基底（含部分系统库没有的商业根），再叠加系统 CA。
# alias 用证书 SHA-256 指纹：/etc/ssl/certs 下同一个根有多个符号链接别名，
# 用文件名当 alias 会重复导入并互相覆盖，用指纹天然去重。
RUN set -eux; \
    cp "$JAVA_HOME/lib/security/cacerts" /opt/cacerts.jks; \
    added=0; \
    for f in /etc/ssl/certs/*.pem; do \
      [ -e "$f" ] || continue; \
      fp="$(openssl x509 -in "$f" -noout -fingerprint -sha256 2>/dev/null \
            | sed 's/.*=//' | tr -d ':' || true)"; \
      [ -n "$fp" ] || continue; \
      if keytool -importcert -noprompt -alias "sys-$fp" -file "$f" \
           -keystore /opt/cacerts.jks -storepass changeit >/dev/null 2>&1; then \
        added=$((added + 1)); \
      fi; \
    done; \
    after="$(keytool -list -keystore /opt/cacerts.jks -storepass changeit 2>/dev/null \
             | grep -c trustedCertEntry || true)"; \
    echo "[truststore] 本次导入 $added 张，最终 $after 张"; \
    test "$after" -ge 50; \
    chmod 644 /opt/cacerts.jks

# ------------------------------------------------------------------------------
# 阶段 2：运行
# ------------------------------------------------------------------------------
FROM eclipse-temurin:17-jre-jammy

# jar 文件名与端口由 build-arg 决定；不设默认值 —— 漏传时构建直接失败，
# 好过悄悄产出一个「端口/包都不对」的镜像被推到线上。
ARG JAR_FILE
ARG SERVICE_PORT
ARG APT_MIRROR=http://mirrors.cloud.tencent.com/ubuntu

# 不设时区会让 LocalDateTime.now() 走 UTC，出勤/课时/预约时段的边界判定整体偏 8 小时。
ENV TZ=Asia/Shanghai
ENV DEBIAN_FRONTEND=noninteractive

# curl 两个用途：容器健康检查探 actuator，以及容器内排查 TLS（这个项目 TLS 出过问题）。
RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://archive.ubuntu.com/ubuntu|$APT_MIRROR|g; \
              s|http://security.ubuntu.com/ubuntu|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl tzdata; \
    update-ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime; \
    echo $TZ > /etc/timezone

# ---------- 非 root 运行（等保 P2-1）----------
# 镜像内默认用 appuser 跑；docker-compose.yml 会用 `user: <宿主 uid>` 再覆盖一次，
# 目的是让挂载进来的日志/存储目录（属主是宿主机的 lesson 账号）可写 —— 见 README 第五节。
RUN groupadd -r appuser \
 && useradd -r -g appuser -d /app -s /usr/sbin/nologin appuser

WORKDIR /app

COPY --chown=appuser:appuser ${JAR_FILE} /app/app.jar
COPY --from=truststore --chown=appuser:appuser /opt/cacerts.jks /app/cacerts.jks

# 644：compose 用宿主 uid 覆盖运行时，进程不再是 appuser，必须保证 world-readable。
# 写死 644 比依赖 COPY 的属主更可靠（--chown 只改属主，权限仍是源文件的）。
RUN chmod 644 /app/app.jar /app/cacerts.jks \
 && mkdir -p /app/logs \
 && chmod 755 /app /app/logs

USER appuser

EXPOSE ${SERVICE_PORT}

# 云托管那套用 RAMPercentage；自建服务器沿用 env 文件里的 JAVA_OPTS 覆盖本默认值
# （env_file 里的同名变量优先级高于镜像 ENV，所以线上实际生效的是 /etc/lesson/*.env）。
# ExitOnOutOfMemoryError：OOM 后直接退出让 restart 策略拉起新容器，
# 留一个半死不活的进程继续接流量，比崩掉难排查得多。
ENV JAVA_OPTS="-XX:InitialRAMPercentage=40 -XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8"

# 兜底健康检查（compose 里那份会覆盖它）。readiness 而不是 health：
# liveness 只反映进程活着，readiness 才包含 DB 连通性，滚动切换要看后者。
HEALTHCHECK --interval=15s --timeout=3s --start-period=90s --retries=4 \
  CMD curl -fsS "http://127.0.0.1:${SERVICE_PORT}/actuator/health/readiness" || exit 1

# 不写 --spring.profiles.active=cloud：那是云托管（微信）那套的配置，
# 自建服务器沿用与 systemd 完全一致的默认 profile，避免换平台时行为漂移。
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Djavax.net.ssl.trustStore=/app/cacerts.jks -Djavax.net.ssl.trustStorePassword=changeit -jar /app/app.jar"]
