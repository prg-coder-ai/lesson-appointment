package com.ih.api.dal

import com.ih.api.model.rtustation
import org.apache.ibatis.annotations.*

@Mapper
interface RtuStationMapper {

    fun insert(@Param("model") model: rtustation): Int

    fun update(@Param("model") model: rtustation): Int

    fun get(@Param("id") id: Int): rtustation

    fun getPaging( @Param("companyID") companyID: Int,
                   @Param("stationID") stationID: Int,
                   @Param("stationName") stationName: String,
                   @Param("offset") offset: Int,
                  @Param("pageSize") pageSize: Int,
                  @Param("orderBy") orderBy: String ): List<rtustation>

    fun getCount(@Param("companyID") companyID: Int ,
                 @Param("stationID") stationID: Int ):
            Int

    fun delete(@Param("id") id: Int): Int

    fun getByName(@Param("StatioName") name: String ): rtustation?

}
