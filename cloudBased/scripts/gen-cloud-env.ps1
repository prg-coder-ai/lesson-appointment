#!/usr/bin/env pwsh
# ==============================================================================
# gen-cloud-env.ps1 —— 微信云托管 · 环境变量生成与注入脚本
#
# 作用：
#   1. 生成强随机密钥（JWT_SECRET / AES_KEY / HMAC_KEY / ACTUATOR_PASSWORD）
#   2. 生成两个服务各自的完整环境变量文件（.env 格式）
#   3. 生成可直接粘进 container.config.json 的 envParams（JSON 格式）
#   4. 校验密钥长度/解码字节数，并拒绝等保 strict-mode 禁止的仓库示例默认值
#
# ★ 幂等设计（很重要）：
#   已存在的 cloudBased/env/cloud.env.* 中的密钥会被**原样复用**，不会重新生成。
#   因为：
#     · 换 JWT_SECRET → 所有已签发 token 立即失效，全员被踢下线
#     · 换 AES_KEY    → 库里已加密字段全部解不开
#     · 换 HMAC_KEY   → 检索索引与已有密文对不上
#   确需轮换时显式加 -Force，并在维护窗口内执行。
#
# 用法（在项目根目录执行）：
#   ./cloudBased/scripts/gen-cloud-env.ps1 `
#       -MySqlHost mysql.<envid>.svc.cluster.local `
#       -DbUser lesson -DbPassword '<真实库密码>' `
#       -CorsOrigins "https://www.yourdomain.com,https://*.tcloudbase.com"
#
#   仅轮换密钥（慎用）：
#   ./cloudBased/scripts/gen-cloud-env.ps1 -Force -DbUser lesson -DbPassword '<真实库密码>'
#
# 产物（全部落在 cloudBased/env/，该目录已 gitignore，不会入库）：
#   cloud.env.api               api 服务 .env（docker run --env-file / systemd EnvironmentFile）
#   cloud.env.message           message-service 服务 .env
#   container.config.api.env.json                  api 的 envParams（粘进 container.config.json）
#   container.config.message.env.json              message-service 的 envParams
#
# ★ 本文件必须保存为 UTF-8 **带 BOM**：PowerShell 5.1 会把无 BOM 的 UTF-8 当 ANSI 读，
#   中文会让解析直接失败（字符串缺少终止符）。改动后别用会丢 BOM 的编辑器保存。
# ==============================================================================

param(
    # 数据库连接（云托管 MySQL 建议用同环境内网地址）
    [string]$MySqlHost = "mysql",
    [string]$MySqlPort = "3306",
    [string]$DbUser = "lesson",
    [string]$DbPassword = "CHANGE_ME",
    [string]$ApiDb   = "lesson_appointment",
    [string]$MsgDb   = "message_center",

    # 等保 P1-3：CORS 允许来源（逗号分隔，不含路径）
    [string]$CorsOrigins = "",

    # 小程序凭据（不填则保留 CHANGE_ME，接口会降级但服务能启动）
    [string]$WechatAppId  = "",
    [string]$WechatSecret = "",

    # 轮换密钥（默认复用已有值）
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# ---------- 路径 ----------
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ENV_DIR      = Join-Path $PROJECT_ROOT "cloudBased\env"

# ---------- 输出辅助 ----------
function Step($m) { Write-Host "`n▶ $m" -ForegroundColor Cyan }
function Ok  ($m) { Write-Host "  ✅ $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ⚠️  $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  ❌ $m" -ForegroundColor Red; exit 1 }

# 打印密钥时脱敏：日志/截图外泄时不会把完整密钥带出去
function Mask($v) {
    if ([string]::IsNullOrEmpty($v)) { return "(空)" }
    if ($v.Length -le 8) { return "*** (len=$($v.Length))" }
    return ($v.Substring(0, 6) + "…" + " (len=$($v.Length))")
}

# ==============================================================================
# 0 — 等保 strict-mode 禁止值（与 application.properties / CryptoUtil 里的常量保持一致）
#     值相同会在启动时抛 IllegalStateException，这里提前拦下，省一轮部署排障。
# ==============================================================================
$DEMO_JWT_PREFIX = "cOzEE8g98aLfgrNzUYuokWQbHcRn8Nu5kBlHay"
$DEMO_AES  = "HVwcdqAh5A6nScL+0CRJYhKPLCI8y1FP9blj3BL9L4g="
$DEMO_HMAC = "Ip0fg8W0iUXc9Iuw/rcsL+DQ3UkJklcATNqjAtwZmMA="
$DEMO_ACTUATOR = "actuator-change-me"

# ==============================================================================
# 1 — 随机数与原语
# ==============================================================================
function New-RandomBytes([int]$n) {
    $buf = New-Object byte[] $n
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buf) } finally { $rng.Dispose() }
    return ,$buf
}

