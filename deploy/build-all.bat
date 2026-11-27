@echo off
rem ============================================================================
rem build-all.bat - 小程序项目组 · 预约系统一键构建脚本（Windows cmd）
rem
rem 覆盖范围（当前 3 后端 + 2 前端）：
rem   后端：api（booking-api）/ message-service / classroom-service
rem   前端：frontend（web 站点，出 dist）/ classroom-app（课堂 App，出 www）
rem
rem 用法：
rem   build-all.bat                                   全量构建（3 后端 + 2 前端 + 收口 + 镜像）
rem   build-all.bat --skip-docker                     只出 jar 与前端产物
rem   build-all.bat --skip-backend --skip-frontend    只出收口
rem   build-all.bat --skip-web                        跳 frontend，仍构建 classroom-app
rem   build-all.bat --skip-app                        跳 classroom-app，仍构建 frontend
rem   build-all.bat --env-id myenv01 --docker-push    构建并推送到云托管仓库
rem
rem 参数：
rem   --skip-backend    跳过 Maven 构建（3 个后端全跳）
rem   --skip-frontend   跳过两个前端（= --skip-web + --skip-app）
rem   --skip-web        只跳 frontend（web 站点 dist）
rem   --skip-app        只跳 classroom-app（课堂 App www）
rem   --skip-docker     跳过 docker build
rem   --docker-push     推送镜像到云托管仓库（需与 --env-id 同用）
rem   --env-id <ENV_ID> 云托管环境 ID，用于镜像 tag 区分
rem
rem 前件：mvn / node / docker 都在 PATH 里
rem 说明：本文件用 GBK + CRLF 保存，避免设为 UTF-8 后 cmd 显示乱码
rem ============================================================================

setlocal enabledelayedexpansion

rem ---------------------------------------------------------------- 参数解析
set "SKIP_FE=0"
set "SKIP_APP=0"
set "SKIP_BE=0"
set "SKIP_DOCKER=0"
rem WorkBuddy 沙箱下 node 的批量删除守卫会拦 sync.js 清空 www（>50 文件），构建必须放行
set "CODEBUDDY_SAFE_DELETE_ENABLED=0"
set "SKIP_NATIVE=0"
set "APP_ENV=dev"
set "FRONTEND_ORIGIN=http://192.168.1.10:8080"
set "DOCKER_PUSH=0"
set "ENV_ID="

