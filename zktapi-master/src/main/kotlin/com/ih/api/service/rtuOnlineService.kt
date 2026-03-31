package com.ih.api.service

import com.ih.api.model.rtuOnline
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

interface rtuOnlineService {
    fun get(id:Int):rtuOnline?
    fun getCount(companyID:Int,stationID:Int): Int?

    fun getPaging(companyID:Int,stationID:Int, Orderby:String,offset:Int,pageSize:Int): List<rtuOnline>?
    fun getHistList(companyID:Int,stationID:Int, Orderby:String,offset:Int,pageSize:Int): List<rtuOnline>?
}
