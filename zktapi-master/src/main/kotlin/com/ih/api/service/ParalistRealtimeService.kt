package com.ih.api.service

import com.ih.api.model.Paralist
//import com.ih.api.model.Temprature
import org.apache.ibatis.annotations.Param
import java.util.*


interface ParalistRealtimeService {

    fun insert(model: Paralist): Int?

    fun update(model: Paralist): Int?

    fun delete(id: Int): Int?

    fun get(id: Int): Paralist?

    fun getCount( StationID: Int, subID: Int): Int?

    fun getPaging( StationID: Int, subID: Int,
                offset: Int, pageSize: Int, orderBy: String): List<Paralist>?
    fun getPagingSnap( CompanyID: Int,StationID: Int, subID: Int,
                       offset: Int, pageSize: Int, orderBy: String): List<Paralist>?
    }
