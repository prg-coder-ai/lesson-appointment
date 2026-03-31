package com.ih.api.model

import java.util.*

/* 换热站机组模型 */
data class Heatexchangerunit(var id: Int = -1, var stationID: Int = -1, var unitNumber: String = "", var createTime: Date = Date(), var createrID: Int = -1, var address: String = "", var stationName: String = "", var companyID: Int = 0, var companyName: String = "",var crewID:String="",var updateDesc:String="")
