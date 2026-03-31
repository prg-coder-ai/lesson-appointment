package com.ih.api

class ResponsePagingData {
    constructor()
    {
        Records= mutableListOf<Any?>()
    }
    var Result:String="OK"
    var TotalRecordCount:Int=0
    var Message:String=""
    var Records:MutableList<Any?>

    companion object  {
    }

}