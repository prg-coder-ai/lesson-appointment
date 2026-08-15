package com.reservation.service;

import com.reservation.common.*;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingDTO;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.query.BookingQueryPage;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import com.reservation.mapper.BookingMapper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.Resource;
import java.util.*;

@Slf4j
@Service
public class BookingService {

    @Resource
    private BookingMapper bookingMapper;

    @Transactional(rollbackFor = Exception.class)
    public String create(Booking booking) {
        String id = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        booking.setBookingId(id);

        bookingMapper.insert(booking); 
        return   id;
    }

  
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String update(String id, Booking booking) {
       // System.out.println("update : " + booking);
        booking.setBookingId(id);
        bookingMapper.update(booking);
        return id;
    }

    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateStatus( BookingDTO dto) {
//System.out.println("updateStatus dto: " + dto);
          String id= dto.getId();
          String status =dto.getStatus();
          if ("delete".equals(status)) {
              bookingMapper.delete(id);
          }    else  {
            bookingMapper.updateStatus(id, status);
              }
        return id;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public Booking selectById(String id) {
        return bookingMapper.selectById(id);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public List<Booking> selectList(BookingQueryParaDTO dto) {
        return bookingMapper.selectList(dto);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public PageResult <Booking> selectListPage(BookingQueryPage query) {
           
            List<Booking> retList =  bookingMapper.selectListPage(query);

            Page<Booking> page = new Page<>(query.getPageNum(), query.getPageSize());
            page.setRecords(retList);

            Integer total = bookingMapper.selectCountByCondition(query);
            page.setTotal(total);

            System.out.println("total : " + total);
            PageResult<Booking> result = PageResult.of(page);
            return result;

    }

//PageResult

    @Transactional(propagation = Propagation.REQUIRED)
    public int delete(String id) {
       log.info("删除预约开始, bookingId={}", id);
       int rows = bookingMapper.delete(id);
       log.info("删除预约结束, bookingId={}, 影响行数={}", id, rows);
       return rows;
    }

@Transactional(propagation = Propagation.REQUIRED)
    public int deleteByScheduleId(String id) {
       log.info("按排期ID删除预约开始, scheduleId={}", id);
       int rows = bookingMapper.deleteByScheduleId(id);
       log.info("按排期ID删除预约结束, scheduleId={}, 影响行数={}", id, rows);
       return rows;
    }
// INSERT_YOUR_CODE

    /**
     * 统计截至某一时刻（含当时）所有预约（Booking）数量
     * @param dateTimeFrom ~To 区间时间（时间点，精确到秒）
     * @return 统计时点所有预约数量
     */
    @Transactional(readOnly = true)
    public int countBookingAtDate(java.sql.Timestamp dateTimeFrom,java.sql.Timestamp dateTimeTo) {
        // 可根据业务需求增加状态条件（如只统计"active"预约等）——此处统计所有状态
        return bookingMapper.countBookingAtDate(dateTimeFrom,dateTimeTo,"booked");
    }
} 