function New-JwtSecret {
    # 48 字节 → Base64 恰好 64 字符（48 能被 3 整除，无 '=' 填充）
    # 再做 URL 安全替换，避免 '+ / =' 在 .env / JSON / shell 里被误解析
    $b = New-RandomBytes 48
    return ([Convert]::ToBase64String($b)).Replace('+', '-').Replace('/', '_')
}

function New-Key32 {
    # CryptoUtil 要求 AES-256 / HMAC-SHA256 的 Base64 32 字节密钥
    $b = New-RandomBytes 32
    return [Convert]::ToBase64String($b)
}

function New-Password([int]$len) {
    # 去掉易混淆字符（0/O、1/l/I），避免运维手抄时输错
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $b = New-RandomBytes $len
    $sb = New-Object System.Text.StringBuilder
    foreach ($x in $b) { [void]$sb.Append($chars[$x % $chars.Length]) }
    return $sb.ToString()
}

# ==============================================================================
# 2 — 读取已有 env（幂等复用）
# ==============================================================================
function Read-Existing([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    # 按第一个 '=' 切分：AES/HMAC 的 Base64 值本身带 '='，不能按所有 '=' 切
    Get-Content $path -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $map[$Matches[1]] = $Matches[2].Trim()
        }
    }
    return $map
}

function Get-Or-New([hashtable]$existing, [string]$name, [scriptblock]$generator) {
    if (-not $Force -and $existing.ContainsKey($name) -and $existing[$name] -and $existing[$name] -ne "CHANGE_ME") {
        return $existing[$name]
    }
    return (& $generator)
}

# ==============================================================================
# 3 — 主流程
# ==============================================================================
Step "环境变量生成"

New-Item -ItemType Directory -Force -Path $ENV_DIR | Out-Null

$apiEnvPath = Join-Path $ENV_DIR "cloud.env.api"
$msgEnvPath = Join-Path $ENV_DIR "cloud.env.message"
$existing   = Read-Existing $apiEnvPath
if ($existing.Count -gt 0 -and -not $Force) { Ok "检测到已有 $apiEnvPath，密钥将复用（加 -Force 才轮换）" }

# ---- 3a. 共享密钥（两个服务必须逐字符一致，否则跨服务校验/解密全失败）----
$jwtSecret        = Get-Or-New $existing "JWT_SECRET"        { New-JwtSecret }
$aesKey           = Get-Or-New $existing "AES_KEY"           { New-Key32 }
$hmacKey          = Get-Or-New $existing "HMAC_KEY"          { New-Key32 }
$actuatorPassword = Get-Or-New $existing "ACTUATOR_PASSWORD" { New-Password 24 }

# ---- 3b. 校验：长度 / 解码字节数 / 禁用默认值 ----
if ($jwtSecret.Length -lt 64) { Fail "JWT_SECRET 长度 $($jwtSecret.Length) < 64（HS512 硬性要求）" }
if ($jwtSecret.StartsWith($DEMO_JWT_PREFIX)) { Fail "JWT_SECRET 是仓库示例默认值，strict-mode 会阻断启动，请加 -Force 重新生成" }

