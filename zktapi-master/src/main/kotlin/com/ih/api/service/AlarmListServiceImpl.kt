package com.ih.api.service

import com.ih.api.model.AlarmList
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource
import com.ih.api.dal.AlarmListMapper


@Service
class AlarmListServiceImpl: AlarmListService {
    @Resource
    var _Repository: AlarmListMapper?=null
    @Transactional(propagation= Propagation.SUPPORTS)
    override fun get(id: Int): AlarmList?
    {
        return _Repository?.get(id)
    }

    @Transactional(propagation =Propagation.SUPPORTS)
    override fun getCount(companyID:Int): Int?
    {
        return _Repository?.getCount(companyID)
    }

    @Transactional(propagation =Propagation.REQUIRED)
    override fun getPaging(companyID: Int, offset: Int, pageSize: Int): List<AlarmList>? {
        return _Repository?.getPaging(companyID,offset,pageSize)
    }


    @Transactional(propagation =Propagation.REQUIRED)
    override fun getHistList(companyID: Int, offset: Int, pageSize: Int): List<AlarmList>? {
        return _Repository?.getHistList(companyID,offset,pageSize)
    }
}

