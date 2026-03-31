package com.ih.api.service


/* rtuStation Õ¾Ãû³Æ*/
import com.ih.api.model.MeterPara
import com.ih.api.dal.MeterHistoryMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource

@Service
class meterServiceImpl : MeterService {
    @Resource
    var _Repository: MeterHistoryMapper? = null


    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): MeterPara? {
        return _Repository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging( companyID: Int,stationID: Int,
                            offset: Int, pageSize: Int, orderBy: String): List<MeterPara>?
    {
        return _Repository?.getPaging( companyID,stationID, offset, pageSize, orderBy)
    }
    /*, paraName: String,minTemp: Float, maxTemp: Float,,minDate:Date,maxDate:Date*/
    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(companyID: Int,stationID: Int ): Int?
    {
        return _Repository?.getCount(companyID,stationID  )
    }

}

