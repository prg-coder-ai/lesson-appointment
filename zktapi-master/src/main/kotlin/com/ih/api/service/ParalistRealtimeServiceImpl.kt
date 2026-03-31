package com.ih.api.service

import com.ih.api.dal.ParalistRealtimeMapper
/* rtuStation Õ¾Ãû³Æ*/
import com.ih.api.model.Paralist
import org.springframework.stereotype.Service
import com.ih.api.service.ParalistRealtimeService
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource

@Service
class ParalistRealtimeServiceImpl : ParalistRealtimeService {
    @Resource
    var ParalistRepository: ParalistRealtimeMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: Paralist): Int? {

        return ParalistRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: Paralist): Int? {
           return ParalistRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): Paralist? {
        return ParalistRepository?.get(id)
    }
    /*  paraName: String,minTemp: Float, maxTemp: Float,minDate:Date?,maxDate:Date?,*/
    /* , paraName,minTemp, maxTemp,minDate,maxDate, */
    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging( StationID: Int, subID: Int,     offset: Int, pageSize: Int, orderBy: String): List<Paralist>? {
        return ParalistRepository?.getPaging( StationID, subID,   offset, pageSize, orderBy)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPagingSnap( CompanyID: Int,StationID: Int, subID: Int,     offset: Int, pageSize: Int, orderBy: String): List<Paralist>? {
        return ParalistRepository?.getPagingSnap( CompanyID,StationID, subID,   offset, pageSize, orderBy)
    }
    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(StationID: Int, subID: Int ): Int? {
        return ParalistRepository?.getCount(StationID, subID    )
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return ParalistRepository?.delete(id)
    }


}

