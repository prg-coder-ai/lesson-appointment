package com.ih.api.service

import com.ih.api.dal.HeatexchangerunitMapper
import com.ih.api.model.Heatexchangerunit
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource

@Service
class HeatexchangerunitServiceImpl : HeatexchangerunitService {
    @Resource
    var heatexchangerunitRepository: HeatexchangerunitMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: Heatexchangerunit): Int? {
        return heatexchangerunitRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: Heatexchangerunit): Int? {
        return heatexchangerunitRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): Heatexchangerunit? {
        return heatexchangerunitRepository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging(unitNumber: String, crewID: String, companyID: Int, stationID: Int, offset: Int, pageSize: Int, orderBy: String): List<Heatexchangerunit>? {
        return heatexchangerunitRepository?.getPaging(unitNumber,crewID, companyID, stationID, offset, pageSize, orderBy)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(unitNumber: String, crewID: String, companyID: Int, stationID: Int): Int? {
        return heatexchangerunitRepository?.getCount(unitNumber,crewID, companyID, stationID)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return heatexchangerunitRepository?.delete(id)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getByName(unitNumber: String, stationID: Int): Heatexchangerunit? {
        return heatexchangerunitRepository?.getByName(unitNumber, stationID)
    }

}

