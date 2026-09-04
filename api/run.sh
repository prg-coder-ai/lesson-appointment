#!/usr/bin/env bash
# ============================================================================
# run.sh —— 预约系统(api) 一键编译+启动脚本
# 背景：本机环境有 4 个坑，直接用 mvn 无法 build/run，故绕过：
#   1) Git Bash 里 mvn POSIX 脚本会把 /c/... 路径错转成 \c\... 导致 ClassNotFound
#   2) 本地 Maven 仓库 (E:\MAVEN\.m2) 为只读，spring-boot:run 写 resolver-status 失败
#   3) VS Code Java 语言服务锁定 target/classes，mvn 写 createdFiles.lst 失败
#   4) ./logs/spring-boot-app.log 被 IDE 日志查看器锁死，Logback 初始化拒绝访问
# 因此：直接调用 Maven launcher (Windows 风格 C:/ 路径) 做 compile，
#       再用 java -cp 跑主类，工作目录换到 /c/Temp/apprun 规避 logs 锁。
# 用法：bash run.sh            (前台运行，Ctrl+C 停止)
#       bash run.sh &          (后台运行)
# ============================================================================
set -e

API="C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api"
TMP="C:/Temp"
JAVA="C:/Program Files/Eclipse Adoptium/jdk-21.0.8.9-hotspot/bin/java"
BOOT="C:/Program Files/apache-maven-3.9.11/boot/plexus-classworlds-2.9.0.jar"
MH="C:/Program Files/apache-maven-3.9.11"
PRJ="$API"
CPFILE="$TMP/cp.txt"
APPDIR="$TMP/apprun"

echo "[run.sh] 1/4 释放 VS Code 对 target 的锁 ..."
if [ -d "$API/target" ]; then
  mv "$API/target" "$TMP/target-relock-$(date +%s)" 2>/dev/null || echo "      (target 未被锁，跳过)"
fi

echo "[run.sh] 2/4 编译 (Maven launcher, 仅读取已缓存插件) ..."
"$JAVA" -classpath "$BOOT" \
  "-Dclassworlds.conf=$MH/bin/m2.conf" \
  "-Dmaven.home=$MH" \
  "-Dlibrary.jansi.path=$MH/lib/jansi-native" \
  "-Dmaven.multiModuleProjectDirectory=$PRJ" \
  --add-opens java.base/java.lang=ALL-UNNAMED \
  --enable-native-access=ALL-UNNAMED \
  org.codehaus.plexus.classworlds.launcher.Launcher compile -DskipTests -q

echo "[run.sh] 3/4 准备依赖 classpath ..."
if [ -s "$CPFILE" ]; then
  echo "      (复用已生成的 $CPFILE)"
else
  echo "      (重新生成 $CPFILE ...)"
  "$JAVA" -classpath "$BOOT" \
    "-Dclassworlds.conf=$MH/bin/m2.conf" \
    "-Dmaven.home=$MH" \
    "-Dlibrary.jansi.path=$MH/lib/jansi-native" \
    "-Dmaven.multiModuleProjectDirectory=$PRJ" \
    --add-opens java.base/java.lang=ALL-UNNAMED \
    --enable-native-access=ALL-UNNAMED \
    org.codehaus.plexus.classworlds.launcher.Launcher dependency:build-classpath \
    "-Dmdep.outputFile=$CPFILE" -q
fi

echo "[run.sh] 4/4 启动应用 (CWD=$APPDIR, 端口 8081) ..."
mkdir -p "$APPDIR"
cd "$APPDIR"
CP=$(cat "$CPFILE")
APPCP="$API/target/classes;$CP"
exec "$JAVA" -Dserver.port=8081 -cp "$APPCP" com.reservation.SpringBootMergeApplication
