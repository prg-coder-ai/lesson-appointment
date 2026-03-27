package src.main.java.com.reservation.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Date;

/**
 * JWT工具类，用于生成、解析Token，对应设计2.3 安全设计-Token加密
 */
@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private Long expiration;

    // 生成Token（对应设计2.2.1 登录、学生注册返回Token）
    public String generateToken(String userId, String role) {
        Date now = new Date();
        Date expireDate = new Date(now.getTime() + expiration);
        return Jwts.builder()
                .setSubject(userId)  // 存储用户ID
                .claim("role", role)  // 存储角色信息
                .setIssuedAt(now)
                .setExpiration(expireDate)
                .signWith(SignatureAlgorithm.HS512, secret)
                .compact();
    }

    // 解析Token，获取用户ID
    public String getUserIdFromToken(String token) {
        Claims claims = Jwts.parser()
                .setSigningKey(secret)
                .parseClaimsJws(token.replace("Bearer ", ""))
                .getBody();
        return claims.getSubject();
    }

    // 解析Token，获取角色
    public String getRoleFromToken(String token) {
        Claims claims = Jwts.parser()
                .setSigningKey(secret)
                .parseClaimsJws(token.replace("Bearer ", ""))
                .getBody();
        return (String) claims.get("role");
    }

    // 校验Token是否过期,boolean isTokenExpired(String token) 方法用于检查Token是否过期，返回true表示过期，false表示未过期。
    // 解析Token获取过期时间，并与当前时间进行比较，如果过期时间在当前时间之前，则表示Token已过期。
    //
    public boolean isTokenExpired(String token) {
        Claims claims = Jwts.parser()
                .setSigningKey(secret)
                .parseClaimsJws(token.replace("Bearer ", ""))
                .getBody();
        Date expirationDate = claims.getExpiration();
        return expirationDate.before(new Date());
    }

public String getCurrentUserId(String token) {
        //读取当前的session或者SecurityContextHolder中的认证信息，获取当前用户的Token，然后调用getUserIdFromToken方法解析出用户ID并返回。
        // 这里需要获取当前请求的Token，通常通过Spring Security的上下文获取
        // 例如：SecurityContextHolder.getContext().getAuthentication().getPrincipal()
        // 但具体实现可能需要根据你的安全配置进行调整
        //context.getAuthentication().getCredentials() 获取Token

        return getUserIdFromToken(token);
    }

    public String getCurrentUserId() {
        String token= getCurrentToken();

        return getUserIdFromToken(token);
    }
     //从会话中获取token    p
     public String getCurrentToken() {
         // 这里需要获取当前请求的Token，通常通过Spring Security的上下文获取
         // 例如：SecurityContextHolder.getContext().getAuthentication().getCredentials()
         // 但具体实现可能需要根据你的安全配置进行调整
         return (String) SecurityContextHolder.getContext().getAuthentication().getCredentials();
     }
     //设置本地token无效
     public boolean invalidateToken(String user)
     {
     // 设置本地token为空
     // 这里只是本地让SecurityContextHolder中的Token失效（实际场景下需要配合缓存/数据库等机制以彻底失效）
     SecurityContextHolder.clearContext();
     // TODO: 清除与该用户相关的Token缓存（如使用Redis等中间件，需要在此处删除缓存中的Token记录）
     // 示例（伪代码，需根据你的实际缓存实现）:
     // redisTemplate.delete("USER_TOKEN_" + user);
        return true;// 
     }
}