foreach ($pair in @(@("AES_KEY", $aesKey), @("HMAC_KEY", $hmacKey))) {
    $name = $pair[0]; $value = $pair[1]
    if ($name -eq "AES_KEY"  -and $value -eq $DEMO_AES)  { Fail "$name 是仓库示例默认值，strict-mode 会阻断启动，请加 -Force" }
    if ($name -eq "HMAC_KEY" -and $value -eq $DEMO_HMAC) { Fail "$name 是仓库示例默认值，strict-mode 会阻断启动，请加 -Force" }
    try { $raw = [Convert]::FromBase64String($value) } catch { Fail "$name 不是合法 Base64：$value" }
    if ($raw.Length -ne 32) { Fail "$name 解码后应为 32 字节，实际 $($raw.Length) 字节" }
}

if ($actuatorPassword -eq $DEMO_ACTUATOR) { Fail "ACTUATOR_PASSWORD 是默认占位值，cloud 档会阻断启动，请加 -Force" }
if ($actuatorPassword.Length -lt 16)      { Fail "ACTUATOR_PASSWORD 长度 $($actuatorPassword.Length) < 16，给 Actuator 用的口令不该太短" }

Ok "密钥校验通过"
Write-Host "     JWT_SECRET        = $(Mask $jwtSecret)"        -ForegroundColor DarkGray
Write-Host "     AES_KEY           = $(Mask $aesKey)"           -ForegroundColor DarkGray
Write-Host "     HMAC_KEY          = $(Mask $hmacKey)"          -ForegroundColor DarkGray
Write-Host "     ACTUATOR_PASSWORD = $(Mask $actuatorPassword)" -ForegroundColor DarkGray

if ($DbPassword -eq "CHANGE_ME") { Warn "DbPassword 仍是 CHANGE_ME，生成的 env 里会保留占位值，部署前务必替换" }

# ---- 3c. 拼接 JDBC URL（serverTimezone 与容器 TZ=Asia/Shanghai 对齐）----
function New-JdbcUrl([string]$db) {
    return "jdbc:mysql://$MySqlHost`:$MySqlPort/$db?useUnicode=true&characterEncoding=utf8mb4&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true"
}

$corsValue = if ($CorsOrigins) { $CorsOrigins } else { "" }
if ($corsValue -eq "*") { Fail "CorsOrigins 不能是单独的 '*'（配合 allowCredentials=true 等于对全网开放）" }

$wxAppId  = if ($WechatAppId)  { $WechatAppId }  else { "CHANGE_ME" }
$wxSecret = if ($WechatSecret) { $WechatSecret } else { "CHANGE_ME" }

# ==============================================================================
# 4 — 写 .env 文件
# ==============================================================================
$commonHeader = @"
# ==============================================================================
# 由 cloudBased/scripts/gen-cloud-env.ps1 生成 —— 本文件含明文密钥，切勿入库
# 生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
#
# ★ JWT_SECRET / AES_KEY / HMAC_KEY 三项必须与另一服务的同名字段**逐字符一致**：
#   api 负责签发 token、加解密字段；message-service 只校验 token、读同一份加密字段。
#   两边不一致的典型症状：main 站能登录，但消息中心一律 401 / 解密出的字段是乱码。
# ==============================================================================

"@

$apiEnv = $commonHeader + @"
# ---------- 等保 P0-1：严格安全模式（cloud 档强制）----------
APP_SECURITY_STRICT_MODE=true

# ---------- 等保 P1-3：CORS 允许来源（逗号分隔，不含路径；留空=同源部署）----------
APP_CORS_ORIGIN_PATTERNS=$corsValue

# ---------- 数据库 ----------
SPRING_DATASOURCE_URL=$(New-JdbcUrl $ApiDb)
DB_USERNAME=$DbUser
DB_PASSWORD=$DbPassword

# ---------- 共享密钥（与 cloud.env.message 必须相同）----------
JWT_SECRET=$jwtSecret
AES_KEY=$aesKey
HMAC_KEY=$hmacKey

# ---------- 等保 P1-4：Actuator Basic Auth（账号固定 actuator）----------
ACTUATOR_PASSWORD=$actuatorPassword

