package com.ih.api.model

import java.util.*

/* 单个系统的允许报警状态计数----
* id	companyCode	state	addTime	ALARMNO	ALARMCLRNO	ALARMASKNO	alarmCounter
* ALMTEXT	newAlarm	unAckAlarmCounter	enableAlarm
* */
data class AlarmList(var id: Int = -1,
                     var companyCode:String = "",
                     var companyID:Int = -1 ,

                     var ALARMNO: Int = -1,//`
                     var ALARMCLRNO: Int = -1,//
                     var ALARMASKNO: Int = -1,//
                     var alarmCounter: Int = -1,//
                     var ALMTEXT: String = "",//
                     var state: String = "",//
                     var newAlarm: Int =0,//
                     var unAckAlarmCounter: Int =0,//`
                     var enableAlarm:Int =0,//
                     var addTime: String =""//
)

