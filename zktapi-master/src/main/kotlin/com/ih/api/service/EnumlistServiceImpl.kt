package com.ih.api.service

import com.ih.api.dal.EnumlistMapper
import com.ih.api.model.Enumlist
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource

@Service
class EnumlistServiceImpl : EnumlistService {
    @Resource
    var enumlistRepository: EnumlistMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: Enumlist): Int? {
        return enumlistRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: Enumlist): Int? {
        return enumlistRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): Enumlist? {
        return enumlistRepository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging(groupNo: String, offset: Int, pageSize: Int, orderBy: String): List<Enumlist>? {
        return enumlistRepository?.getPaging(groupNo, offset, pageSize, orderBy)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(groupNo: String): Int? {
        return enumlistRepository?.getCount(groupNo)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return enumlistRepository?.delete(id)
    }

}

