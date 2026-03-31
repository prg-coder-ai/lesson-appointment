package com.ih.api.service

import com.ih.api.model.AlarmList
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

interface AlarmListService {
    fun get(id:Int):AlarmList?

    /*
    * 获取记录数
    * */
    fun getCount(companyID:Int):Int?

    fun getPaging(companyID:Int,offset:Int,pageSize:Int): List<AlarmList>?
    fun getHistList(companyID:Int,offset:Int,pageSize:Int): List<AlarmList>?
}
