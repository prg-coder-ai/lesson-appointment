package com.ih.api.service

import com.ih.api.model.Paralist
//import com.ih.api.model.Temprature
import org.apache.ibatis.annotations.Param
import java.util.*


interface ParalistHistoryService {

    fun insert(model: Paralist): Int?

    fun update(model: Paralist): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): Paralist?

/*历史表  查询指定换热站/机组，指定时间范围内的，指定参数paraidx的范围的记录
* */   /* , paraName: String, minTemp: Float, maxTemp: Float,*/
    fun getCount( stationID: Int, subID: Int
                  /*,minDate:Date,maxDate:Date*/
): Int?
    /*paraIdx: Int ,minTemp: Float, maxTemp: Float,*/
    fun getPaging( stationID: Int, subID: Int,
                  /* minDate:Date,maxDate:Date,*/
                   offset: Int, pageSize: Int, orderBy: String): List<Paralist>?

}
