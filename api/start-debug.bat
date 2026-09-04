@echo off
REM ===== Windows 控制台 UTF-8 编码 & Spring Boot 启动（调试模式） =====
setlocal

REM ---- Step 1. 切换控制台代码页为 UTF-8（65001），否则 conhost 仍按 GBK 解码 Java 输出 ----
chcp 65001 >nul

set "JAVA_EXE=C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot\bin\java.exe"
set "JAR_FILE=%~dp0target\api-1.0.0-SNAPSHOT.jar"

REM ---- Step 2. JVM 四层强制 UTF-8 ----
REM   file.encoding        = 资源文件 / .properties / String.getBytes() 默认编码
REM   sun.stdout.encoding  = System.out（控制台/管道）写出编码
REM   sun.stderr.encoding  = System.err 写出编码
REM   sun.jnu.encoding     = 文件名/环境变量/JNI 字符串编码（Windows 中文默认 GBK，必须改）
"%JAVA_EXE%" ^
  -Dfile.encoding=UTF-8 ^
  -Dsun.stdout.encoding=UTF-8 ^
  -Dsun.stderr.encoding=UTF-8 ^
  -Dsun.jnu.encoding=UTF-8 ^
  -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005 ^
  -jar "%JAR_FILE%"

endlocal
