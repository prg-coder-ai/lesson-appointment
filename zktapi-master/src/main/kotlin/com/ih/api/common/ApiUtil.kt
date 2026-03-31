package com.ih.api.common

object ApiUtil {
    //获取温度分表序号
    //subTableCount 分表总数
    //stationCode 设备编号
    fun getTempratureTableNo(subTableCount: Int, stationCode: String): String {
        val no = "0000000000" + Integer.parseInt(stationCode) % subTableCount
        val start = no.length - subTableCount.toString().length
        return "Temprature_"+no.substring(start)
    }
}