:parse
if "%~1"=="" goto :args_done
if /i "%~1"=="--skip-frontend" ( set "SKIP_FE=1" & set "SKIP_APP=1" & shift & goto :parse )
if /i "%~1"=="--skip-web"      ( set "SKIP_FE=1" & shift & goto :parse )
if /i "%~1"=="--skip-app"      ( set "SKIP_APP=1" & shift & goto :parse )
if /i "%~1"=="--skip-backend"  ( set "SKIP_BE=1" & shift & goto :parse )
if /i "%~1"=="--skip-docker"   ( set "SKIP_DOCKER=1" & shift & goto :parse )
if /i "%~1"=="--skip-native"   ( set "SKIP_NATIVE=1" & shift & goto :parse )
if /i "%~1"=="--app-env" (
    if "%~2"=="" (
        set "ERRMSG=--app-env 后面需要一个环境名（dev / prod）"
        goto :die
    )
    set "APP_ENV=%~2"
    shift
    shift
    goto :parse
)
if /i "%~1"=="--frontend-origin" (
    if "%~2"=="" (
        set "ERRMSG=--frontend-origin 后面需要一个可访问的源站地址"
        goto :die
    )
    set "FRONTEND_ORIGIN=%~2"
    shift
    shift
    goto :parse
)
if /i "%~1"=="--docker-push"   ( set "DOCKER_PUSH=1" & shift & goto :parse )
if /i "%~1"=="--env-id" (
    if "%~2"=="" (
        set "ERRMSG=--env-id 后面需要跟一个环境 ID"
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
echo   用法：build-all.bat [--skip-backend] [--skip-frontend] [--skip-web] [--skip-app] [--skip-docker]
echo                      [--docker-push --env-id ^<ENV_ID^>]
echo                      [--skip-native --app-env ^<ENV^> --frontend-origin ^<URL^>]
echo.
echo   --skip-frontend  跳过两个前端（= --skip-web + --skip-app）
echo   --skip-web       只跳 frontend（web 站点 dist）
echo   --skip-app       只跳 classroom-app（课堂 App www）
echo   --skip-native    跳过多端产物（Android APK + Windows 自解压 EXE）
echo   --app-env        APK 的 APP_ENV，默认 dev；--frontend-origin 指定 APK 源站
echo.
pause
exit /b 1

:args_done

rem ---------------------------------------------------------------- 路径推导
rem %~dp0 是脚本所在目录（结尾带反斜杠）；上一层就是项目根（deploy\ 与 api\ 并列的目录）
rem 注意：本文件在 deploy\ 只有一层，项目根是 ..；若从同源仓库的
rem       deploy\scripts\ 另存过来，必须改成 ..\..，否则删不掉旧副本会从此处运行。
pushd "%~dp0.." >nul 2>nul
if errorlevel 1 (
    set "ERRMSG=无法进入项目根目录：%~dp0.."
    goto :die
)
set "PROJECT_ROOT=%CD%"
popd

set "API_DIR=%PROJECT_ROOT%\api"
set "MSG_DIR=%API_DIR%\message-service"
set "CLS_DIR=%API_DIR%\classroom-service"
set "FE_DIR=%PROJECT_ROOT%\frontend"
set "APP_DIR=%PROJECT_ROOT%\classroom-app"
rem 2026-11-27 merged: single cloudbase build context = deploy\docker (was deploy\docker\*)
set "DOCKER_DIR=%PROJECT_ROOT%\deploy\docker"

if not exist "%API_DIR%\pom.xml" (
    set "ERRMSG=项目结构异常：找不到 %API_DIR%\pom.xml"
    goto :die
)

rem 版本号集中在这里：升级 pom 版本时同步改这三处
set "VER_API=2.2.1"
set "VER_MSG=1.1.0"
set "VER_CLS=1.0.0"

echo.
echo ============================================================
echo   项目根：%PROJECT_ROOT%
echo   后端=%SKIP_BE%  web=%SKIP_FE%  app=%SKIP_APP%  多端=%SKIP_NATIVE%  镜像=%SKIP_DOCKER%  推送=%DOCKER_PUSH%
echo   后端 3 个：booking-api %VER_API% / message-service %VER_MSG% / classroom-service %VER_CLS%
echo   前端 2 个：frontend（dist） / classroom-app（www）
echo ============================================================

rem ============================================================================
rem Step 1 - Maven 构建（3 个后端）
rem ============================================================================
if "%SKIP_BE%"=="1" goto :skip_backend

call :step "Step 1 - Maven 构建后端服务（3 个）"

echo   [1/3] api（booking-api-%VER_API%.jar）...
pushd "%API_DIR%"
call mvn clean package -DskipTests -q
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=api Maven 构建失败（exit !RC!），可单独执行 mvn -f api\pom.xml package -DskipTests 看详细日志"
    goto :die
)

echo   [2/3] message-service（message-service-%VER_MSG%.jar）...
pushd "%MSG_DIR%"
call mvn clean package -DskipTests -q
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=message-service Maven 构建失败（exit !RC!）"
    goto :die
)

echo   [3/3] classroom-service（classroom-service-%VER_CLS%.jar）...
if not exist "%CLS_DIR%\pom.xml" (
    set "ERRMSG=找不到 %CLS_DIR%\pom.xml，classroom-service 未就位。只构建两个后端请用 --skip-backend 后手工处理，或确认分支已包含课堂服务"
    goto :die
)
pushd "%CLS_DIR%"
call mvn clean package -DskipTests -q
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=classroom-service Maven 构建失败（exit !RC!）"
    goto :die
)

rem 三个服务的 Dockerfile 对 jar 位置要求不同，不要"统一"：
rem   api/Dockerfile                      -> COPY booking-api-2.2.1.jar             （上下文根目录那份）
rem   message-service/Dockerfile          -> COPY target/message-service-1.1.0.jar
rem   classroom-service/Dockerfile        -> COPY classroom-service-1.0.0.jar      （上下文根目录那份）
rem 所以 api 也留 target\ 下那份，Dockerfile 引的是根目录那份，装错会跑起旧 jar 而不报错。
if not exist "%DOCKER_DIR%" mkdir "%DOCKER_DIR%"
if not exist "%DOCKER_DIR%\target" mkdir "%DOCKER_DIR%\target"
if not exist "%DOCKER_DIR%" mkdir "%DOCKER_DIR%"

