package com.ih.api.dal

import com.ih.api.model.rtuOnline
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface rtuOnlineMapper {
    fun get(@Param("id") id: Int): rtuOnline
    fun getPaging(
                  @Param("companyID") companyID: Int,
                  @Param("stationID") stationID: Int,
                  @Param("offset")       offset: Int,
                  @Param("pageSize")   pageSize: Int
                 ): List<rtuOnline>?

    fun getCount(
        @Param("companyID") companyID: Int,
        @Param("stationID") stationID: Int
                  ): Int

    fun getHistList(
        @Param("companyID") companyID: Int,
        @Param("stationID") stationID: Int,
        @Param("offset")       offset: Int,
        @Param("pageSize")   pageSize: Int
    ): List<rtuOnline>?
}
