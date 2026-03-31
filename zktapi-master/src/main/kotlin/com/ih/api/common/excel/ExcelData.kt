package com.ih.api.common.excel
import java.io.Serializable
class ExcelData:Serializable   {
    private  val serialVersionUID = 4444017239100620999L
    // 表头
    private var titles: List<String>? = null

    // 数据
    private var rows: List<List<Any>>? = null

    // 页签名称
    private var name: String? = null

    fun getTitles(): List<String>? {
        return titles
    }

    fun setTitles(titles: List<String>) {
        this.titles = titles
    }

    fun getRows(): List<List<Any>>? {
        return rows
    }

    fun setRows(rows: List<List<Any>>) {
        this.rows = rows
    }

    fun getName(): String? {
        return name
    }

    fun setName(name: String) {
        this.name = name
    }
}