#!/usr/bin/env pwsh
# ==============================================================================
# build-all.ps1 —— 微信云托管 · 本地预打包一键脚本
# 用法：
#   1. PowerShell 5 / 7：在项目根目录执行
#      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass   # 首次可能需要
#      ./cloudBased/scripts/build-all.ps1
#   2. 参数：
#      -SkipFrontend    跳过前端构建（前端没改动时）
#      -SkipBackend     跳过 Maven 打包（Java 没改动时）
#      -SkipDocker      跳过 docker build（只预打包产物，不打镜像）
#      -DockerPush      构建完镜像后推送到云托管镜像仓库
#      -EnvId           云托管环境 ID（用于 docker tag 命名）
#
# 产物：
#   cloudBased/api/target/booking-api-2.2.0.jar
#   cloudBased/message-service/target/message-service-1.1.0.jar
#   cloudBased/web/dist/...
#
# 镜像（若执行 docker build）：
#   booking-api:2.2.0          booking-message-service:1.1.0          booking-web:latest
# ==============================================================================

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipDocker,
    [switch]$DockerPush,
    [string]$EnvId = ""
)

$ErrorActionPreference = "Stop"

# ---------- 路径 ----------
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$API_DIR      = Join-Path $PROJECT_ROOT "api"
$MSG_DIR      = Join-Path $API_DIR "message-service"
$FE_DIR       = Join-Path $PROJECT_ROOT "frontend"
$CLOUD_API    = Join-Path $PROJECT_ROOT "cloudBased\api"
$CLOUD_MSG    = Join-Path $PROJECT_ROOT "cloudBased\message-service"
$CLOUD_WEB    = Join-Path $PROJECT_ROOT "cloudBased\web"

# ---------- 颜色输出 ----------
function Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Warn ($msg) { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Fail ($msg) { Write-Host "  ❌ $msg" -ForegroundColor Red; exit 1 }

# ==============================================================================
# Step 1 — 后端 Maven 打包
# ==============================================================================
if (-not $SkipBackend) {
    Step "Step 1 — Maven 打包后端服务"

    # 1a. api
    Write-Host "  📦 api (booking-api-2.2.0.jar) ..." -ForegroundColor Gray
    Push-Location $API_DIR
    try {
        mvn clean package -DskipTests -q 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) { Fail "api Maven 构建失败" }
    } finally { Pop-Location }

    # 1b. message-service
    Write-Host "  📦 message-service (message-service-1.1.0.jar) ..." -ForegroundColor Gray
    Push-Location $MSG_DIR
    try {
        mvn clean package -DskipTests -q 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) { Fail "message-service Maven 构建失败" }
    } finally { Pop-Location }

    # 1c. 拷贝到 cloudBased 对应目录
    New-Item -ItemType Directory -Force -Path "$CLOUD_API\target", "$CLOUD_MSG\target" | Out-Null
    Copy-Item "$API_DIR\target\booking-api-2.2.0.jar"          "$CLOUD_API\target\"          -Force
    Copy-Item "$MSG_DIR\target\message-service-1.1.0.jar"      "$CLOUD_MSG\target\"          -Force

    Ok "后端打包完成，jar 已就位"
} else {
    Warn "跳过 Maven 打包 (-SkipBackend)"
}

# ==============================================================================
# Step 2 — 前端构建
# ==============================================================================
if (-not $SkipFrontend) {
    Step "Step 2 — 前端构建 (node build.js)"
    Push-Location $FE_DIR
    try {
        node build.js 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) { Fail "前端构建失败" }
    } finally { Pop-Location }

    # 拷贝 dist 到 cloudBased/web
    if (Test-Path "$CLOUD_WEB\dist") { Remove-Item -Recurse -Force "$CLOUD_WEB\dist" }
    Copy-Item -Recurse "$FE_DIR\dist" "$CLOUD_WEB\"

    Ok "前端构建完成，dist 已就位"
} else {
    Warn "跳过前端构建 (-SkipFrontend)"
}

