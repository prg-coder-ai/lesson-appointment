package com.ih.api.service

import com.ih.api.dal.CustomerMapper
import com.ih.api.model.Customer
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource


@Service
class CustomerServiceImpl : CustomerService {
    @Resource
    var customerRepository: CustomerMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: Customer): Int? {
        return customerRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: Customer): Int? {
        return customerRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): Customer? {
        return customerRepository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging(name: String, phoneNumber: String, cID: String, offset: Int, pageSize: Int, orderBy: String): List<Customer>? {
        return customerRepository?.getPaging(name, phoneNumber, cID, offset, pageSize, orderBy)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(name: String, phoneNumber: String, cID: String): Int? {
        return customerRepository?.getCount(name, phoneNumber, cID)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return customerRepository?.delete(id)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getLast(): Customer? {
        return customerRepository?.getLast()
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getByName(name: String, phoneNumber: String): Customer? {
        return customerRepository?.getByName(name, phoneNumber)
    }
}

