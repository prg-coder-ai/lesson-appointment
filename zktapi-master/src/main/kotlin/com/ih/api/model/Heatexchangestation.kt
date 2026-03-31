package com.ih.api.model

import java.util.*

/* 换热站模型 */
data class Heatexchangestation(var id: Int = -1, var name: String = "",
                               var companyID: Int = -1, var lati: Double = 0.0,
                               var longi: Double = 0.0, var height: Float = 0f,
                               var note1: String = "", var note2: String = "",
                               var status: Int = 1, var createrID: Int = -1,
                               var createTime: Date = Date(), var parentID: Int = 0,
                               var companyName: String = "", var parentName: String = "",
                               var heatingArea: Double = 0.0,
                                var StationCode:String="",var UnitNumber:Int=-1)
