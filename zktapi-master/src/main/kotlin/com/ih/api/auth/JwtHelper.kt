package com.ih.api.auth

import javax.crypto.spec.SecretKeySpec
import javax.xml.bind.DatatypeConverter
import io.jsonwebtoken.Claims
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.SignatureAlgorithm
import java.util.*

object JwtHelper {
    /**
     * 解析jwt
     */
    fun parseJWT(jsonWebToken: String, base64Security: String): Claims? {
        try {
           /* val claims = Jwts.parser()
                    .setSigningKey(DatatypeConverter.parseBase64Binary(base64Security))
                    .parseClaimsJws(jsonWebToken).getBody()*/
            val claims= Jwts.parser()
                    .setSigningKey(DatatypeConverter.parseBase64Binary(base64Security))
                    .parseClaimsJws(jsonWebToken).getBody()
            return claims
        } catch (ex: Exception) {
            return null
        }

    }

    /**
     * 构建jwt
     */
    fun createJWT(name: String,account:String, userId: String, role: String,
                  audience: String, issuer: String, TTLMillis: Long, base64Security: String): String {
        val signatureAlgorithm = SignatureAlgorithm.HS256

        val nowMillis = System.currentTimeMillis()
        val now = Date(nowMillis)


        //生成签名密钥
        val apiKeySecretBytes = DatatypeConverter.parseBase64Binary(base64Security)
        val signingKey = SecretKeySpec(apiKeySecretBytes, signatureAlgorithm.getJcaName())

        //添加构成JWT的参数
        val builder = Jwts.builder().setHeaderParam("typ", "JWT")
                .claim("role", role)
                .claim("name", name)
                .claim("account", account)
                .claim("userid", userId)
                .setIssuer(issuer)
                .setHeaderParam("Access-Control-Allow-Origin","*")
                .setAudience(audience)
                .signWith(signatureAlgorithm, signingKey)
        //添加Token过期时间
        if (TTLMillis >= 0) {
            val expMillis = nowMillis + TTLMillis
            val exp = Date(expMillis)
            builder.setExpiration(exp).setNotBefore(now)
        }

        //生成JWT
        return builder.compact()
    }
}