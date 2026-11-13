@echo off
rem ============================================================================
rem build-all.bat - 微信云托管 · 本地预打包一键脚本（Windows cmd）
rem
rem 与同目录 build-all.sh 行为一致，参数相同：
rem   build-all.bat                                   完整构建（后端 + 前端 + 镜像）
rem   build-all.bat --skip-frontend --skip-docker     只改了 Java 时用
rem   build-all.bat --env-id myenv01 --docker-push    构建并推送到云托管仓库
rem
rem 参数：
rem   --skip-frontend   跳过前端 node build.js
rem   --skip-backend    跳过 Maven 打包
rem   --skip-docker     跳过 docker build
rem   --docker-push     推送镜像到云托管仓库（需与 --env-id 同用）
rem   --env-id <ENV_ID> 云托管环境 ID，用于镜像 tag 命名
rem
rem 前置：mvn / node / docker 需在 PATH 中
rem 说明：本文件以 GBK + CRLF 保存，请勿另存为 UTF-8 或 LF，否则 cmd 解析会错乱
rem ============================================================================

setlocal enabledelayedexpansion

rem ---------------------------------------------------------------- 参数解析
set "SKIP_FE=0"
set "SKIP_BE=0"
set "SKIP_DOCKER=0"
set "DOCKER_PUSH=0"
set "ENV_ID="

:parse
if "%~1"=="" goto :args_done
if /i "%~1"=="--skip-frontend" ( set "SKIP_FE=1" & shift & goto :parse )
if /i "%~1"=="--skip-backend"  ( set "SKIP_BE=1" & shift & goto :parse )
if /i "%~1"=="--skip-docker"   ( set "SKIP_DOCKER=1" & shift & goto :parse )
if /i "%~1"=="--docker-push"   ( set "DOCKER_PUSH=1" & shift & goto :parse )
if /i "%~1"=="--env-id" (
    if "%~2"=="" (
        set "ERRMSG=--env-id 后面需要一个环境 ID"
        goto :die
    )
    set "ENV_ID=%~2"
    shift
    shift
    goto :parse
)
if /i "%~1"=="-h"     goto :usage
if /i "%~1"=="--help" goto :usage
echo.
echo   [ERR] 未知参数：%~1
goto :usage

:usage
echo.
echo   用法：build-all.bat [--skip-frontend] [--skip-backend] [--skip-docker]
echo                      [--docker-push --env-id ^<ENV_ID^>]
echo.
pause
exit /b 1

:args_done

rem ---------------------------------------------------------------- 路径推导
rem %~dp0 是脚本所在目录（带尾反斜杠），上一级即项目根，deploy\ 与 api\ 是兄弟目录
rem 注意：cloudBased\scripts\build-all.bat 是同源副本，它在两层深处用 ..\.. 才对；
rem       本文件在 deploy\ 只有一层，用 .. 即可，别从那份直接覆盖回来。
pushd "%~dp0.." >nul 2>nul
if errorlevel 1 (
    set "ERRMSG=无法进入项目根目录（%~dp0..）"
    goto :die
)
set "PROJECT_ROOT=%CD%"
popd

set "API_DIR=%PROJECT_ROOT%\api"
set "MSG_DIR=%API_DIR%\message-service"
set "FE_DIR=%PROJECT_ROOT%\frontend"
set "CLOUD_API=%PROJECT_ROOT%\cloudBased\api"
set "CLOUD_MSG=%PROJECT_ROOT%\cloudBased\message-service"
set "CLOUD_WEB=%PROJECT_ROOT%\cloudBased\frontend"

if not exist "%API_DIR%\pom.xml" (
    set "ERRMSG=项目结构异常，找不到 %API_DIR%\pom.xml"
    goto :die
)

echo.
echo ============================================================
echo   项目根：%PROJECT_ROOT%
echo   跳过：后端=%SKIP_BE% 前端=%SKIP_FE% 镜像=%SKIP_DOCKER% 推送=%DOCKER_PUSH%
echo ============================================================

rem ============================================================================
rem Step 1 - Maven 打包
rem ============================================================================
if "%SKIP_BE%"=="1" goto :skip_backend

call :step "Step 1 - Maven 打包后端服务"

echo   [1/3] api（booking-api-2.2.0.jar）...
pushd "%API_DIR%"
call mvn clean package -DskipTests -q
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=api Maven 构建失败（exit !RC!）。单独跑一次 mvn -f api\pom.xml package -DskipTests 看详细日志"
    goto :die
)

echo   [1/3] message-service（message-service-1.1.0.jar）...
pushd "%MSG_DIR%"
call mvn clean package -DskipTests -q
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=message-service Maven 构建失败（exit !RC!）"
    goto :die
)

