package com.ih.api.service

import com.ih.api.model.Customer


interface CustomerService {

    fun insert(model: Customer): Int?

    fun update(model: Customer): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): Customer?

    /*
    * 获取记录数
    * */
    fun getCount(name: String, phoneNumber: String, cID: String): Int?

    /*
    * 分页函数
    * userID：用户ID
    * type：消费类型（0：充值，1：消费）
    * offset：起始记录位置
    * pageSize：页容量
    * orderBy：排序条件
    * */
    fun getPaging(name: String, phoneNumber: String, cID: String, offset: Int, pageSize: Int, orderBy: String): List<Customer>?

    fun getLast(): Customer?

    fun getByName(name: String, phoneNumber: String): Customer?
}
