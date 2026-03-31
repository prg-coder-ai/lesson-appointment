package com.ih.api.model

import java.util.*

/* 员工模型 */
data class employee(var id: Int = -1, var account: String = "", var password: String = "", var name1: String = "", var name2: String = "", var stationID: Int = -1, var companyID: Int = -1, var department: String = "", var privilege: Int = -1, var status: Int = 1, var createrID: Int = -1, var createTime: Date = Date(), var name: String = "", var companyName: String = "", var stationName: String = "")
