package com.ih.api.service

import com.ih.api.model.Enumlist

interface EnumlistService {

    fun insert(model: Enumlist): Int?

    fun update(model: Enumlist): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): Enumlist?

    /*
    * 获取记录数
    * */
    fun getCount(groupNo: String): Int?

    /*
    * 分页函数
    * userID：用户ID
    * type：消费类型（0：充值，1：消费）
    * offset：起始记录位置
    * pageSize：页容量
    * orderBy：排序条件
    * */
    fun getPaging(groupNo: String, offset: Int, pageSize: Int, orderBy: String): List<Enumlist>?

}
