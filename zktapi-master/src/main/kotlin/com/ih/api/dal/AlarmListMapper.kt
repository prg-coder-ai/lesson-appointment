package com.ih.api.dal

import com.ih.api.model.AlarmList
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface AlarmListMapper {
    fun get(@Param("id") id: Int): AlarmList
    fun getPaging(
                  @Param("companyID") companyID: Int,
                  @Param("offset")       offset: Int,
                  @Param("pageSize")   pageSize: Int
                 ): List<AlarmList>?

    fun getCount(
                 @Param("companyID") companyID: Int
                  ): Int

    fun getHistList(
        @Param("companyID") companyID: Int,
        @Param("offset")       offset: Int,
        @Param("pageSize")   pageSize: Int
    ): List<AlarmList>?
}
