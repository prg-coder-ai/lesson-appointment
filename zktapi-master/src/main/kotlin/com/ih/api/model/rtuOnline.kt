package com.ih.api.model

import java.util.*

/* 单个RTU状态在线/离线，报警/正常---
rtuOnline
* */
data class rtuOnline(var id: Int = -1,
                     var companyName:String = "",
                     var stationCode:String = "",
                     var companyID:Int = -1,
                     var stationID:Int = -1,
                     var stationName:String ="",
                     var state: String = "",//
                     var newAlarm: Int =0,//
                     var offline: Int =0,//`
                     var addTime: String =""//
)