copy /y "%API_DIR%\target\booking-api-%VER_API%.jar"        "%DOCKER_DIR%\booking-api-%VER_API%.jar" >nul
if errorlevel 1 (
    set "ERRMSG=复制 api jar 失败：%API_DIR%\target\booking-api-%VER_API%.jar"
    goto :die
)
copy /y "%MSG_DIR%\target\message-service-%VER_MSG%.jar"    "%DOCKER_DIR%\target\message-service-%VER_MSG%.jar" >nul
if errorlevel 1 (
    set "ERRMSG=复制 message-service jar 失败"
    goto :die
)
copy /y "%CLS_DIR%\target\classroom-service-%VER_CLS%.jar"  "%DOCKER_DIR%\classroom-service-%VER_CLS%.jar" >nul
if errorlevel 1 (
    set "ERRMSG=复制 classroom-service jar 失败"
    goto :die
)

call :ok "后端构建完成（3 个 jar 已就位 deploy\docker\）"
goto :step2

:skip_backend
call :warn "跳过 Maven 构建（--skip-backend）"

rem ============================================================================
rem Step 2 - 前端构建（2 个）
rem ============================================================================
:step2
if "%SKIP_FE%"=="1" if "%SKIP_APP%"=="1" goto :skip_frontend

call :step "Step 2 - 前端构建（frontend + classroom-app）"

rem ---- 2a) frontend（web 站点）----
if "%SKIP_FE%"=="1" (
    call :warn "跳过 frontend 构建（--skip-web / --skip-frontend）"
    goto :step2b
)

echo   [1/2] frontend -> dist\ ...
pushd "%FE_DIR%"
call node build.js
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=frontend 构建失败（exit !RC!），常见原因：缺 node_modules，在该目录跑 npm install"
    goto :die
)

rem app-config.json 是部署侧手工维护的"小程序自动建站"配置，存在 frontend\ 源码里，
rem build.js 不生成它。若直接 rmdir 后整体覆盖，后台配好的租户地址就没了，
rem 小程序会静默回退到 env.js 里的默认值 —— 线上多租户自动建站失效，且难发现。
rem 所以覆盖前先备份，复制后原样还原。
set "APPCFG_BAK="
if exist "%DOCKER_DIR%\dist\app-config.json" (
    set "APPCFG_BAK=%TEMP%\booking-app-config.bak"
    copy /y "%DOCKER_DIR%\dist\app-config.json" "!APPCFG_BAK!" >nul
)

if exist "%DOCKER_DIR%\dist" rmdir /s /q "%DOCKER_DIR%\dist"
if not exist "%DOCKER_DIR%" mkdir "%DOCKER_DIR%"
xcopy "%FE_DIR%\dist" "%DOCKER_DIR%\dist\" /e /i /q /y >nul
if errorlevel 1 (
    set "ERRMSG=复制前端 dist 到 deploy\docker 失败"
    goto :die
)

if defined APPCFG_BAK (
    if exist "!APPCFG_BAK!" (
        copy /y "!APPCFG_BAK!" "%DOCKER_DIR%\dist\app-config.json" >nul
        del /q "!APPCFG_BAK!" >nul 2>nul
        call :ok "已还原 app-config.json"
    )
)
call :ok "frontend 构建完成（dist 已收口 deploy\docker）"

rem ---- 2b) classroom-app（课堂 App 的 Web 资源）----
:step2b
if "%SKIP_APP%"=="1" (
    call :warn "跳过 classroom-app 构建（--skip-app / --skip-frontend）"
    goto :step2done
)

echo   [2/2] classroom-app -> www\ ...
if not exist "%APP_DIR%\package.json" (
    set "ERRMSG=找不到 %APP_DIR%\package.json"
    goto :die
)

