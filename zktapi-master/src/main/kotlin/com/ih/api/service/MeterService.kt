package com.ih.api.service

import com.ih.api.model.MeterPara
interface MeterService {
    fun get(id: Int): MeterPara?

/*历史表  查询指定换热站，指定时间范围内的，
* */
    fun getCount( companyID: Int,stationID: Int
): Int?

    fun getPaging(  companyID: Int,stationID: Int,
                   offset: Int, pageSize: Int, orderBy: String): List<MeterPara>?

}
