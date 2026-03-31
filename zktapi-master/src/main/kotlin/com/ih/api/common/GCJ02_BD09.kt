package com.ih.api.common

object GCJ02_BD09 {
    var pi = 3.141592653589793 * 3000.0 / 180.0

    fun bd09_To_Gcj02_lon(bd_lon:Double,bd_lat:Double):Double
    {
        var x = bd_lon - 0.0065
        var y = bd_lat - 0.006
        var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * pi)
        var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * pi)
        var gg_lon = z * Math.cos(theta)
        return gg_lon
    }

    fun bd09_To_Gcj02_lat(bd_lon:Double,bd_lat:Double):Double
    {
        var x = bd_lon - 0.0065
        var y = bd_lat - 0.006
        var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * pi)
        var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * pi)
        var gg_lat = z * Math.sin(theta)
        return gg_lat
    }
}