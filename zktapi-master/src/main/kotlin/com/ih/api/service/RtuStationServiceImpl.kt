package com.ih.api.service

import com.ih.api.model.rtustation
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource
import com.ih.api.dal.RtuStationMapper
import org.apache.ibatis.annotations.Param

@Service
class RtuStationServiceImpl: RtuStationService {
    @Resource
    var RtuStationRepository: RtuStationMapper?=null

    @Transactional(propagation =Propagation.REQUIRED)
    override fun insert(model:rtustation): Int?
    {
        return RtuStationRepository?.insert(model)
    }

    @Transactional(propagation =Propagation.REQUIRED)
    override fun update(model:rtustation): Int?
    {
        return RtuStationRepository?.update(model)
    }

    @Transactional(propagation= Propagation.SUPPORTS)
    override fun get(id: Int): rtustation?
    {
        return RtuStationRepository?.get(id)
    }
    
    @Transactional(propagation =Propagation.REQUIRED)
    override fun getPaging(companyID:Int,stationID:Int,stationName:String, offset:Int,pageSize:Int,orderBy:String):
            List<rtustation>?
    {
        return RtuStationRepository?.getPaging(companyID,stationID,stationName,offset,pageSize,orderBy)
    }

    @Transactional(propagation =Propagation.SUPPORTS)
    override fun getCount(companyID:Int,stationID:Int): Int?
    {
        return RtuStationRepository?.getCount(companyID,stationID )
    }

    @Transactional(propagation =Propagation.REQUIRED)
    override fun delete(id:Int): Int?
    {
        return RtuStationRepository?.delete(id)
    }


    @Transactional(propagation =Propagation.REQUIRED)
    override fun getByName(StatioName:String):  rtustation?
    {
        return RtuStationRepository?.getByName(StatioName)
    }
}

