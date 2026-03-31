package com.ih.api.model

import java.util.*

/* 住户模型 */
data class Customer(var id: Int = -1, var name: String = "", var birthday: Date? = null, var gender: Int = -1, var interest: String = "", var phoneNumber: String = "", var cID: String = "", var checkInTime: Date? = null, var account: String = "", var password: String = "", var download: Int = -1, var registered: Int = -1)
