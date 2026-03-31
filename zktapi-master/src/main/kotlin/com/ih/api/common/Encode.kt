package com.ih.api.common

import java.nio.charset.Charset
import java.util.*
import java.util.Base64.getEncoder
import java.util.Base64.getDecoder



class Encode {
    /*base64编码*/
    fun Base64Encode(text:String):String
    {
        val encoder = Base64.getEncoder()
        val textByte = text.toByteArray(charset("UTF-8"))
        val encodedText = encoder.encodeToString(textByte)
        return encodedText
    }
    /*base64解码*/
    fun Base64Decode(text:String):String
    {
        val decoder = Base64.getDecoder()
        return String(decoder.decode(text), Charset.forName("UTF-8"))
    }


}