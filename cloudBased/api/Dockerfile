# ==============================================================================
# 微信云托管 · api 服务 Dockerfile
#
# 等保 P2-1：非 root 运行（appuser）
# 基础镜像：Java 17 JRE（不含 JDK，体积更小、攻击面更小）
# 时区：Asia/Shanghai
#
# ★ 2026-11-10 修订：修复 JVM 访问微信接口的 PKIX 失败
#   故障：微信绑定返回
#     {"code":400,"message":"微信授权失败：调用微信接口失败：(certificate_unknown)
#      PKIX path building failed: ... unable to find valid certification path"}
#   原因：java.net.http.HttpClient 用的是 JDK 自己的 cacerts，**不是** Ubuntu 系统信任库，
#         容器里那份 cacerts 无法验证 api.weixin.qq.com 的链（根为 DigiCert Global Root G2）。
#   方案：构建阶段用 JDK 镜像把「JDK 自带 cacerts + 系统 CA」合成一份，运行阶段通过
#         -Djavax.net.ssl.trustStore 显式指向它。以后要加私有/代理根证书，只需在
#         构建阶段把它 COPY 到 /usr/local/share/ca-certificates/ 再 update-ca-certificates。
#
# ⚠ 为什么不能直接在运行镜像里 keytool 导入：
#   eclipse-temurin:17-**jre** 不带 keytool（那是 JDK 的工具），所以必须分阶段构建。
# ==============================================================================

# ------------------------------------------------------------------------------
# 阶段 1：合成信任库
# ------------------------------------------------------------------------------
FROM eclipse-temurin:17-jdk-jammy AS truststore

ENV DEBIAN_FRONTEND=noninteractive

# 国内直连 archive.ubuntu.com 常年龟速，默认走腾讯云公网镜像；
# 要改回官方源传 --build-arg APT_MIRROR=（空值即跳过替换）。
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

# 以 JDK 自带的 cacerts 为基底（它含部分系统库没有的商业根），再叠加系统 CA。
# 别名用证书 SHA-256 指纹：/etc/ssl/certs 下同一个根有多个符号链接别名，
# 用文件名当 alias 会重复导入并互相覆盖，用指纹天然去重。
RUN set -eux; \
    cp "$JAVA_HOME/lib/security/cacerts" /opt/cacerts.jks; \
    before="$(keytool -list -keystore /opt/cacerts.jks -storepass changeit 2>/dev/null \
              | grep -c trustedCertEntry || true)"; \
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
    echo "[truststore] JDK 自带 $before 张，本次导入 $added 张，最终 $after 张"; \
    test "$after" -ge 50; \
    chmod 644 /opt/cacerts.jks

# ------------------------------------------------------------------------------
# 阶段 2：运行
# ------------------------------------------------------------------------------
FROM eclipse-temurin:17-jre-jammy

ENV TZ=Asia/Shanghai
ENV DEBIAN_FRONTEND=noninteractive

# curl 是 HEALTHCHECK 用的 —— 原文件里写了 `HEALTHCHECK ... curl`，但 jre-jammy 根本没装 curl，
# 这条指令一直是坏的（k8s 不读 Dockerfile 的 HEALTHCHECK，所以此前没暴露）。
# ca-certificates 给 curl 校验用，同时方便容器内排查 TLS。
ARG APT_MIRROR=http://mirrors.cloud.tencent.com/ubuntu
RUN set -eux; \
    if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://archive.ubuntu.com/ubuntu|$APT_MIRROR|g; \
              s|http://security.ubuntu.com/ubuntu|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    update-ca-certificates; \
    rm -rf /var/lib/apt/lists/*; \
    ln -snf /usr/share/zoneinfo/$TZ /etc/localtime; \
    echo $TZ > /etc/timezone; \
    curl --version | head -1

# ---------- 非 root 运行用户（等保 P2-1）----------
# groupadd/useradd 用 -r 创建系统账号；/usr/sbin/nologin 禁用 shell
RUN groupadd -r appuser \
 && useradd -r -g appuser -d /app -s /usr/sbin/nologin appuser

RUN mkdir -p /app/logs && chown -R appuser:appuser /app/logs

WORKDIR /app

# ---------- 复制 jar 并赋权给 appuser ----------
COPY --chown=appuser:appuser booking-api-2.2.0.jar app.jar

# ---------- 信任库（阶段 1 的产物）----------
# 放 /app 下而不是 $JAVA_HOME，避免污染 JDK 目录，也让 appuser 只读访问即可
COPY --from=truststore --chown=appuser:appuser /opt/cacerts.jks /app/cacerts.jks

# ---------- 切换到非 root 用户 ----------
USER appuser

EXPOSE 8081

# ---------- 健康检查 ----------
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:8081/actuator/health || exit 1

# ---------- 入口 ----------
# -Djavax.net.ssl.trustStore 显式指定信任库：不再依赖默认 $JAVA_HOME/lib/security/cacerts，
# 换基础镜像或 JDK 小版本都不会静默回退到「缺根」的状态。
# changeit 是 JKS/PKCS12 信任库的约定默认口令，不是业务密钥。
ENTRYPOINT ["java", \
  "-Djavax.net.ssl.trustStore=/app/cacerts.jks", \
  "-Djavax.net.ssl.trustStorePassword=changeit", \
  "-jar", "app.jar", \
  "--spring.profiles.active=cloud"]
