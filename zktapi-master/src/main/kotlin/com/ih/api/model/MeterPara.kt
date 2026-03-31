package com.ih.api.model

import java.util.*

/* 热表参数*/
data class MeterPara(var id: Int = -1,
                     var stationCode:String = "",
                     var AddTime: Date = Date(),//`AddTime` datetime(6) DEFAULT NULL,
                        // var rsv1: Int = 1,//`p30001` int(11) DEFAULT NULL,
                     var ai_HeatAcc: Float = 2f,//`p30002`` double DEFAULT NULL,
                     var ai_HeatCur: Float = 3f,//`p30004` double DEFAULT NULL,
                     var ai_Heat_flow_acc: Float = 0f,//`p30006` double DEFAULT NULL,
                     var ai_Heat_flow_cur: Float = 0f,//`p30008` double DEFAULT NULL,
                     var ai_Heat_temp_in: Float = 0f,//`p30010` double DEFAULT NULL,
                     var ai_Heat_temp_out: Float = 0f,//`p30011` double DEFAULT NULL,
                        // var rsv2: Float = 0f,//`p30012` double DEFAULT NULL,
                     var ai_Water_acc: Float = 0f,//`p30013` double DEFAULT NULL,
                     var ai_Water_cur: Float = 0f,//`p30015` double DEFAULT NULL,
                        // var rsv3: Float = 0f, //`p30017` double DEFAULT NULL,
                     var ai_Elec_Acc: Float = 0f,//`p30018` double DEFAULT NULL,
                     var ai_Elec_cur: Float = 0f,//`p30020 double DEFAULT NUL
                     var ai_Elec_factor: Float = 0f//`p30022` double DEFAULT NULL,

)

