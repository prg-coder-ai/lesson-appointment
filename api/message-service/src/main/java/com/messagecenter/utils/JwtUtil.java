package com.messagecenter.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 工具：与主系统共享同一 jwt.secret，主系统签发的 AccessToken 可在此直接校验。
 * HS512 签名。Claims: sub=userId, role, tenantId。
 */
@Component
public class JwtUtil {

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
        if (token == null) return "";
        return token.replace("Bearer ", "");
    }

    /** 本地自签（测试/系统触发场景使用） */
    public String generateToken(Long tenantId, String userId, String role) {
        Date now = new Date();
        Date expireDate = new Date(now.getTime() + expiration);
        return Jwts.builder()
                .setSubject(userId)
                .claim("role", role)
                .claim("tenantId", tenantId)
                .setIssuedAt(now)
                .setExpiration(expireDate)
                .signWith(signingKey, SignatureAlgorithm.HS512)
                .compact();
    }

    public boolean verifyAccessToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(signingKey).build()
                    .parseClaimsJws(stripBearerPrefix(token));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Claims parse(String token) {
        return Jwts.parserBuilder().setSigningKey(signingKey).build()
                .parseClaimsJws(stripBearerPrefix(token)).getBody();
    }

    public String getUserIdFromToken(String token) { return parse(token).getSubject(); }
    public String getRoleFromToken(String token) { return parse(token).get("role", String.class); }
    public Long getTenantId(String token) {
        Object v = parse(token).get("tenantId");
        return v == null ? null : Long.valueOf(v.toString());
    }
}