rem 两个服务的落点故意不同，别"统一"：
rem   api/Dockerfile             -> COPY booking-api-2.2.0.jar            （上下文根目录）
rem   message-service/Dockerfile -> COPY target/message-service-1.1.0.jar
rem 曾经 api 也往 target\ 拷，而 Dockerfile 读的是根目录那份，镜像里装的是仓库遗留的
rem 旧 jar，改代码不生效，排查时极易误判。
if not exist "%CLOUD_API%" mkdir "%CLOUD_API%"
if not exist "%CLOUD_MSG%\target" mkdir "%CLOUD_MSG%\target"

copy /y "%API_DIR%\target\booking-api-2.2.0.jar"     "%CLOUD_API%\booking-api-2.2.0.jar" >nul
if errorlevel 1 (
    set "ERRMSG=复制 api jar 失败：%API_DIR%\target\booking-api-2.2.0.jar"
    goto :die
)
copy /y "%MSG_DIR%\target\message-service-1.1.0.jar" "%CLOUD_MSG%\target\message-service-1.1.0.jar" >nul
if errorlevel 1 (
    set "ERRMSG=复制 message-service jar 失败"
    goto :die
)

call :ok "后端打包完成"
goto :step2

:skip_backend
call :warn "跳过 Maven 打包（--skip-backend）"

rem ============================================================================
rem Step 2 - 前端构建
rem ============================================================================
:step2
if "%SKIP_FE%"=="1" goto :skip_frontend

call :step "Step 2 - 前端构建（node build.js）"

pushd "%FE_DIR%"
call node build.js
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=前端构建失败（exit !RC!）。常见原因：缺 node_modules，先在该目录跑 npm install"
    goto :die
)

rem app-config.json 是部署侧手工维护的「小程序远程配置」，不在 frontend\ 源码树里，
rem build.js 不会产出它。如果直接 rmdir 再整体覆盖，控制台里配好的上游地址就没了，
rem 小程序会静默回落到 env.js 内置默认值 —— 表面正常、实际远程配置失效，很难发现。
rem 所以复制前先备份，复制后还原。
set "APPCFG_BAK="
if exist "%CLOUD_WEB%\dist\app-config.json" (
    set "APPCFG_BAK=%TEMP%\booking-app-config.bak"
    copy /y "%CLOUD_WEB%\dist\app-config.json" "!APPCFG_BAK!" >nul
)

if exist "%CLOUD_WEB%\dist" rmdir /s /q "%CLOUD_WEB%\dist"
if not exist "%CLOUD_WEB%" mkdir "%CLOUD_WEB%"
xcopy "%FE_DIR%\dist" "%CLOUD_WEB%\dist\" /e /i /q /y >nul
if errorlevel 1 (
    set "ERRMSG=复制前端 dist 到 cloudBased\frontend 失败"
    goto :die
)

if defined APPCFG_BAK (
    if exist "!APPCFG_BAK!" (
        copy /y "!APPCFG_BAK!" "%CLOUD_WEB%\dist\app-config.json" >nul
        del /q "!APPCFG_BAK!" >nul 2>nul
        call :ok "已还原 app-config.json"
    )
)

call :ok "前端构建完成"
goto :step25

:skip_frontend
call :warn "跳过前端构建（--skip-frontend）"

rem ============================================================================
rem Step 2.5 - 产物收口到 deploy\
rem ============================================================================
:step25
set "ONLY_PARTS="
if "%SKIP_BE%"=="0" set "ONLY_PARTS=jars"
if "%SKIP_FE%"=="0" (
    if defined ONLY_PARTS (
        set "ONLY_PARTS=!ONLY_PARTS!,dist"
    ) else (
        set "ONLY_PARTS=dist"
    )
)
if not defined ONLY_PARTS goto :step3

call :step "Step 2.5 - 产物收口到 deploy\"
if not exist "%PROJECT_ROOT%\deploy\collect-artifacts.js" (
    call :warn "缺少 deploy\collect-artifacts.js，跳过收口"
    goto :step3
)
call node "%PROJECT_ROOT%\deploy\collect-artifacts.js" --only "!ONLY_PARTS!"
if errorlevel 1 (
    set "ERRMSG=产物收口失败（node deploy\collect-artifacts.js --only !ONLY_PARTS!）"
    goto :die
)
call :ok "deploy\dist\ 与 deploy\jars\ 已更新"

rem ============================================================================
rem Step 3 - Docker 镜像
rem ============================================================================
:step3
if "%SKIP_DOCKER%"=="1" goto :skip_docker

call :step "Step 3 - Docker 镜像构建"

