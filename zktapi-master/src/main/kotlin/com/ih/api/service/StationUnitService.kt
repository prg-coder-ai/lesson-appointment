package com.ih.api.service

import com.ih.api.model.StationUnit

interface StationUnitService {
    fun get(id:Int):StationUnit?

    /*
    * 获取记录数
    * */
    fun getCount(companyID:Int,stationID:Int):Int?

    /*
    * 分页函数
    * offset：起始记录位置
    * pageSize：页容量
    * orderBy：排序条件
    * */
    fun getPaging(companyID:Int,stationID:Int,offset:Int,pageSize:Int): List<StationUnit>?

}
