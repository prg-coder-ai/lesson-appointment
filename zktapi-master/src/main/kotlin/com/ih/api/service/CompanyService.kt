package com.ih.api.service

import com.ih.api.model.company

interface CompanyService {

    fun insert(model: company): Int?

    fun update(model: company): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): company?

    /*
    * 获取记录数
    * */
    fun getCount(name: String, bindCompanyID: Int,parentID: Int): Int?

    /*
    * 分页函数
    * userID：用户ID
    * type：消费类型（0：充值，1：消费）
    * offset：起始记录位置
    * pageSize：页容量
    * orderBy：排序条件
    * */
    fun getPaging(name: String,bindCompanyID: Int, parentID: Int, offset: Int, pageSize: Int, orderBy: String): List<company>?
    fun pgetPaging(name: String,bindCompanyID: Int, parentID: Int, offset: Int, pageSize: Int, orderBy: String): List<company>?

    fun getByName(name: String): company?

}
