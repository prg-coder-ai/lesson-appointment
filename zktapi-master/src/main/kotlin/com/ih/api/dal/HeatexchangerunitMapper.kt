package com.ih.api.dal

import com.ih.api.model.Heatexchangerunit
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param


@Mapper
interface HeatexchangerunitMapper {

    fun insert(@Param("model") model: Heatexchangerunit): Int

    fun update(@Param("model") model: Heatexchangerunit): Int

    fun get(@Param("id") id: Int): Heatexchangerunit

    fun getPaging(@Param("unitNumber") unitNumber: String,@Param("crewID") crewID: String, @Param("companyID") companyID: Int, @Param("stationID") stationID: Int, @Param("offset") offset: Int, @Param("pageSize") pageSize: Int, @Param("orderBy") orderBy: String): List<Heatexchangerunit>

    fun getCount(@Param("unitNumber") unitNumber: String, @Param("crewID") crewID: String,@Param("companyID") companyID: Int, @Param("stationID") stationID: Int): Int

    fun delete(@Param("id") id: Int): Int

    fun getByName(@Param("unitNumber") unitNumber: String, @Param("stationID") stationID: Int): Heatexchangerunit
}