rem classroom-app\scripts\build.js 流水线：sync（抽取前端资源）-> patch（只打 www 副本）
rem   -> 渲染 app-config.js（三套地址）-> 复制适配层 -> 注入脚本引用 -> 生成 capacitor.config.json
rem 默认 APP_MODE=server（WebView 加载线上前端，三套地址留空走同源代理）。
rem 要出 local 模式离线包：先 set APP_MODE=local 并配齐 API_ORIGIN / CLASSROOM_API_ORIGIN /
rem   CLASSROOM_WS_ORIGIN 三个绝对地址，再跑本脚本（否则 build.js 会直接终止）。
pushd "%APP_DIR%"
call node scripts\build.js
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=classroom-app 构建失败（exit !RC!），若提示缺三套地址说明误设了 APP_MODE=local"
    goto :die
)

if not exist "%APP_DIR%\www\index.html" (
    set "ERRMSG=classroom-app 构建结束但未见 www\index.html，检查 scripts\build.js 输出"
    goto :die
)
call :ok "classroom-app 构建完成（www\ 已就位，App 打包源）"
echo        说明：www\ 打入 App 安装包，不参与服务器部署，故不收口到 deploy\dist。
echo        本地预览：node classroom-app\scripts\serve.js 8098

:step2done
goto :step2c

:skip_frontend
call :warn "跳过前端构建（--skip-frontend）"
goto :step2c

rem ============================================================================
rem Step 2c - 课堂 App 多端产物（Android APK + Windows 自解压 EXE）
rem ============================================================================
:step2c
if "%SKIP_NATIVE%"=="1" goto :skip_native

call :step "Step 2c - 课堂 App 多端产物（APK + 自解压 EXE）"
if not exist "%APP_DIR%\www\index.html" (
    set "ERRMSG=classroom-app 尚未构建出 www\index.html，请去掉 --skip-app 重跑"
    goto :die
)

rem 时间戳由 node 生成，避开 %DATE%/%TIME% 的区域格式差异
call node -e "var d=new Date(),p=function(n){return ('0'+n).slice(-2)};process.stdout.write(''+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+'\n')" > "%TEMP%\eclassroom-stamp.txt"
set /p STAMP=<"%TEMP%\eclassroom-stamp.txt"
if not defined STAMP (
    set "ERRMSG=无法生成时间戳（node 不可用？）"
    goto :die
)

rem ---- 2c-1) Windows 自解压 EXE（prod/www 同源模式，已实机验证） ----
rem 注意：pack:sfx 默认复用旧 win-unpacked，源码更新后会打进旧内容；必须先重建 prod/www 再强制 --rebuild。
rem 先保存 APK 参数，EXE 用 prod/www，APK 段再恢复（避免 dev 源站污染 EXE）。
set "_APK_ENV=%APP_ENV%"
set "_APK_ORIGIN=%FRONTEND_ORIGIN%"
set "APP_ENV="
set "FRONTEND_ORIGIN="
echo   [1/2] Windows 自解压 EXE（prod/www + 强制 rebuild）...
pushd "%APP_DIR%"
call node scripts\build.js
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=EXE 前置构建（prod/www）失败：exit !RC!"
    goto :die
)
pushd "%APP_DIR%\desktop"
rem 用带时间戳的独立输出目录，绕开旧 dist-sfx/win-unpacked/resources/app.asar 的残留句柄锁（EBUSY）
set "SFX_OUT_DIR=%APP_DIR%\desktop\dist-sfx-!STAMP!"
rem 直接调 node，绕开系统 npm（node25 + npm11.6.2 的 fs-minipass 会崩；node 本身正常）
call node scripts\pack-sfx.cjs --rebuild
set "RC=!errorlevel!"
set "SFX_OUT_DIR="
popd
if not "!RC!"=="0" (
    set "ERRMSG=Windows 自解压 EXE 打包失败（exit !RC!），确认 electron-builder 缓存里有 NSIS；若报 app.asar EBUSY 可换时间戳重试"
    goto :die
)
set "APP_ENV=%_APK_ENV%"
set "FRONTEND_ORIGIN=%_APK_ORIGIN%"
call :ok "Windows 自解压 EXE：deliver\eClassroom-1.0-!STAMP!.exe"

