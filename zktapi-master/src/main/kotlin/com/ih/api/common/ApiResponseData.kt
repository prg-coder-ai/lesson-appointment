package com.ih.api

class ApiResponseData {
    constructor()
    {
        status="ok"
        message=""
        data= mutableMapOf<String, Any?>()
    }
    var status:String
    var message: String
    var data:MutableMap<String,Any?>
    fun putDataValue(key: String, value: Any?) {
        data.put(key,value)
        status="ok"
    }
    companion object  {
        fun putErrValue(err: List<String>): ApiResponseData {
            var responseData=ApiResponseData()
            responseData.status="fail"
            responseData.message+=" "+err.joinToString()
            return responseData;
        }
    }

}