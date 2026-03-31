package com.ih.api.service

import com.ih.api.model.rtustation
import org.apache.ibatis.annotations.Param

interface RtuStationService {

    fun insert(model: rtustation): Int?

    fun update(model:rtustation):Int?

    fun delete(id:Int): Int?

    fun get(id:Int):rtustation?

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
    fun getPaging(companyID:Int,stationID:Int,stationName:String,offset:Int,pageSize:Int,orderBy:String): List<rtustation>?
    fun getByName( StatioName : String ): rtustation?
}
