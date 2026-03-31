package com.ih.api.service

import com.ih.api.dal.EmployeeMapper
import com.ih.api.model.employee
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import javax.annotation.Resource


@Service
class EmployeeServiceImpl : EmployeeService {
    @Resource
    var employeeRepository: EmployeeMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: employee): Int? {
        return employeeRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: employee): Int? {
        return employeeRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): employee? {
        return employeeRepository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging(account: String, companyID: Int, stationID: Int, offset: Int, pageSize: Int, orderBy: String): List<employee>? {
        return employeeRepository?.getPaging(account, companyID, stationID, offset, pageSize, orderBy)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(account: String, companyID: Int, stationID: Int): Int? {
        return employeeRepository?.getCount(account, companyID, stationID)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return employeeRepository?.delete(id)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun findByAccount(account: String): employee? {
        return employeeRepository?.findByAccount(account)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun resetPassword(id: Int, newPassword: String): Int? {
        return employeeRepository?.resetPassword(id, newPassword)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun changPassword(id: Int, password: String): Int? {
        return employeeRepository?.changPassword(id, password)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getByName(account: String): employee? {
        return employeeRepository?.getByName(account)
    }
}

