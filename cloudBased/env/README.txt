# ==============================================================================
# 环境变量占位符索引 —— 对照手册 6.2 节变量清单完整覆盖
# 密钥一律走云托管「加密变量」（控制台不直显）
# 示例值仅供参考格式/长度，上线前必须替换为自己的真实值
# ==============================================================================

# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# 变量名                              | 示例值 / 格式提示                              | 是密钥？ | api 服务 | message-service |
# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
DB_USERNAME                           | root 或 lesson_app（普通字符串）                | 否      |    ✅    |       ✅         |
DB_PASSWORD                           | L3sson@2026（建议 12~20 位，含大小写+数字+符号）| **是**  |    ✅    |       ✅         |
SPRING_DATASOURCE_URL                 | jdbc:mysql://10.0.0.15:3306/lesson_appoint...  | 否      |    ✅    |       ✅         |
JWT_SECRET                            | ≥64 字节纯字符串，例：YWhNkbPEpaJxWvFFfxMC...   | **是**  |    ✅    |    ✅ 必须一致    |
AES_KEY                               | Base64，解码后精确 32 字节：dHfyfh1Wpg7aCBF8... | **是**  |    ✅    |    ✅ 必须一致    |
HMAC_KEY                              | Base64，解码后建议 32 字节：hb8WyEJ/w2hed9Yu... | **是**  |    ✅    |    ✅ 必须一致    |
WECHAT_APPID                          | 18 位数字字符串：wxabc123def456ghi789           | 否      |    ✅    |       ❌         |
WECHAT_SECRET                         | 32 位小写十六进制：1a2b3c4d5e6f7a8b9c0d1e2f...  | **是**  |    ✅    |       ❌         |
WECHAT_OPEN_APPID                     | 开放平台 AppID：wxd1234567890abcdef             | 否      |    ✅    |       ❌         |
WECHAT_OPEN_SECRET                    | 32 位小写十六进制：2b3c4d5e6f7a8b9c0d1e2f3a...  | **是**  |    ✅    |       ❌         |
WECHAT_OPEN_REDIRECT_URI              | 仅域名，无协议无路径：auth.example.com         | 否      |    ✅    |       ❌         |
TZ                                    | Asia/Shanghai（固定值）                         | 否      |    ✅    |       ✅         |
# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

# 密钥生成命令（本机 Node 环境即可）：
# - JWT_SECRET:      node -e "require('crypto').randomBytes(48).toString('base64')"  （UTF-8 ≥ 64 字节）
# - AES_KEY:         node -e "require('crypto').randomBytes(32).toString('base64')" （精确 32 字节 → Base64 44 字符）
# - HMAC_KEY:        node -e "require('crypto').randomBytes(32).toString('base64')" （同上）
#
# 约束来源（后端校验）：
# - JWT_SECRET ≥ 64 字节 UTF-8  —— JwtUtil.java L44-46，HS512 签名要求
# - AES_KEY 解码后 == 32 字节   —— CryptoUtil.java L44-46，AES-256-GCM 要求
# - HMAC_KEY 解码后建议 32 字节 —— CryptoUtil.java L48-50，HMAC-SHA256 推荐长度
