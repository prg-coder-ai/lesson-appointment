package com.ih.api.auth

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.logging.log4j.ThreadContext.containsKey
import java.util.HashMap
import com.auth0.jwt.JWTSigner
import com.auth0.jwt.JWTVerifier


class AuthHelper
{
    private val SECRET = "XX#$%()(#*!()!KL<><MQLMNQNQJQK sdfkjsdrow32234545fdf>?N<:{LWPW"

    private val EXP = "exp"

    private val PAYLOAD = "payload"

    /**
     * get jwt String of object
     * @param object
     * the POJO object
     * @param maxAge
     * the milliseconds of life time
     * @return the jwt token
     */
    fun <T> sign(`object`: T, maxAge: Long): String? {
        try {
            val signer = JWTSigner(SECRET)
            val claims = HashMap<String, Any>()
            val mapper = ObjectMapper()
            val jsonString = mapper.writeValueAsString(`object`)
            claims[PAYLOAD] = jsonString
            claims[EXP] = System.currentTimeMillis() + maxAge
            return signer.sign(claims)
        } catch (e: Exception) {
            return null
        }

    }


    /**
     * get the object of jwt if not expired
     * @param jwt
     * @return POJO object
     */
    fun <T> unsign(jwt: String, classT: Class<T>): T? {
        val verifier = JWTVerifier(SECRET)
        try {
            val claims = verifier.verify(jwt)
            if (claims.containsKey(EXP) && claims.containsKey(PAYLOAD)) {
                val exp = claims.get(EXP) as Long
                val currentTimeMillis = System.currentTimeMillis()
                if (exp > currentTimeMillis) {
                    val json = claims.get(PAYLOAD) as String
                    val objectMapper = ObjectMapper()
                    return objectMapper.readValue(json, classT)
                }
            }
            return null
        } catch (e: Exception) {
            return null
        }

    }
}
