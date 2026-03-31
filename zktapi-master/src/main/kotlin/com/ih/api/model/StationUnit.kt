package com.ih.api.model

import java.util.*

/* 换热机组查询模型-名称、ID */
data class StationUnit(var id: Int = -1,
                       var companyID: Int = 0,
                       var stationID: Int = -1,
                       var subID: Int = -1,

                       var companyName: String = "",
                       var stationName: String = "",
                       var stationCode: String = "",
                       var unitName: String = "",
                       var mem:String="")
