package com.reservation.service;

import com.reservation.entity.Booking;
import com.reservation.entity.BookingDTO;
import com.reservation.mapper.BookingMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.*;

@Service
public class BookingService {

    @Resource
    private BookingMapper bookingMapper;

    @Transactional(rollbackFor = Exception.class)
    public String create(Booking booking) {
        String id = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        booking.setId(id);

        bookingMapper.insert(booking);

        return   id;
    }

  
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String update(String id, Booking booking) {
        System.out.println("update : " + booking);
        booking.setId(id);
        bookingMapper.update(booking);
        return id;
    }

    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateStatus(String id, String status) {
        bookingMapper.updateStatus(id, status);
        return id;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public Booking selectById(String id) {
        return bookingMapper.selectById(id);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public List<Booking> selectList(BookingDTO dto) {
        return bookingMapper.selectList(dto);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void delete(String id) {
        bookingMapper.delete(id);
    }
} 