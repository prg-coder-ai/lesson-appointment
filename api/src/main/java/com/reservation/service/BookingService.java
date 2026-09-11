package com.reservation.service;

import com.reservation.common.*;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingDTO;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.exception.BusinessException;
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

    /** 名额校验（含并发正确性）统一由 BookingSeatService 提供，见该类注释 */
    @Resource
    private BookingSeatService bookingSeatService;

    /**
     * 递补成功后需要生成课次（appointment）。
     * 生成逻辑与「指定学生」共用同一份实现，避免两处各写一遍、日后走偏。
     */
    @Resource
    private CourseScheduleService courseScheduleService;

    @Transactional(rollbackFor = Exception.class)
    public String create(Booking booking) {
        // 服务端名额校验。学生端「剩余席位=0 就不让点预定」只是 UI 层约束，
        // 直接调接口或并发提交仍可超额，这里才是真正的闸门。
        // 候补(waiting)不占席位，故不校验（assertSeatsAvailable 内部按目标状态放行）。
        bookingSeatService.assertSeatsAvailable(
                booking.getScheduleId(), null, booking.getStatus(), "可申请候补");

        String id = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        booking.setBookingId(id);

        bookingMapper.insert(booking); 
        return   id;
    }

  
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String update(String id, Booking booking) {
       // log.debug("update : " + booking);
        Booking current = bookingMapper.selectById(id);
        if (current == null) {
            throw new BusinessException("预订记录不存在");
        }
        booking.setBookingId(id);

        // 席位校验：只在「转入占位状态」时校验，且排除自身（自己原本就占着一个位）。
        // 换排期时目标排期与当前不同，也要校验一次。
        String targetStatus = booking.getStatus() != null ? booking.getStatus() : current.getStatus();
        String targetScheduleId = booking.getScheduleId() != null ? booking.getScheduleId() : current.getScheduleId();
        boolean scheduleChanged = !Objects.equals(targetScheduleId, current.getScheduleId());
        if (BookingStatus.occupiesSeat(targetStatus)
                && (scheduleChanged || !BookingStatus.occupiesSeat(current.getStatus()))) {
            bookingSeatService.assertSeatsAvailable(targetScheduleId, id, targetStatus, "可申请候补");
        }

        bookingMapper.updateById(booking);
        return id;
    }

    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateStatus( BookingDTO dto) {
//log.debug("updateStatus dto: " + dto);
          String id= dto.getId();
          String status =dto.getStatus();
          if (BookingStatus.DELETE.equals(status)) {
              bookingMapper.deleteById(id);
              return id;
          }

          Booking current = bookingMapper.selectById(id);
          if (current == null) {
              throw new BusinessException("预订记录不存在");
          }

          // 候补转正统一走 promoteWaitlist（席位校验 + CAS + 生成课次 + 后续通知），
          // 否则「确认候补」会成为绕过名额校验、且不生成课次的后门。
          if (BookingStatus.isWaiting(current.getStatus()) && BookingStatus.isBooked(status)) {
              promoteWaitlist(id);
              return id;
          }

          // 转入占位状态时补名额校验：原先这里是无条件 UPDATE，
          // 从 cancelled 改回 booked 可以无限加人，正是超额预订的入口之一。
          if (!BookingStatus.occupiesSeat(current.getStatus()) && BookingStatus.occupiesSeat(status)) {
              bookingSeatService.assertSeatsAvailable(
                      current.getScheduleId(), id, status, "可申请候补");
          }

          bookingMapper.updateStatus(id, status);
        return id;
    }

    /**
     * 席位校验：目标排期是否还有空位容纳一笔「占位」预订。
     *
     * <p>不占位的状态（候补 / 已取消 / 预订被拒）直接放行——候补正是名额已满时的申请通道，
     * 若在这里拦掉，候补功能就废了。
     *
     * @param excludeBookingId 需排除自身的预订ID（改订、递补用），可为 null
     * @param targetStatus     目标状态；决定是否需要占位校验
     */
    /**
     * 递补：把一条候补（waiting）晋升为正式预订（booked），并生成课次。
     *
     * <p>全过程在单个事务内完成，并发安全由 CAS 保证：
     * <ol>
     *   <li>校验该记录仍是候补；</li>
     *   <li>校验该排期仍有空位——候补不占席位，空位可能已被别人订走；</li>
     *   <li>CAS 更新 {@code waiting → booked}，影响行数为 0 即已被他人抢先，抛错回滚；</li>
     *   <li>生成课次，幂等（已有课次则跳过，重复调用不会产生双份时间表）。</li>
     * </ol>
     *
     * @param bookingId 候补记录ID
     * @return 递补结果快照（bookingId / scheduleId / studentId / status / appointmentsReady）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> promoteWaitlist(String bookingId) {
        if (bookingId == null || bookingId.trim().isEmpty()) {
            throw new BusinessException("候补记录ID不能为空");
        }
        Booking candidate = bookingMapper.selectById(bookingId);
        if (candidate == null) {
            throw new BusinessException("候补记录不存在");
        }
        if (!BookingStatus.isWaiting(candidate.getStatus())) {
            throw new BusinessException("该记录当前状态为【" + candidate.getStatus() + "】，不是候补，无法递补");
        }

        // 名额校验（含加锁 + 锁定读计数）。
        // 注意：上面 selectById(candidate) 是一次普通读，已经让本事务的读快照定格；
        // 若这里改用普通 SELECT 计数，就会读到旧快照里的“还有空位”，并发递补会双双成功。
        // 因此校验必须走锁定读，详见 BookingSeatService 类注释。
        bookingSeatService.assertSeatsAvailable(
                candidate.getScheduleId(), bookingId, BookingStatus.BOOKED, "无法递补");

        int rows = bookingMapper.updateStatusIfCurrent(
                bookingId, BookingStatus.WAITING, BookingStatus.BOOKED);
        if (rows == 0) {
            // 事务会回滚，不会留下“已占位却没生成课次”的中间态
            throw new BusinessException("该候补已被处理（可能刚被他人递补或已被学生撤销），请刷新后重试");
        }

        boolean appointmentsReady =
                courseScheduleService.generateAppointmentsForBooking(bookingId, candidate.getScheduleId());

        log.info("候补递补成功, bookingId={}, scheduleId={}, studentId={}, 课次生成={}",
                bookingId, candidate.getScheduleId(), candidate.getStudentId(), appointmentsReady);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("bookingId", bookingId);
        data.put("scheduleId", candidate.getScheduleId());
        data.put("studentId", candidate.getStudentId());
        data.put("status", BookingStatus.BOOKED);
        data.put("appointmentsReady", appointmentsReady);
        return data;
    }

    /** 某排期的候补队列，按申请时间升序（先来先得，次序即为递补次序） */
    @Transactional(readOnly = true)
    public List<Booking> getWaitlistQueue(String scheduleId) {
        if (scheduleId == null || scheduleId.trim().isEmpty()) {
            throw new BusinessException("排期ID不能为空");
        }
        return bookingMapper.selectWaitlistByScheduleId(scheduleId);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public Booking selectById(String id) {
        return bookingMapper.selectById(id);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public List<Booking> selectList(BookingQueryParaDTO dto) {
        return bookingMapper.selectByCondition(dto);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public PageResult <Booking> selectListPage(BookingQueryPage query) {
           
            List<Booking> retList =  bookingMapper.selectListPage(query);

            Page<Booking> page = new Page<>(query.getPageNum(), query.getPageSize());
            page.setRecords(retList);

            Integer total = bookingMapper.selectCountByCondition(query);
            page.setTotal(total);

          //  log.debug("total : " + total);
            PageResult<Booking> result = PageResult.of(page);
            return result;

    }

//PageResult

    @Transactional(propagation = Propagation.REQUIRED)
    public int delete(String id) {
       log.info("删除预约开始, bookingId={}", id);
       int rows = bookingMapper.deleteById(id);
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

    @Transactional(readOnly = true)
    public Integer getBookingCountByScheduleId(String scheduleId) {
        // 只统计「占位」的预订：候补 / 已取消 / 预订被拒都不算，
        // 否则已取消的预订会永久吃掉一个席位、剩余席位越用越少。
        return bookingMapper.countBookingByScheduleId(scheduleId, BookingStatus.NON_OCCUPYING, null);
    }
} 