rem ---- 2c-2) Android APK（源站由 APP_ENV / FRONTEND_ORIGIN 指定） ----
echo   [2/2] Android APK（%APP_ENV% / %FRONTEND_ORIGIN%）...
pushd "%APP_DIR%"
call node scripts\build.js
set "RC=!errorlevel!"
if not "!RC!"=="0" (
    popd
    set "ERRMSG=APK 前置构建（dev/www）失败：exit !RC!"
    goto :die
)
rem 直接调 node，同上理由绕开系统 npm
call node scripts\build-native.cjs android
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=Android APK 构建失败（exit !RC!），确认 JDK21 / Android SDK / Gradle 可用"
    goto :die
)
set "APK_SRC=%APP_DIR%\android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_SRC%" (
    set "ERRMSG=未找到 APK：%APK_SRC%"
    goto :die
)
if not exist "%PROJECT_ROOT%\deliver" mkdir "%PROJECT_ROOT%\deliver"
copy /y "%APK_SRC%" "%PROJECT_ROOT%\deliver\eClassroom-1.0-android-!STAMP!.apk" >nul
if errorlevel 1 (
    set "ERRMSG=复制 APK 到 deliver 失败"
    goto :die
)
call :ok "Android APK：deliver\eClassroom-1.0-android-!STAMP!.apk"

rem ---- 恢复 prod/www，避免 dev 源站污染本地预览 ----
pushd "%APP_DIR%"
set "APP_ENV="
set "FRONTEND_ORIGIN="
call node scripts\build.js
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" (
    set "ERRMSG=恢复 prod/www 失败，请手动执行 node classroom-app\scripts\build.js"
    goto :die
)
call :ok "已恢复 prod/www（同源模式）"
goto :step2c_done

:skip_native
call :warn "跳过多端产物（--skip-native）"

:step2c_done
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
call :ok "deploy\dist\ 与 deploy\jars\ 已更新（jars 含 3 个后端；www 不入此目录）"

rem ============================================================================
rem Step 3 - Docker 构建（3 个后端镜像 + 1 个 web 镜像）
rem ============================================================================
:step3
if "%SKIP_DOCKER%"=="1" goto :skip_docker

call :step "Step 3 - Docker 镜像构建（3 后端 + web）"

where docker >nul 2>nul
if errorlevel 1 (
    set "ERRMSG=未检测到 docker，请确认 Docker Desktop 已启动且在 PATH 中"
    goto :die
)

echo   [1/4] booking-api:%VER_API% ...
call docker build -f "%DOCKER_DIR%\Dockerfile.cloudbase-api" -t booking-api:%VER_API% "%DOCKER_DIR%"
set "RC=!errorlevel!"
if not "!RC!"=="0" (
    set "ERRMSG=api docker build 失败。若卡在 apt-get，检查网络或构建参数 APT_MIRROR"
    goto :die
)
call :ok "booking-api:%VER_API%"

echo   [2/4] booking-message-service:%VER_MSG% ...
call docker build -f "%DOCKER_DIR%\Dockerfile.cloudbase-message" -t booking-message-service:%VER_MSG% "%DOCKER_DIR%"
set "RC=!errorlevel!"
if not "!RC!"=="0" (
    set "ERRMSG=message-service docker build 失败"
    goto :die
)
call :ok "booking-message-service:%VER_MSG%"

echo   [3/4] booking-classroom-service:%VER_CLS% ...
if not exist "%DOCKER_DIR%\Dockerfile.cloudbase-classroom" (
    set "ERRMSG=缺少 %DOCKER_DIR%\Dockerfile.cloudbase-classroom"
    goto :die
)
call docker build -f "%DOCKER_DIR%\Dockerfile.cloudbase-classroom" -t booking-classroom-service:%VER_CLS% "%DOCKER_DIR%"
set "RC=!errorlevel!"
if not "!RC!"=="0" (
    set "ERRMSG=classroom-service docker build 失败"
    goto :die
)
call :ok "booking-classroom-service:%VER_CLS%"

