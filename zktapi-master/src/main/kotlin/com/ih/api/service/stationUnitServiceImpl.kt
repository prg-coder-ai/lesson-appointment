package com.ih.api.service

import com.ih.api.model.StationUnit
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource
import com.ih.api.dal.StationUnitMapper

@Service
class stationUnitServiceImpl: StationUnitService {
    @Resource
    var RtuStationRepository: StationUnitMapper?=null

    @Transactional(propagation= Propagation.SUPPORTS)
    override fun get(id: Int): StationUnit?
    {
        return RtuStationRepository?.get(id)
    }
    
    @Transactional(propagation =Propagation.REQUIRED)
    override fun getPaging( companyID:Int,stationID:Int,offset:Int,pageSize:Int): List<StationUnit>?
    {
        return RtuStationRepository?.getPaging( companyID,stationID,offset,pageSize)
    }

    @Transactional(propagation =Propagation.SUPPORTS)
    override fun getCount(companyID:Int, stationID:Int): Int?
    {
        return RtuStationRepository?.getCount( companyID, stationID )
    }


}