# ---------- 小程序凭据 ----------
WECHAT_APPID=$wxAppId
WECHAT_SECRET=$wxSecret
"@

$msgEnv = $commonHeader + @"
# ---------- 数据库 ----------
SPRING_DATASOURCE_URL=$(New-JdbcUrl $MsgDb)
DB_USERNAME=$DbUser
DB_PASSWORD=$DbPassword

# ---------- 共享密钥（与 cloud.env.api 必须相同）----------
JWT_SECRET=$jwtSecret
AES_KEY=$aesKey
HMAC_KEY=$hmacKey
"@

# 写 UTF-8 **无 BOM**：docker --env-file / systemd EnvironmentFile 都是按行首字符解析，
# BOM 会让第一行变成不可见字符开头，键名匹配不上（且报错信息完全看不出是这个原因）。
function Write-Utf8NoBom([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Utf8NoBom $apiEnvPath $apiEnv
Write-Utf8NoBom $msgEnvPath $msgEnv
Ok "已写入 cloud.env.api / cloud.env.message"

# ==============================================================================
# 5 — 生成 envParams JSON（可直接粘进 container.config.json）
# ==============================================================================
function ConvertTo-EnvParams([string]$envFileText) {
    $map = [ordered]@{}
    foreach ($line in ($envFileText -split "`r?`n")) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $k = $Matches[1]; $v = $Matches[2].Trim()
            if ($v -ne "") { $map[$k] = $v }   # 空值不注入，交给 properties 默认值
        }
    }
    return ($map | ConvertTo-Json -Depth 4)
}

$apiJsonPath = Join-Path $ENV_DIR "container.config.api.env.json"
$msgJsonPath = Join-Path $ENV_DIR "container.config.message.env.json"
Write-Utf8NoBom $apiJsonPath (ConvertTo-EnvParams $apiEnv)
Write-Utf8NoBom $msgJsonPath (ConvertTo-EnvParams $msgEnv)
Ok "已写入 container.config.*.env.json（复制其中的键值填到 container.config.json 的 envParams）"

# ==============================================================================
# 6 — 下一步指引
# ==============================================================================
Step "部署指引"
Write-Host @"
  产物目录：$ENV_DIR   （该目录已 gitignore，不会入库）

  方式 A — 微信云托管控制台（推荐）
    1) 进入 api 服务 → 环境变量 → 逐项粘贴 container.config.api.env.json 里的键值
    2) 进入 message-service 服务 → 环境变量 → 粘贴 container.config.message.env.json
    3) 两个服务都确认以下三项**完全一致**：
         JWT_SECRET / AES_KEY / HMAC_KEY
    4) 保存并重启两个服务（改环境变量不会自动重启）

  方式 B — 流水线（container.config.json）
    把两份 env.json 的内容填进对应服务 container.config.json 的 "envParams"。
    ⚠️ 该文件通常入库 —— 填真实密钥前请确认仓库为私有，否则等同把密钥公开。
       更稳妥的做法是把密钥交给流水线的变量/密钥管理，运行时注入。

  方式 C — 本地 docker 联调
    docker run --env-file cloudBased/env/cloud.env.api -p 8081:8081 booking-api:2.2.0

  验证（部署后执行，替换 <api-host>）：
    # 1) 健康检查（匿名可访问）
    curl -fsS https://<api-host>/actuator/health
    # 2) Actuator 受保护端点（必须带 Basic 认证，401 说明保护生效）
    curl -s -o /dev/null -w '%{http_code}\n' https://<api-host>/actuator/beans
    curl -s -u actuator:$actuatorPassword https://<api-host>/actuator/beans > /dev/null && echo 'Basic Auth OK'
    # 3) 严格模式生效（故意用示例默认密钥应启动失败，而非静默降级）

  回滚提示：
    排障需临时放宽安全策略时，把 APP_SECURITY_STRICT_MODE 设为 false 并重启；
    问题定位后**必须改回 true**，否则密码强度与密钥校验都会降级。
"@