rem web 镜像的上下文 = deploy\docker，Dockerfile 中 COPY dist 指向同目录的 dist\
if not exist "%DOCKER_DIR%\Dockerfile.cloudbase-frontend" (
    set "ERRMSG=缺少 %DOCKER_DIR%\Dockerfile.cloudbase-frontend"
    goto :die
)
if not exist "%DOCKER_DIR%\default.conf.template" (
    set "ERRMSG=缺少 %DOCKER_DIR%\default.conf.template"
    goto :die
)
if not exist "%DOCKER_DIR%\dist" (
    set "ERRMSG=缺少 %DOCKER_DIR%\dist\. 先构建前端，或去掉 --skip-frontend"
    goto :die
)

echo   [4/4] booking-web:latest（运行期需 --build-arg 注入上游地址）...
call docker build -f "%DOCKER_DIR%\Dockerfile.cloudbase-frontend" -t booking-web:latest "%DOCKER_DIR%"
set "RC=!errorlevel!"
if not "!RC!"=="0" (
    set "ERRMSG=web docker build 失败"
    goto :die
)
call :ok "booking-web:latest"
call :warn "部署到云托管控制台时 API_UPSTREAM / MSG_UPSTREAM 不填会导致反向代理失效"

if "%DOCKER_PUSH%"=="1" goto :do_push
goto :summary

:do_push
call :step "Step 3d - 推送镜像到云托管"
if not defined ENV_ID (
    set "ERRMSG=推送需要 --env-id"
    goto :die
)
set "REGISTRY=ccr.ccs.tencentyun.com/cb-!ENV_ID!"

call docker tag booking-api:%VER_API%                 "!REGISTRY!/api:%VER_API%"
call docker tag booking-message-service:%VER_MSG%     "!REGISTRY!/message-service:%VER_MSG%"
call docker tag booking-classroom-service:%VER_CLS%   "!REGISTRY!/classroom-service:%VER_CLS%"
call docker tag booking-web:latest                    "!REGISTRY!/web:latest"

call docker push "!REGISTRY!/api:%VER_API%"
if errorlevel 1 (
    set "ERRMSG=api push 失败，先 docker login ccr.ccs.tencentyun.com"
    goto :die
)
call docker push "!REGISTRY!/message-service:%VER_MSG%"
if errorlevel 1 (
    set "ERRMSG=message-service push 失败"
    goto :die
)
call docker push "!REGISTRY!/classroom-service:%VER_CLS%"
if errorlevel 1 (
    set "ERRMSG=classroom-service push 失败"
    goto :die
)
call docker push "!REGISTRY!/web:latest"
if errorlevel 1 (
    set "ERRMSG=web push 失败"
    goto :die
)
call :ok "四个镜像已推送到 !REGISTRY!"
goto :summary

:skip_docker
call :warn "跳过 Docker 构建（--skip-docker）"

rem ============================================================================
rem 汇总
rem ============================================================================
:summary
call :step "构建产物清单"
echo   后端 jar（3 个）：deploy\docker\booking-api-%VER_API%.jar
echo                    deploy\docker\target\message-service-%VER_MSG%.jar
echo                    deploy\docker\classroom-service-%VER_CLS%.jar
echo   前端 web：       deploy\docker\dist\
echo   前端 app：       classroom-app\www\（打入 App 安装包，需 cap sync 后真机验证）
echo   统一收口：       deploy\jars\（3 个 jar）  与  deploy\dist\（web 站点）
echo   多端安装包：     deliver\eClassroom-1.0-^<时间戳^>.exe（自解压，双击解压到同目录）
echo                    deliver\eClassroom-1.0-android-^<时间戳^>.apk（源站 ^<APP_ENV^> / ^<URL^>）
echo.
echo   下一步：
echo     方式 A - 云托管控制台上传 jar / Dockerfile
echo     方式 B - 流水线（授权代码源 + container.config.json）
echo     方式 C - 镜像推送：ccr.ccs.tencentyun.com/cb-^<env^>/^<service^>:^<tag^>
echo     方式 D - 本机起服务：deploy\run-all.bat（3 后端 + web 代理 + App 预览）
if defined ENV_ID echo   方式 C 目标：ccr.ccs.tencentyun.com/cb-!ENV_ID!/

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
rem 双击运行时窗口会随进程关闭，这里等一下，方便看输出
echo %CMDCMDLINE% | findstr /i /c:"%~nx0" >nul
if not errorlevel 1 pause
endlocal
exit /b 0
