package com.ih.api.dal

import com.ih.api.model.Paralist
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface ParalistRealtimeMapper {

    fun insert(@Param("model") model: Paralist): Int

    fun update(@Param("model") model: Paralist): Int

    fun get(@Param("id") id: Int): Paralist

    fun getPaging(
                  @Param("StationID") stationID: Int,
                  @Param("subID") subID: Int,
                  @Param("offset") offset: Int,
                  @Param("pageSize") pageSize: Int,
                  @Param("orderBy") orderBy: String): List<Paralist>?
    fun getPagingSnap(
        @Param("CompanyID") companyID: Int,
        @Param("StationID") stationID: Int,
        @Param("subID") subID: Int,
        @Param("offset") offset: Int,
        @Param("pageSize") pageSize: Int,
        @Param("orderBy") orderBy: String): List<Paralist>?
    fun getCount(
                 @Param("StationID") StationID: Int,
                 @Param("subID") subID: Int
                  ): Int

    fun delete(@Param("id") id: Int): Int

}
