package com.ih.api.dal

import com.ih.api.model.StationUnit
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param


@Mapper
interface StationUnitMapper {

    fun get(@Param("id") id: Int): StationUnit

    fun getPaging( @Param("companyID") companyID: Int,
                   @Param("stationID") stationID: Int,
                   @Param("offset") offset: Int,
                   @Param("pageSize") pageSize: Int
                 // , @Param("orderBy") orderBy: String
    ): List<StationUnit>

    fun getCount( @Param("companyID") companyID: Int ,
                 @Param("stationID") stationID: Int ):       Int
  }
