package com.ih.api
/*请求返回数据的容器*/
class ResponseData {
    constructor()
    {
        error= mutableListOf<String>()
        data= mutableMapOf<String, Any?>()
    }
    var error: kotlin.collections.MutableList<String>;
    var data:MutableMap<String,Any?>
    fun putDataValue(key: String, value: Any?) {
        data.put(key,value)
    }

    companion object  {
        fun putErrValue(err: List<String>): ResponseData {
            var responseData=ResponseData()
            responseData.error.addAll(err)
            return responseData;
        }
        var errKeys="error"
    }

}