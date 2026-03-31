package com.ih.api.model

import java.util.*

/* 测温点信息 */
data class Room(var id: Int = -1, var customerID: Int = -1, var lati: Double, var longi: Double, var height: Float, var communityID: Int = -1, var buildingID: Int = -1, var subNumber: Int = -1, var floorNumber: Int = -1, var apartNumber: Int = -1, var roomName: String = "", var sideRoom: Int = -1, var roomArea: Float, var status: Int = 1, var createrID: Int = -1, var createTime: Date = Date())
