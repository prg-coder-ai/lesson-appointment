package com.ih.api.model

/* 报警设置 */
data class Alarmconfig(var id: Int = -1, var lowAlarm2: Double = 0.0, var lowAlarm1: Double = 0.0, var highAlarm1: Double = 0.0, var highAlarm2: Double = 0.0, var color_low2: String = "", var color_low1: String = "", var color_Normal: String = "", var color_High1: String = "", var color_High2: String = "")