# ==============================================================================
# Step 3 — 容器镜像构建（可选）
# ==============================================================================
if (-not $SkipDocker) {
    Step "Step 3 — Docker 镜像构建"

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) { Fail "未检测到 docker，请先安装并启动 Docker Desktop" }

    # 3a. api
    Write-Host "  🐳 booking-api:2.2.0 ..." -ForegroundColor Gray
    Push-Location $CLOUD_API
    try { docker build -t "booking-api:2.2.0" . } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail "api docker build 失败" }
    Ok "booking-api:2.2.0"

    # 3b. message-service
    Write-Host "  🐳 booking-message-service:1.1.0 ..." -ForegroundColor Gray
    Push-Location $CLOUD_MSG
    try { docker build -t "booking-message-service:1.1.0" . } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail "message-service docker build 失败" }
    Ok "booking-message-service:1.1.0"

    # 3c. web —— 两个上游：api（8081）与 message-service（8090），是两个独立云托管服务
    $apiInternalHost = if ($EnvId) { "http://api.$EnvId.svc.cluster.local:8081" } else { "http://REPLACE_WITH_API_INTERNAL_HOST:8081" }
    $msgInternalHost = if ($EnvId) { "http://message-service.$EnvId.svc.cluster.local:8090" } else { "http://REPLACE_WITH_MESSAGE_INTERNAL_HOST:8090" }
    Write-Host "  🐳 booking-web:latest  (API_UPSTREAM=$apiInternalHost  MSG_UPSTREAM=$msgInternalHost) ..." -ForegroundColor Gray
    Push-Location $CLOUD_WEB
    try {
        docker build --build-arg "API_UPSTREAM=$apiInternalHost" --build-arg "MSG_UPSTREAM=$msgInternalHost" -t "booking-web:latest" .
    } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail "web docker build 失败" }
    Ok "booking-web:latest"

    # 3d. 可选推送到云托管镜像仓库
    if ($DockerPush) {
        Step "Step 3d — 推送镜像到云托管镜像仓库"
        if (-not $EnvId) { Fail "推送需要 -EnvId <云托管环境ID> 来拼接仓库地址" }

        $registryPrefix = "ccr.ccs.tencentyun.com/cb-$EnvId"
        docker tag "booking-api:2.2.0"              "$registryPrefix/api:2.2.0"
        docker tag "booking-message-service:1.1.0"  "$registryPrefix/message-service:1.1.0"
        docker tag "booking-web:latest"             "$registryPrefix/web:latest"

        docker push "$registryPrefix/api:2.2.0"            ; if ($LASTEXITCODE -ne 0) { Fail "api push 失败" }
        docker push "$registryPrefix/message-service:1.1.0"; if ($LASTEXITCODE -ne 0) { Fail "message-service push 失败" }
        docker push "$registryPrefix/web:latest"           ; if ($LASTEXITCODE -ne 0) { Fail "web push 失败" }
        Ok "3 个镜像已推送到 $registryPrefix"
    }
} else {
    Warn "跳过 Docker 构建 (-SkipDocker) — 产物已就绪，可直接在云托管控制台「上传代码包」部署"
}

# ==============================================================================
# 汇总
# ==============================================================================
Step "构建产物清单"
Write-Host ""
Write-Host "  后端 jar：" -NoNewline -ForegroundColor White
Write-Host "  cloudBased/api/target/booking-api-2.2.0.jar" -ForegroundColor Gray
Write-Host "              cloudBased/message-service/target/message-service-1.1.0.jar" -ForegroundColor Gray
Write-Host "  前端 dist：" -NoNewline -ForegroundColor White
Write-Host "  cloudBased/web/dist/" -ForegroundColor Gray
Write-Host ""
Write-Host "  下一步（部署到云托管）：" -ForegroundColor Yellow
Write-Host "    方式 A — 控制台「上传代码包 / Dockerfile」：直接把 cloudBased/ 推上去"
Write-Host "    方式 B — 流水线（GitHub/Gitee）：授权代码源 → 每个服务放对应 Dockerfile + container.config.json"
Write-Host "    方式 C — 已执行 docker push：控制台「上传镜像」填 $registryPrefix/<服务>:<tag>"
Write-Host ""

Ok "全部完成 ✨"
