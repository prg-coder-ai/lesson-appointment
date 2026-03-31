package com.ih.api.model

import java.util.*
/*热力公司模型*/
data class company(var id: Int = -1, var name: String = "", var address: String = "", var contact: String = "", var contactWay: String = "", var parentID: Int = -1, var status: Int = 1, var createTime: Date = Date(), var parentCompanyName: String = "")