where docker >nul 2>nul
if errorlevel 1 (
    set "ERRMSG=未检测到 docker，请确认 Docker Desktop 已启动且在 PATH 中"
    goto :die
)

echo   [2/3] booking-api:2.2.0 ...
pushd "%CLOUD_API%"
call docker build -t booking-api:2.2.0 .
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=api docker build 失败。若卡在 apt-get，检查网络或构建参数 APT_MIRROR"
    goto :die
)
call :ok "booking-api:2.2.0"

echo   [2/3] booking-message-service:1.1.0 ...
pushd "%CLOUD_MSG%"
call docker build -t booking-message-service:1.1.0 .
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=message-service docker build 失败"
    goto :die
)
call :ok "booking-message-service:1.1.0"

rem 构建上下文 = cloudBased\frontend（Dockerfile 里的 COPY dist 依赖同目录的 dist\）
if not exist "%CLOUD_WEB%\Dockerfile" (
    set "ERRMSG=缺少 %CLOUD_WEB%\Dockerfile"
    goto :die
)
if not exist "%CLOUD_WEB%\default.conf.template" (
    set "ERRMSG=缺少 %CLOUD_WEB%\default.conf.template"
    goto :die
)
if not exist "%CLOUD_WEB%\dist" (
    set "ERRMSG=缺少 %CLOUD_WEB%\dist，请先跑前端构建（不要加 --skip-frontend）"
    goto :die
)
call :ok "web 构建上下文就绪：cloudBased\frontend"

echo   [3/3] booking-web:latest（上游走运行时环境变量，构建不需 --build-arg）...
pushd "%CLOUD_WEB%"
call docker build -t booking-web:latest .
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=web docker build 失败"
    goto :die
)
call :ok "booking-web:latest"
call :warn "别忘了在云托管控制台配 API_UPSTREAM / MSG_UPSTREAM 环境变量，缺失会导致容器启动失败"

if "%DOCKER_PUSH%"=="1" goto :do_push
goto :summary

:do_push
call :step "Step 3d - 推送镜像到云托管"
if not defined ENV_ID (
    set "ERRMSG=推送需要 --env-id"
    goto :die
)
set "REGISTRY=ccr.ccs.tencentyun.com/cb-!ENV_ID!"

call docker tag booking-api:2.2.0             "!REGISTRY!/api:2.2.0"
call docker tag booking-message-service:1.1.0 "!REGISTRY!/message-service:1.1.0"
call docker tag booking-web:latest            "!REGISTRY!/web:latest"

call docker push "!REGISTRY!/api:2.2.0"
if errorlevel 1 (
    set "ERRMSG=api push 失败（先 docker login ccr.ccs.tencentyun.com）"
    goto :die
)
call docker push "!REGISTRY!/message-service:1.1.0"
if errorlevel 1 (
    set "ERRMSG=message-service push 失败"
    goto :die
)
call docker push "!REGISTRY!/web:latest"
if errorlevel 1 (
    set "ERRMSG=web push 失败"
    goto :die
)
call :ok "镜像已推送到 !REGISTRY!"
goto :summary

:skip_docker
call :warn "跳过 Docker 构建（--skip-docker）"

rem ============================================================================
rem 汇总
rem ============================================================================
:summary
call :step "构建产物清单"
echo   后端 jar：cloudBased\api\booking-api-2.2.0.jar（Dockerfile 读根目录）
echo             cloudBased\message-service\target\message-service-1.1.0.jar
echo   前端 dist：cloudBased\frontend\dist\
echo   统一收口：deploy\jars\ 与 deploy\dist\
echo.
echo   下一步：
echo     方式 A - 控制台「上传代码包 / Dockerfile」
echo     方式 B - 流水线：授权代码源 + container.config.json
if defined ENV_ID echo     方式 C - 已推镜像：ccr.ccs.tencentyun.com/cb-!ENV_ID!/^<服务^>:^<tag^>

echo.
call :ok "全部完成"
goto :done

rem ============================================================================
rem 子过程
rem ============================================================================
:step
echo.
echo ==^> %~1
exit /b 0

:ok
echo   [OK] %~1
exit /b 0

:warn
echo   [WARN] %~1
exit /b 0

:die
echo.
echo   [ERR] %ERRMSG%
echo.
pause
endlocal
exit /b 1

rem ---------------------------------------------------------------- 收尾
:done
echo.
rem 双击运行时窗口会立刻关闭，这里等一下；在 cmd 里手动调用则不阻塞
echo %CMDCMDLINE% | findstr /i /c:"%~nx0" >nul
if not errorlevel 1 pause
endlocal
exit /b 0
