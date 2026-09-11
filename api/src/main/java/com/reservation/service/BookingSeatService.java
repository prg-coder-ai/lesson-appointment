package com.reservation.service;

import com.reservation.common.BookingStatus;
import com.reservation.entity.CourseSchedule;
import com.reservation.exception.BusinessException;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseScheduleMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 席位守卫：所有「占用席位」的写路径（学生预定 / 改订 / 指定学生 / 候补递补）共用同一份名额校验，
 * 避免每个入口各写一遍、日后走偏。
 *
 * <h3>为什么需要它</h3>
 * 学生端「剩余席位 = 0 就不让点预定」只是 UI 层约束，直接调接口或并发提交仍可超额预订。
 * 服务端必须有闸门，且必须是<b>并发安全</b>的闸门。
 *
 * <h3>并发正确性（两个坑都得堵上，少一个都会超额）</h3>
 * <ol>
 *   <li><b>校验与写入必须互斥</b>：名额校验读的是「其他行的聚合计数」，随后的占位写入是本行，
 *       两者不加锁时两个事务会各自读到“还有空位”，各自成功——各自的行锁互不冲突，拦不住。
 *       故先取 {@link CourseScheduleMapper#selectByIdForUpdate} 的排期行锁。</li>
 *   <li><b>计数必须用锁定读</b>：MySQL 默认 REPEATABLE READ，普通 SELECT 走事务快照，
 *       而快照在事务第一次普通读时就定格了。若在拿到排期锁之前已经发生过普通读
 *       （例如先 selectById(bookingId) 查候补记录），那么锁内再普通地 count 仍会读到旧快照，
 *       后到的事务依旧看到「还有空位」→ 仍然超额。
 *       锁定读（FOR UPDATE）永远读取最新已提交数据，不受快照影响，这才是可靠的判据。</li>
 * </ol>
 * 本类的所有校验入口都遵循同一加锁顺序：<b>先排期行锁，再 bookings 行</b>，
 * 因此不会出现交叉加锁导致的死锁。
 */
@Slf4j
@Service
public class BookingSeatService {

    @Resource
    private BookingMapper bookingMapper;

    @Resource
    private CourseScheduleMapper scheduleMapper;

    /**
     * 校验目标排期是否还有空位容纳一笔「占位」预订。
     *
     * <p>不占位的目标状态（候补 / 已取消 / 被拒）直接放行——候补正是名额已满时的申请通道，
     * 在这里拦掉候补，候补功能就废了。
     *
     * @param scheduleId       目标排期ID
     * @param excludeBookingId 需排除自身的预订ID（改订、递补用），可为 null
     * @param targetStatus     目标状态，决定是否需要占位校验
     * @param extraHint        名额已满时追加的提示（如“可申请候补”），可为 null
     */
    public void assertSeatsAvailable(String scheduleId, String excludeBookingId,
                                     String targetStatus, String extraHint) {
        if (!BookingStatus.occupiesSeat(targetStatus)) {
            return;
        }
        CourseSchedule schedule = lockScheduleAndAssertExists(scheduleId);

        int totalSites = schedule.getAvailableSites();
        if (totalSites <= 0) {
            throw new BusinessException("该排期未设置可预约席位，无法预定");
        }
        int occupied = countOccupyingForUpdate(scheduleId, excludeBookingId);
        if (occupied >= totalSites) {
            throw new BusinessException("该排期名额已满（总席位 " + totalSites + "，已占 " + occupied + "）"
                    + (extraHint == null || extraHint.isEmpty() ? "" : "，" + extraHint));
        }
    }

    /**
     * 取排期行锁并返回排期；排期不存在直接抛业务异常。
     * 行锁的作用见类注释第 1 点。
     */
    public CourseSchedule lockScheduleAndAssertExists(String scheduleId) {
        if (scheduleId == null || scheduleId.trim().isEmpty()) {
            throw new BusinessException("排期ID不能为空");
        }
        // 加排期行锁读取：先于任何对 booking 的写入，保证同一排期的占位操作串行化
        CourseSchedule schedule = scheduleMapper.selectByIdForUpdate(scheduleId);
        if (schedule == null) {
            throw new BusinessException("排期不存在");
        }
        return schedule;
    }

    /**
     * 以锁定读统计占位预订数（排除 excludeBookingId 自身）。
     * 不用 SELECT COUNT(*) 是为了避开「聚合函数 + FOR UPDATE」的限制：
     * 先锁住参与统计的行、再在内存里数，语义相同且各版本 MySQL 都支持。
     */
    public int countOccupyingForUpdate(String scheduleId, String excludeBookingId) {
        List<String> ids = bookingMapper.selectOccupyingBookingIdsForUpdate(
                scheduleId, BookingStatus.NON_OCCUPYING, excludeBookingId);
        return ids == null ? 0 : ids.size();
    }

    /** 仅用于展示的实时占位数（非锁定读，不需要事务） */
    public int countOccupying(String scheduleId) {
        return bookingMapper.countBookingByScheduleId(scheduleId, BookingStatus.NON_OCCUPYING, null);
    }
}
