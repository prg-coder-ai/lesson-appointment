package com.ih.api.dal

import com.ih.api.model.employee
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param


@Mapper
interface EmployeeMapper {

    fun insert(@Param("model") model: employee): Int

    fun update(@Param("model") model: employee): Int

    fun get(@Param("id") id: Int): employee

    fun getPaging(@Param("account") account: String, @Param("companyID") companyID: Int, @Param("stationID") stationID: Int, @Param("offset") offset: Int, @Param("pageSize") pageSize: Int, @Param("orderBy") orderBy: String): List<employee>

    fun getCount(@Param("account") account: String, @Param("companyID") companyID: Int, @Param("stationID") stationID: Int): Int

    fun delete(@Param("id") id: Int): Int

    fun findByAccount(@Param("account") account: String): employee

    fun resetPassword(@Param("id") id: Int, @Param("newPassword") newPassword: String): Int

    fun changPassword(@Param("id") id: Int, @Param("password") password: String): Int

    fun getByName(@Param("account") account: String): employee
}
