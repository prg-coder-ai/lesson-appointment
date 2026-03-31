package com.ih.api.service

import com.ih.api.model.rtuOnline
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource
import com.ih.api.dal.rtuOnlineMapper


@Service
class RtuOnlineServiceImpl: rtuOnlineService {
    @Resource
    var _Repository: rtuOnlineMapper?=null
    @Transactional(propagation= Propagation.SUPPORTS)
    override fun get(id: Int): rtuOnline?
    {
        return _Repository?.get(id)
    }

    @Transactional(propagation =Propagation.SUPPORTS)
    override fun getCount(companyID:Int,stationID:Int): Int?
    {
        return _Repository?.getCount(companyID,stationID)
    }

    @Transactional(propagation =Propagation.REQUIRED)
    override fun getPaging(companyID: Int,stationID:Int, Orderby:String,offset: Int, pageSize: Int): List<rtuOnline>? {
        return _Repository?.getPaging(companyID,stationID,offset,pageSize)
    }


    @Transactional(propagation =Propagation.REQUIRED)
    override fun getHistList(companyID: Int,stationID:Int, Orderby:String,offset: Int, pageSize: Int): List<rtuOnline>? {
        return _Repository?.getHistList(companyID,stationID,offset,pageSize)
    }
}

