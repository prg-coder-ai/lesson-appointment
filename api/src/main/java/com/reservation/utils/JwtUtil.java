package com.reservation.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

//import javax.annotation.PostConstruct;
import jakarta.annotation.PostConstruct;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
/**
 * JWT工具类，用于生成、解析Token，对应设计2.3 安全设计-Token加密
 */

@Component

public class JwtUtil {
    // RefreshToken 7天
    private static final long REFRESH_EXPIRE = 7 * 24 * 60 * 60 * 1000;
    // 密钥
   // private static final String SECRET = "your-jwt-secret-key-2024";
   // private static final JWTSigner = JWTSignerUtil.hs256(SECRET.getBytes(StandardCharsets.UTF_8));
   // private static final long EXPIRE_TIME = 24 * 60 * 60 * 1000L;

    @Value("${jwt.secret}")
    private String secret;


    @Value("${jwt.expiration}")
    private Long expiration;

    private SecretKey signingKey; 
    @PostConstruct
    private void initSigningKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 64) {
            throw new IllegalStateException("jwt.secret 长度不足，HS512 至少需要 64 字节");
        } 
        signingKey = Keys.hmacShaKeyFor(keyBytes);
        
        //expiration = Long.parseLong(expiration.toString()); 
    }
 

    private String stripBearerPrefix(String token) {
        if (token == null) {
                        return "";
        } 
        return token.replace("Bearer ", "");
    }



    // 生成短期访问 Token（对应设计2.2.1 登录、学生注册返回Token）
    // 【P1 安全加固 2026-10-28】新增 "type": "access" claim，防止 access token 被当成 refresh token 使用
    public String generateToken(Long tenantId, String userId, String role) {
        Date now = new Date();
        Date expireDate = new Date(now.getTime() + expiration);
        return Jwts.builder()
                .setSubject(userId)
                .claim("role", role)
                .claim("tenantId", tenantId) // 添加租户ID到claims
                .claim("type", "access")     // ← 新增：区分 access / refresh
                .setIssuedAt(now)
                .setExpiration(expireDate)  
                .signWith(signingKey, SignatureAlgorithm.HS512)
                .compact();
    } 

    // 生成长期刷新 Token
    // 【P1 安全加固 2026-10-28】新增 "type": "refresh" claim；不再存 role（角色变更时查 user 表实时取）
    public String generateRefreshToken(Long tenantId, String userId) {
        Date expire = new Date(System.currentTimeMillis() + REFRESH_EXPIRE);
        return Jwts.builder()
                .setSubject(userId)
                .claim("tenantId", tenantId)
                .claim("type", "refresh")    // ← 新增：区分 access / refresh
                .setExpiration(expire)
                .signWith(signingKey, SignatureAlgorithm.HS256)
                .compact();
    }
 

    // 解析 Token，获取用户 ID
    public String getUserIdFromToken(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token))
                .getBody();

        return claims.getSubject();
    } 

    // 解析 Token，获取角色
    public String getRoleFromToken(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token))
                .getBody();
        return (String) claims.get("role");
    }
 
    public Long getTenantId(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token))
                .getBody();
        return Long.valueOf(claims.get("tenantId").toString());
    }

    // 【P1 安全加固 2026-10-28】从 token 读取 type claim
    // access / refresh 两种，用于 refreshToken 接口校验传入的确实是 refresh token 而非 access token
    public String getTokenType(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token))
                .getBody();
        return (String) claims.get("type");
    }

    /**
     * 【P1 安全加固 2026-10-28】校验给定 token 是否是指定类型。
     *
     * <p><b>兼容性设计</b>：type claim 是本次加固新增的。v1 老 refresh token 没有
     * type 字段。此时 type 不存在 → 返回 true（放行），让 DB 层 checkValidToken 兜底
     * （DB 表里只存 refresh token，access token 进不来）。
     * 同时 refreshToken 接口里 DB 校验后还有一轮 JWT userId 与 DB userId 的二次比对，
     * 所以老 token 链路依然安全。
     *
     * <p>对于新签发的 token，type 必须严格匹配。
     *
     * @param token JWT 字符串（可带 Bearer 前缀）
     * @param expectedType "access" 或 "refresh"
     * @return true=签名合法+未过期+(type 缺失 或 type 匹配)
     */
    public boolean isTokenOfType(String token, String expectedType) {
        try {
            String actual = getTokenType(token);
            // type 不存在 → 兼容老 token，放行（DB 层兜底）
            if (actual == null) {
                return true;
            }
            return expectedType.equals(actual);
        } catch (Exception e) {
            // 签名错误 / 过期 / 格式坏 → 都返回 false
            return false;
        }
    }

    // 获取刷新 Token 过期时间（存入数据库）
    public LocalDateTime getRefreshExpireTime() {
        return new Date(System.currentTimeMillis() + REFRESH_EXPIRE)
                .toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDateTime();
    }



    // 更新getUserIdByRefreshToken方法以解析tenantId并设置到TenantContext
    // 从刷新 Token 解析用户 ID
    public String getUserIdByRefreshToken(String token) {
        Jws<Claims> claimsJws = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token));
        Claims claims = claimsJws.getBody();
        Long tenantId = claims.get("tenantId", Long.class);
       // TenantContext.setTenantId(tenantId);//？
        return claims.getSubject();
    }
 
     public Long getTenantIdByRefreshToken(String token) {
        Jws<Claims> claimsJws = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token));
        Claims claims = claimsJws.getBody();
        Long tenantId = claims.get("tenantId", Long.class);
      //  TenantContext.setTenantId(tenantId);//？
        return tenantId;
    }

    // 校验 AccessToken（拦截器鉴权使用）
    public boolean verifyAccessToken(String token) {
        try {
            Jwts.parserBuilder()
                    .setSigningKey(signingKey)
                    .build()
                    .parseClaimsJws(stripBearerPrefix(token));
            return true;
        } catch (Exception e) {
            return false;
        }
    }
 public   boolean verify(String token) {
        try {
            return verifyAccessToken(token );
        } catch (Exception e) {
            return false;
        }
    }
    /**
     * 判断JWT Token是否已过期
     *
     * 原理说明：
     * 本函数首先会用内部的签名密钥（signingKey）对传入的token进行解码和验证，
     * 解析出Claims（即JWT的内容体）。从Claims中获取"exp"（过期时间）字段，
     * 并将其与当前系统时间进行比较。如果token的过期时间早于当前时间，说明token已经过期，则返回true；
     * 否则token尚未过期，返回false。
     */
    public boolean isTokenExpired(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token))
                .getBody();

        Date expirationDate = claims.getExpiration();
        // 如果expirationDate在当前时间之前，说明已过期
        return expirationDate.before(new Date());
    }



    public String getCurrentUserId(String token) {
        return getUserIdFromToken(token);
    }



    public String getCurrentUserId() {
        String token = getCurrentToken();
        return getUserIdFromToken(token);
    }

    public Long getCurrentTenantId() {
        String token = getCurrentToken();
        return getTenantIdByRefreshToken(token);
    } 

    public String getCurrentToken() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getCredentials();

    } 

    public boolean invalidateToken(String user) {
        SecurityContextHolder.clearContext();
        return true;
    }
}

