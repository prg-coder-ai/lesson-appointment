package com.ih.api.service

import com.ih.api.dal.HeatexchangestationMapper
import com.ih.api.model.Heatexchangestation
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource


@Service
class HeatexchangestationServiceImpl : HeatexchangestationService {
    @Resource
    var heatexchangestationRepository: HeatexchangestationMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: Heatexchangestation): Int? {
        return heatexchangestationRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: Heatexchangestation): Int? {
        return heatexchangestationRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): Heatexchangestation? {
        return heatexchangestationRepository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging(name: String, companyID: Int, parentID: Int, offset: Int, pageSize: Int, orderBy: String): List<Heatexchangestation>? {
        return heatexchangestationRepository?.getPaging(name, companyID, parentID, offset, pageSize, orderBy)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(name: String, companyID: Int, parentID: Int): Int? {
        return heatexchangestationRepository?.getCount(name, companyID, parentID)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return heatexchangestationRepository?.delete(id)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getByName(name: String, companyID: Int): Heatexchangestation? {
        return heatexchangestationRepository?.getByName(name, companyID)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getStations(companyID: Int,offset: Int, pageSize: Int, orderBy: String): List<Heatexchangestation>? {
        return heatexchangestationRepository?.getStations( companyID,  offset, pageSize, orderBy)
    }

}

