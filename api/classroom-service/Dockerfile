# ==============================================================================
# classroom-service 镜像（多阶段构建，产物自包含）
#
# 与 cloudBased/classroom-service/Dockerfile 的区别：那个是「先在本机构建 jar，
# 再 COPY 进去」的发布流程；这里是「一条 docker build 从源码出镜像」，
# 用于 CI 与本地验证。两者共用同一份 application.properties 与端口 8092。
#
# 构建：
#   cd api/classroom-service
#   docker build -t classroom-service:1.0.0 .
# ==============================================================================

# ---------- 阶段 1：构建 ----------
# 用 maven 官方镜像而不是本机 mvn：pom 的 release=17，构建 JDK 与运行 JDK 必须一致，
# 否则「编译过了但运行 NoSuchMethodError」这类问题只会在容器里出现
FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /build

# 先只拷 pom 再拉依赖：源码改动不会让依赖层缓存失效，重复构建能省几分钟
COPY pom.xml .
RUN mvn -B -q dependency:go-offline || true

COPY src ./src
# 跳过测试：单元测试在 CI 的 test 阶段跑，镜像构建只负责产出可运行产物
RUN mvn -B -DskipTests package

# ---------- 阶段 2：运行 ----------
FROM eclipse-temurin:17-jre-jammy

ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 健康检查要探 actuator，镜像里没有 curl/wget 就只能探端口——那样「进程活着但 DB 断了」
# 会被判为健康，滚动发布时把坏实例当成好实例放进去。装一个 curl 比这个风险便宜得多。
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 非 root 运行：RCE 类漏洞在 root 容器里等于拿到宿主机大部分能力，
# 这是所有对外服务的底线要求，不是「可选加固」
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

WORKDIR /app

COPY --from=build /build/target/classroom-service-1.0.0.jar app.jar

# 日志与对象存储（local 实现）默认落盘，必须给非 root 用户写权限
RUN mkdir -p /app/logs /app/data && chown -R app:app /app

USER app

EXPOSE 8092

# MaxRAMPercentage 而不是固定 -Xmx：容器内存调整后不必重新构建镜像，
# 否则每次调规格都要改 Dockerfile。OOM 直接退出（ExitOnOutOfMemoryError）
# 让编排层重建实例，而不是留一个半死不活、继续接流量的进程。
ENV JAVA_OPTS="-XX:InitialRAMPercentage=50 -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8"

# start-period 给 90s：Spring 启动 + Flyway/MyBatis 初始化 + Redis 连接在中低配机器上不短，
# 给短了会在启动期被误判失败并反复重启（表现为「容器一直重启但从没真的崩」）
HEALTHCHECK --interval=30s --timeout=3s --start-period=90s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8092/actuator/health/liveness || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar --spring.profiles.active=${SPRING_PROFILES_ACTIVE:-cloud}"]
