package com.ih.api.service


/* rtuStation Õ¾Ãû³Æ*/
import com.ih.api.model.rtustation
import com.ih.api.model.Paralist
import com.ih.api.dal.ParalistHistoryMapper
import org.springframework.stereotype.Service
import com.ih.api.service.ParalistHistoryService
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.*
import javax.annotation.Resource

@Service
class ParalistHistoryServiceImpl : ParalistHistoryService {
    @Resource
    var ParalistRepository: ParalistHistoryMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: Paralist): Int? {

        return ParalistRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: Paralist): Int? {
        /*model.tableName=com.ih.api.common.ApiUtil.getTempratureTableNo(72,model.stationCode)*/
        return ParalistRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): Paralist? {
        return ParalistRepository?.get(id)
    }
    /*  paraName: String,minTemp: Float, maxTemp: Float,minDate:Date?,maxDate:Date?,*/
    /* , paraName,minTemp, maxTemp,minDate,maxDate, */
    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging( stationID: Int, subID: Int ,
                            offset: Int, pageSize: Int, orderBy: String): List<Paralist>?
    {
        return ParalistRepository?.getPaging( stationID, subID, offset, pageSize, orderBy)
    }
    /*, paraName: String,minTemp: Float, maxTemp: Float,,minDate:Date,maxDate:Date*/
    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(stationID: Int, subID: Int ): Int?
    {
        return ParalistRepository?.getCount(stationID, subID  )
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return ParalistRepository?.delete(id)
    }

}

