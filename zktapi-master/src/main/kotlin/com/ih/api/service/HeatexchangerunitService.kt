package com.ih.api.service

import com.ih.api.model.Heatexchangerunit

interface HeatexchangerunitService {

    fun insert(model: Heatexchangerunit): Int?

    fun update(model: Heatexchangerunit): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): Heatexchangerunit?

    /*
    * 获取记录数
    * */
    fun getCount(unitNumber: String, crewID: String, companyID: Int, stationID: Int): Int?

    /*
    * 分页函数
    * userID：用户ID
    * type：消费类型（0：充值，1：消费）
    * offset：起始记录位置
    * pageSize：页容量
    * orderBy：排序条件
    * */
    fun getPaging(unitNumber: String, crewID: String,companyID: Int, stationID: Int, offset: Int, pageSize: Int, orderBy: String): List<Heatexchangerunit>?

    fun getByName(unitNumber: String, stationID: Int): Heatexchangerunit?

}
