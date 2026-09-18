package com.reservation.service;

import com.reservation.common.*;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingDTO;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.exception.BusinessException;
import com.reservation.utils.TermMsg;
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
        // 第一步先取排期行锁，把「查重 → 名额校验 → 落库」整段串行化到同一把锁上。
        // 为什么查重必须在锁内：前端防重复点击挡不住超时重试、F5 重放、双开标签页。
        // 两个并发提交都会读到「该学生在本排期没有记录」，于是各插一条 booked、吃掉两个席位
        // （总席位没超额，但其他学生白白少一位）。排期锁让后到的请求能看到先到者写入的行。
        String scheduleId = booking.getScheduleId();
        bookingSeatService.lockScheduleAndAssertExists(scheduleId);

        // 同一学生同一排期只应占一个席位。
        Booking existing = bookingMapper.selectLatestByScheduleAndStudent(scheduleId, booking.getStudentId());
        if (existing != null && BookingStatus.occupiesSeat(existing.getStatus())) {
            throw new BusinessException(TermMsg.t("该{student}已预约此{schedule}，请勿重复提交"));
        }

        // 服务端名额校验。学生端「剩余席位=0 就不让点预定」只是 UI 层约束，
        // 直接调接口或并发提交仍可超额，这里才是真正的闸门。
        // 候补(waiting)不占席位，故不校验（assertSeatsAvailable 内部按目标状态放行）。
        bookingSeatService.assertSeatsAvailable(
                scheduleId, existing == null ? null : existing.getBookingId(),
                booking.getStatus(), "可申请候补");

        if (existing != null) {
            // 复用已有的非占位记录（候补转正 / 取消后重新预约）而不是新插一条，
            // 与「指定学生」的语义保持一致，避免同一学生同一排期堆出多行历史。
            // status 为空时显式落 booked，与 DB 列 DEFAULT 'booked' 的语义一致
            // （updateStatus 不做默认值兜底，传 null 会写进 NOT NULL 列报错）。
            String targetStatus = (booking.getStatus() == null || booking.getStatus().trim().isEmpty())
                    ? BookingStatus.BOOKED : booking.getStatus();
            bookingMapper.updateStatus(existing.getBookingId(), targetStatus);
            return existing.getBookingId();
        }

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

        // 状态变更走 CAS：只有库里状态仍等于上面读到的那一次值，才允许更新。
        // 原先是无条件 updateById，两个并发编辑会互相覆盖；更要紧的是「是否转入占位」这个判断
        // 基于 current 这次普通读的快照，若期间该预订已被他人取消、腾出的席位又被候补递补占走，
        // 这次覆盖式写回 booked 就会凭空多出一个占位（4 个人坐 3 个位）。
        // 影响行数为 0 说明状态已被他人改过，抛错让前端刷新重试，绝不硬写。
        //
        // 注意：CAS 成功后**不要**把 booking.status 置 null 再交给 updateById——当调用方只传了
        // status 一个字段时（管理端改状态就是这种载荷），置 null 会让 updateById 的 SET 子句为空、
        // 拼出 `UPDATE booking WHERE booking_id=?` 直接报语法错。这里让 updateById 照原样再写一次
        // 同值即可：CAS 已持该行 X 锁，同一事务内不存在被他人插队的窗口。
        if (!Objects.equals(targetStatus, current.getStatus())) {
            int rows = bookingMapper.updateStatusIfCurrent(id, current.getStatus(), targetStatus);
            if (rows == 0) {
                throw new BusinessException(TermMsg.t("该预订已被他人修改，请刷新后重试"));
            }
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

          // CAS：库里状态仍等于刚才读到的值才更新。并发的两个状态变更（例如一个取消、一个确认）
          // 原会各自成功、后写者覆盖先写者，最终「占不占席位」与操作意图对不上。
          // 影响行数为 0 说明已被他人改过，抛错让前端刷新重试，不硬写。
          int rows = bookingMapper.updateStatusIfCurrent(id, current.getStatus(), status);
          if (rows == 0) {
              throw new BusinessException(TermMsg.t("该预订已被他人修改，请刷新后重试"));
          }
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
            throw new BusinessException(TermMsg.t("该候补已被处理（可能刚被他人递补或已被{student}撤销），请刷新后重试"));
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
            throw new BusinessException(TermMsg.t("{schedule}ID不能为空"));
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