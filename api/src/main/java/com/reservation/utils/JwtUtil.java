package com.reservation.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import javax.annotation.PostConstruct;
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
    }



    private String stripBearerPrefix(String token) {
        if (token == null) {
                        return "";
        } 
        return token.replace("Bearer ", "");
    }



    // 生成短期访问 Token（对应设计2.2.1 登录、学生注册返回Token） 
    public String generateToken(String userId, String role) {
        Date now = new Date();
        Date expireDate = new Date(now.getTime() + expiration);
        return Jwts.builder()
                .setSubject(userId)
                .claim("role", role)
                .setIssuedAt(now)
                .setExpiration(expireDate)
                .signWith(signingKey, SignatureAlgorithm.HS512)
                .compact();
    }



    // 生成长期刷新 Token 
    public String generateRefreshToken(String userId) {
        Date expire = new Date(System.currentTimeMillis() + REFRESH_EXPIRE);
        return Jwts.builder()
                .setSubject(userId)
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



    // 获取刷新 Token 过期时间（存入数据库）
    public LocalDateTime getRefreshExpireTime() {
        return new Date(System.currentTimeMillis() + REFRESH_EXPIRE)
                .toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDateTime();
    }



    // 从刷新 Token 解析用户 ID
    public String getUserIdByRefreshToken(String token) {
        Jws<Claims> claimsJws = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token));
        return claimsJws.getBody().getSubject();
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



    public String getCurrentToken() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getCredentials();

    }



    public boolean invalidateToken(String user) {
        SecurityContextHolder.clearContext();
        return true;
    }
}

