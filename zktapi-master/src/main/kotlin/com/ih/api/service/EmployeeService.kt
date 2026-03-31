package com.ih.api.service

import com.ih.api.model.employee



interface EmployeeService {

    fun insert(model: employee): Int?

    fun update(model: employee): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): employee?

    /*
    * 获取记录数
    * */
    fun getCount(account: String, companyID: Int, stationID: Int): Int?

    /*
    * 分页函数
    * userID：用户ID
    * type：消费类型（0：充值，1：消费）
    * offset：起始记录位置
    * pageSize：页容量
    * orderBy：排序条件
    * */
    fun getPaging(account: String, companyID: Int, stationID: Int, offset: Int, pageSize: Int, orderBy: String): List<employee>?

    fun findByAccount(account: String): employee?

    fun resetPassword(id: Int, newPassword: String): Int?

    fun changPassword(id: Int, password: String): Int?

    fun getByName(account: String): employee?
}
