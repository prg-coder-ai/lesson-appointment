package com.ih.api.dal

import com.ih.api.model.MeterPara
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

//热表参数
@Mapper
interface MeterHistoryMapper {
    fun get(@Param("id") id: Int): MeterPara
    fun getPaging(
        @Param("CompanyID") CompanyID: Int,
            @Param("StationID") StationID: Int,
                  @Param("offset") offset: Int,
                  @Param("pageSize") pageSize: Int,
                  @Param("orderBy") orderBy: String): List<MeterPara>

    fun getCount( @Param("CompanyID") CompanyID: Int,
                 @Param("StationID") StationID: Int
                  ): Int

}
