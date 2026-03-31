package com.ih.api.model

import java.util.*

/* 机组参数*/
data class Paralist(var id: Int = -1,
                    var stationCode:String = "",
                    var subID:Int = 1,  //subID` int(11) DEFAULT NULL,

                    var fieldsNum: Int = 1, //`fieldsNum` int(11) DEFAULT NULL,
                    var FrameCounter: Int = 0,//`FrameCounter` int(11) DEFAULT NULL,
                    var DataLength: Int = -1,//`DataLength` int(11) DEFAULT NULL,
                   // var AddTime: Date = Date(),//`AddTime` datetime(6) DEFAULT NULL,
                    var AddTime: String ="",//`AddTime` datetime(6) DEFAULT NULL,
                   var ar_RUN: Int = -1,//`p4001` int(11) DEFAULT NULL,
                    var ar_MOD11: Int = -1,//`p4002` int(11) DEFAULT NULL,
                    var ar_OPEN: Float = 1f,//`p4003` double DEFAULT NULL,
                    var ar_TMP11: Float = 1f,//`p4004` double DEFAULT NULL,
                    var ar_MOD21: Int = 1,//`p4005` int(11) DEFAULT NULL,
                    var ar_HZ21: Float = 2f,//`p4006` double DEFAULT NULL,
                    var ar_PT21: Float = 3f,//`p4007` double DEFAULT NULL,
                        var ar_PT31: Float = 0f,//`p4009` double DEFAULT NULL,
                    var ai_TT11: Float = 0f,//`p4011` double DEFAULT NULL,
                    var ai_TT12: Float = 0f,//`p4012` double DEFAULT NULL,
                    var ai_TT21: Float = 0f,//`p4013` double DEFAULT NULL,
                    var ai_TT22: Float = 0f,//`p4014` double DEFAULT NULL,
                    var ai_PT11: Float = 0f,//`p4015` double DEFAULT NULL,
                    var ai_PT12: Float = 0f,//`p4016` double DEFAULT NULL,
                    var ai_PT21: Float = 0f, //`p4017` double DEFAULT NULL,
                    var ai_PT22: Float = 0f,//`p4018` double DEFAULT NULL,

                    var ai_OPEN: Float = 0f,//`p4021` double DEFAULT NULL,

                    var ai_HZ21: Float = 0f,//`p4023` double DEFAULT NULL,
                    var ai_IA21: Float = 0f,//`p4024` double DEFAULT NULL,
                    var ai_ER21: Int = 0,//`p4025` int(11) DEFAULT NULL,
                    var ai_HZ31: Float = 0f,//`p4026` double DEFAULT NULL,
                    var ai_IA31: Float = 0f,//`p4027` double DEFAULT NULL,
                    var ai_ER31: Int = 0,//`p4028` int(11) DEFAULT NULL,
                    var ai_LEVEL: Float = 0f //`p4029` double DEFAULT NULL,

               /*
                    var p4001: Int = -1,//`p4001` int(11) DEFAULT NULL,
                    var p4002: Int = -1,//`p4002` int(11) DEFAULT NULL,
                    var p4003: Float = 0f,//`p4003` double DEFAULT NULL,
                    var p4004: Float = 0f,//`p4004` double DEFAULT NULL,
                    var p4005: Int = 0,//`p4005` int(11) DEFAULT NULL,
                    var p4006: Float = 0f,//`p4006` double DEFAULT NULL,
                    var p4007: Float = 0f,//`p4007` double DEFAULT NULL,

                    var p4009: Float = 0f,//`p4009` double DEFAULT NULL,
                    var p4011: Float = 0f,//`p4011` double DEFAULT NULL,
                    var p4012: Float = 0f,//`p4012` double DEFAULT NULL,
                    var p4013: Float = 0f,//`p4013` double DEFAULT NULL,
                    var p4014: Float = 0f,//`p4014` double DEFAULT NULL,
                    var p4015: Float = 0f,//`p4015` double DEFAULT NULL,
                    var p4016: Float = 0f,//`p4016` double DEFAULT NULL,
                    var p4017: Float = 0f, //`p4017` double DEFAULT NULL,
                    var p4018: Float = 0f,//`p4018` double DEFAULT NULL,

                    var p4021: Float = 0f,//`p4021` double DEFAULT NULL,

                    var p4023: Float = 0f,//`p4023` double DEFAULT NULL,
                    var p4024: Float = 0f,//`p4024` double DEFAULT NULL,
                    var p4025: Int = 0,//`p4025` int(11) DEFAULT NULL,
                    var p4026: Float = 0f,//`p4026` double DEFAULT NULL,
                    var p4027: Float = 0f,//`p4027` double DEFAULT NULL,
                    var p4028: Int = 0,//`p4028` int(11) DEFAULT NULL,
                    var p4029: Float = 0f //`p4029` double DEFAULT NULL,
                */
)

