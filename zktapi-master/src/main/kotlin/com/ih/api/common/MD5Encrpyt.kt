package com.ih.api.common

import java.security.MessageDigest

object MD5Encrpyt {

    private val hexDigIts = arrayOf("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f")

    /**
     * MD5加密
     *
     * @param origin      字符
     * @return
     */
    fun MD5Encode(origin: String): String? {
        var resultString: String? = null
        try {
            resultString = origin
            val md = MessageDigest.getInstance("MD5")
            resultString = byteArrayToHexString(md.digest(resultString!!.toByteArray(charset("utf-8"))))
        } catch (e: Exception) {
        }

        return resultString
    }

    fun byteArrayToHexString(b: ByteArray): String {
        val resultSb = StringBuffer()
        for (i in b.indices) {
            resultSb.append(byteToHexString(b[i]))
        }
        return resultSb.toString()
    }

    fun byteToHexString(b: Byte): String {
        var n = b.toInt()
        if (n < 0) {
            n += 256
        }
        val d1 = n / 16
        val d2 = n % 16
        return hexDigIts[d1] + hexDigIts[d2]
    }
}
