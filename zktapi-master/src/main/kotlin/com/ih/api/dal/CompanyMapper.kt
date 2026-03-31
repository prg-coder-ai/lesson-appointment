package com.ih.api.dal

import com.ih.api.model.company
import org.apache.ibatis.annotations.*


@Mapper
interface CompanyMapper {

    fun insert(@Param("model") model: company): Int

    fun update(@Param("model") model: company): Int

    fun get(@Param("id") id: Int): company

    fun getPaging(@Param("name") name: String,
                  @Param("searchCompanyID") searchCompanyID: Int,
                  @Param("searchParentID") searchParentID: Int,
                  @Param("offset") offset: Int,
                  @Param("pageSize") pageSize: Int,
                  @Param("orderBy") orderBy: String): List<company>
    fun pgetPaging(@Param("name") name: String,
                   @Param("searchCompanyID") searchCompanyID: Int,
                   @Param("searchParentID")  searchParentID: Int,
                   @Param("offset") offset: Int,
                   @Param("pageSize") pageSize: Int,
                   @Param("orderBy") orderBy: String): List<company>

    fun getCount(@Param("name") name: String,
                 @Param("bindCompanyID") bindCompanyID: Int,
                 @Param("parentID") parentID: Int): Int

    fun delete(@Param("id") id: Int): Int

    fun getByName(@Param("name") paramString: String): company
}
