package com.ih.api.service

import com.ih.api.dal.CompanyMapper
import com.ih.api.model.company
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestTemplate
import javax.annotation.Resource
//import {ApiService} from "./ApiService";

@Service
class CompanyServiceImpl : CompanyService {
    @Resource
    var companyRepository: CompanyMapper? = null

    @Transactional(propagation = Propagation.REQUIRED)
    override fun insert(model: company): Int? {
        return companyRepository?.insert(model)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun update(model: company): Int? {
        return companyRepository?.update(model)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun get(id: Int): company? {
        return companyRepository?.get(id)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun getPaging(name: String, bindCompanyID: Int, parentID: Int, offset: Int, pageSize: Int, orderBy: String):
             List<company>? {
      return companyRepository?.getPaging(name, bindCompanyID,parentID, offset, pageSize, orderBy)
       }
    @Transactional(propagation = Propagation.REQUIRED)
    override fun pgetPaging(name: String, bindCompanyID: Int, parentID: Int, offset: Int, pageSize: Int, orderBy:
    String): List<company>? {
        return companyRepository?.pgetPaging(name, bindCompanyID,parentID, offset, pageSize, orderBy)
    }
    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getCount(name: String, bindCompanyID: Int, parentID: Int): Int? {
        return companyRepository?.getCount(name, bindCompanyID,parentID)
    }

    @Transactional(propagation = Propagation.REQUIRED)
    override fun delete(id: Int): Int? {
        return companyRepository?.delete(id)
    }

    @Transactional(propagation = Propagation.SUPPORTS)
    override fun getByName(name: String): company? {
        return companyRepository?.getByName(name)
    }
}

