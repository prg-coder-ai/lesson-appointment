package com.ih.api.dal

import com.ih.api.model.Customer
import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param


@Mapper
interface CustomerMapper {

    fun insert(@Param("model") model: Customer): Int

    fun update(@Param("model") model: Customer): Int

    fun get(@Param("id") id: Int): Customer

    fun getPaging(@Param("name") name: String, @Param("phoneNumber") phoneNumber: String, @Param("cID") cID: String, @Param("offset") offset: Int, @Param("pageSize") pageSize: Int, @Param("orderBy") orderBy: String): List<Customer>

    fun getCount(@Param("name") name: String, @Param("phoneNumber") phoneNumber: String, @Param("cID") cID: String): Int

    fun delete(@Param("id") id: Int): Int

    fun getLast(): Customer

    fun getByName(@Param("name") name: String, @Param("phoneNumber") phoneNumber: String): Customer
}
