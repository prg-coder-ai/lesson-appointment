package com.reservation.service; 

//import com.baomidou.mybatisplus.extension.service.IService;
import org.springframework.transaction.annotation.Transactional;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.mapper.BookingMapper;

import com.reservation.common.*;
import com.reservation.exception.ConflictException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.utils.TermMsg;
import com.reservation.query.*;
 import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

 import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
 import com.baomidou.mybatisplus.core.toolkit.Wrappers;
  
import java.util.List;
import java.util.stream.Collectors;

import jakarta.annotation.Resource;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.reservation.mapper.AppointmentMapper;
//import java.time.LocalDateTime;

@Slf4j
@Service
public class AppointmentService extends ServiceImpl<AppointmentMapper, Appointment> {

    @Resource
    private BookingMapper bookingMapper;
    @Resource
    private ReferentialCascadeService cascadeService;
    /** 退费档位快照：申请提交（cancelling/t-cancelling）时按提交时刻判定并落库（2026-10-11 方案 B1） */
    @Resource
    private RefundRuleService refundRuleService;

    /**
     * 课时扣减（2026-10-28 S6）。只用于「请假被驳回」这一条路径的补扣：
     * 口径是「有请假申请即免扣」，驳回后状态退回 active 就必须补上那 1 课时，
     * 否则「先申请、被拒、照上」等于白上一节课。
     */
    @Resource
    private LessonDeductionService lessonDeductionService;

    /**
     * 写路径时间态闸的受控状态：申请请假/改期（cancelling / t-cancelling）与撤回（active）。
     * 课次一旦开始（now ≥ appointment_datetime，UTC），这三类变更一律 409 拒绝；
     * 管理员确认类状态（cancelled/reject/t-cancelled 等）不拦——管理员保留「课后补处理」特权。
     */
    private static boolean isTimeGateStatus(String status) {
        return "cancelling".equalsIgnoreCase(status)
                || "t-cancelling".equalsIgnoreCase(status)
                || "active".equalsIgnoreCase(status);
    }

    // 批量插入Appointment对象到数据库
    @Transactional(rollbackFor = Exception.class)
    public void insertAppointmentList(List<Appointment> appointmentList) {
        if (appointmentList == null || appointmentList.isEmpty()) {
            return;
        }
        this.saveBatch(appointmentList);
    }
    // ==================== 自定义查询方法 ====================
    /**
     * 根据 bookingId 查询所有预约记录
     */
    public List<Appointment> getByBookingId(String bookingId) {
        return lambdaQuery()
                .eq(Appointment::getBookingId, bookingId)
                .orderByAsc(Appointment::getAppointmentDatetime)
                .list();
           
    }

    /**
     * 根据状态查询
     */
    public List<Appointment> getByStatus(String status) {
        return lambdaQuery()
                .eq(Appointment::getStatus, status)
                .list();
    }

    /**
     * 查询某个时间段内的预约 
     */
    public List<Appointment> getBetweenTime(String userId, String role,
                java.sql.Timestamp startTime, java.sql.Timestamp endTime,    
                String sortField, String sortOrder) { 
        // 先判断 userId 和 role 是否均不为空
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper=null  ;
       boolean nodata = false;   
             
        List<String> bookingIdList = null;
        if (userId != null && !userId.isEmpty() && role != null && !role.isEmpty()) {
            // 按角色，从 booking 表查出对应 bookingId
            if ("teacher".equalsIgnoreCase(role) || "student".equalsIgnoreCase(role)) {
                BookingQueryParaDTO queryPara = new BookingQueryParaDTO();
                queryPara.setUserRole(role.toLowerCase());
                queryPara.setUserId(userId);
                bookingIdList = bookingMapper.selectByCondition(queryPara).stream()
                        .map(Booking::getBookingId)
                        .toList();
            }
            // bookingIdList 不为空则查这些bookingId，否则查空
            if (bookingIdList != null && !bookingIdList.isEmpty()) {
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                        .in(Appointment::getBookingId, bookingIdList)
                        .between(Appointment::getAppointmentDatetime, startTime, endTime);
            } else { nodata =true;   
                 }
        } else {
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, startTime, endTime);
        }

        // 按需排序
        if((nodata==false) &&  (queryWrapper!=null) &&  
           (sortField != null && !sortField.isEmpty())) {
            String[] fields = sortField.split(",");
            for (String field : fields) {
                field = field.trim();
                if ("appointmentDatetime".equalsIgnoreCase(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getAppointmentDatetime)
                            : queryWrapper.orderByDesc(Appointment::getAppointmentDatetime);
                } else if ("bookingId".equalsIgnoreCase(field) || "bookId".equalsIgnoreCase(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getBookingId)
                            : queryWrapper.orderByDesc(Appointment::getBookingId);
                } else if ("status".equalsIgnoreCase(field)) {
                    queryWrapper = "asc".equalsIgnoreCase(sortOrder)
                            ? queryWrapper.orderByAsc(Appointment::getStatus)
                            : queryWrapper.orderByDesc(Appointment::getStatus);
                }
                // 可扩展其它字段
            }
        }
        if(nodata ||( queryWrapper==null)) {
            return  null;
        }
        return this.list(queryWrapper);
    }

     public int  getCountBetweenTime(java.sql.Timestamp startTime, java.sql.Timestamp endTime) {

       Long result =  lambdaQuery()
                .between(Appointment::getAppointmentDatetime,     startTime, endTime)
                .count();
         return result == null ? 0 : result.intValue();
    }
    //

    public PageResult<Appointment> getBetweenTimeByPage(String userId, String role,
                java.sql.Timestamp startTime, java.sql.Timestamp endTime,    
                                int pageNum,int pageSize,
                String status) { 
        // 先判断 userId 和 role 是否均不为空
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper=null;
log.debug(userId + role + startTime + endTime + pageNum + pageSize + status);
        List<String> bookingIdList = null;
        boolean nodata = false;   
                
        if (userId != null && !userId.isEmpty() && role != null && !role.isEmpty()) {
            // 按角色，从 booking 表查出对应 bookingId
            if ("teacher".equalsIgnoreCase(role) || "student".equalsIgnoreCase(role)) {
                BookingQueryParaDTO queryPara = new BookingQueryParaDTO();
                queryPara.setUserRole(role.toLowerCase());
                queryPara.setUserId(userId);
                bookingIdList = bookingMapper.selectByCondition(queryPara).stream()
                        .map(Booking::getBookingId)
                        .toList();
               log.debug(String.valueOf(bookingIdList));         
            }
            // bookingIdList 不为空则查这些bookingId，否则查空
            if (bookingIdList != null && !bookingIdList.isEmpty()) {
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                        .in(Appointment::getBookingId, bookingIdList)
                        .between(Appointment::getAppointmentDatetime, startTime, endTime)
                        .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) 
                        .orderByDesc(Appointment::getAppointmentDatetime)                                     
                        .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
    
                   
            }   else { //设置queryWrapper为空集合 
                nodata =true;    
            }
        } else {
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, startTime, endTime)                                                      
                     .eq(status != null && !status.isEmpty(), Appointment::getStatus, status)             
                     .orderByDesc(Appointment::getAppointmentDatetime)
                    .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
        } 

        Page<Appointment> page = new Page<>(pageNum, pageSize);
        if(nodata|| (queryWrapper==null)) { 
             page.setRecords(null);
             page.setTotal(0    );
        } else {
             page.setRecords(list(queryWrapper)); 
            Integer total = getCountBetweenTimeByPage(
                userId, role,
                startTime, endTime,   
                status);
            page.setTotal(total);
            }
        PageResult<Appointment> result = PageResult.of(page);
        return result ;
    }

     public int  getCountBetweenTimeByPage(
                String userId, String role,
                java.sql.Timestamp startTime, java.sql.Timestamp endTime,                   
                String status)  {
                    
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper=null;
        List<String> bookingIdList = null;
        if (userId != null && !userId.isEmpty() && role != null && !role.isEmpty()) {
            // 按角色，从 booking 表查出对应 bookingId
            if ("teacher".equalsIgnoreCase(role) || "student".equalsIgnoreCase(role)) {
                BookingQueryParaDTO queryPara = new BookingQueryParaDTO();
                queryPara.setUserRole(role.toLowerCase());
                queryPara.setUserId(userId);
                bookingIdList = bookingMapper.selectByCondition(queryPara).stream()
                        .map(Booking::getBookingId)
                        .toList();
            }
            // bookingIdList 不为空则查这些bookingId，否则查空
             
            if (bookingIdList != null && !bookingIdList.isEmpty()) {
                queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                        .in(Appointment::getBookingId, bookingIdList)
                        .between(Appointment::getAppointmentDatetime, startTime, endTime)
                        .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) ;
                         
            } else {
                // 没有相关预约，直接查空
               return 0;
            }
        } else {
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .between(Appointment::getAppointmentDatetime, startTime, endTime)
                    .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) ;            
                                                          
               } 
               if(queryWrapper==null)
                return 0;
          Long result = baseMapper.selectCount(queryWrapper);
 
         return result == null ? 0 : result.intValue();
    }


    
    public PageResult<Appointment> listByPage( int pageNum,int pageSize, 
                String status) {  
 //查询预约列表,分页查询    ,根据userId,role,状态查询
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper; 
       
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>()
                    .eq(status != null && !status.isEmpty(), Appointment::getStatus, status)
                    .orderByDesc(Appointment::getAppointmentDatetime)
                    .last("LIMIT " + ((pageNum - 1) * pageSize) + "," + pageSize);
        
        Page<Appointment> page = new Page<>(pageNum, pageSize);
        page.setRecords(list(queryWrapper));

        Integer total = getCountByPage( 
             status);
        page.setTotal(total);
        PageResult<Appointment> result = PageResult.of(page);
        return result ;
    }

     public int  getCountByPage(      
                String status)  {
                    
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment> queryWrapper; 
            // userId/role任一为空，则只按时间过滤
            queryWrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Appointment>() 
                    .eq(status != null && !status.isEmpty(), Appointment::getStatus, status) ;    
          Long result = baseMapper.selectCount(queryWrapper);
 
         return result == null ? 0 : result.intValue();
    }
    // 
     @Transactional
    public boolean updateStatusByBookingId(String bookingId,String status){

    // 调用 AppointmentMapper 的 updateStatusByBookingId 方法
    // 时间态闸（2026-10-11 方案 B1）：受控状态（申请/撤回）下，任一课次已开始即整批 409，
    // 避免逐条半成功。管理员确认类状态不拦（课后补处理特权）。
    //
    // 2026-10-28 S6：这里顺便把「改之前的课次」留一份，供驳回补扣判定用。
    // 必须在 UPDATE 之前取——批量更新后再查只能看到新状态，无法区分「原本在请假中」，
    // 于是会把每一次正常状态变更都当成驳回，进而误扣课时。
    List<Appointment> beforeList = lambdaQuery().eq(Appointment::getBookingId, bookingId).list();
    if (isTimeGateStatus(status)) {
        for (Appointment a : beforeList) {
            if (a != null && TimePhaseService.hasStarted(a.getAppointmentDatetime(),
                    ScheduleGenerator.nowUtc())) {
                throw new ConflictException(TermMsg.t("课程已开始，无法批量变更{lesson}状态"));
            }
        }
    }
    int updated = baseMapper.updateStatusByBookingId(bookingId, status);
    if (updated <= 0) {
        // 同 updateStatusById：0 行更新显式 404，杜绝 Result.success(false) 假成功（2026-10-11）
        throw new ResourceNotFoundException(TermMsg.t("{lesson}不存在或无权操作"));
    }
    // 整单驳回（rej-cancelling / booking → 课次还原 active）同样要补扣：
    // 只对「改之前处于请假中」的课次补，逐条复用与单条路径完全一致的判定。
    for (Appointment before : beforeList) {
        chargeIfLeaveRejected(before, status);
    }
    return updated > 0;
    }

      @Transactional
    public boolean updateStatusById(Integer id,String status){
    // 时间态闸（2026-10-11 方案 B1）：课次已开始/已结束，禁止申请请假/改期与撤回（409）。
    // 管理员确认类状态（cancelled/reject/t-cancelled/completed 等）不拦——课后补处理特权。
    Appointment current = baseMapper.selectById(id);
    if (current != null && isTimeGateStatus(status)
            && TimePhaseService.hasStarted(current.getAppointmentDatetime(), ScheduleGenerator.nowUtc())) {
        throw new ConflictException(TermMsg.t("该{lesson}已开始或已结束，无法提交{leave}申请"));
    }
    int updated = baseMapper.updateStatusById(id, status);
    if (updated <= 0) {
        // 0 行更新 = 课次不存在或 tenant_id 不匹配（租户插件给 UPDATE 追加了 tenant_id 条件，
        // 测试数据租户混乱时极易发生）。此前静默返回 false → Result.success(false) →
        // HTTP 200 + 审计记 success 的"假成功"，前端与审计都无从察觉
        //（2026-10-11「改期审计成功但列表无变化」排查定位的盲区）。显式 404 上抛。
        throw new ResourceNotFoundException(TermMsg.t("{lesson}不存在或无权操作"));
    }
    // 退费档位快照：申请提交（cancelling/t-cancelling）时按【提交时刻】判定并落库。
    // 管理端审核（/refund-rule/hint 与结算）读快照执行，不按确认时刻重算。
    // 快照失败不阻断申请（warn 后继续），结算侧对无快照行回落现状。
    if (updated > 0 && current != null
            && ("cancelling".equalsIgnoreCase(status) || "t-cancelling".equalsIgnoreCase(status))) {
        try {
            String snapshot = refundRuleService.captureSnapshotJson(id);
            if (snapshot != null) {
                current.setRefundSnapshot(snapshot);
                current.setStatus(status); // 2026-10-11 方案 B1：快照落库时 status 已变更，需同步 current.status
                baseMapper.updateById(current);
            }
        } catch (Exception e) {
            log.warn("退费档位快照落库失败, appointmentId={}, 原因={}", id, e.getMessage());
        }
    }
    // 请假被驳回：状态从 cancelling 族退回非免扣态（通常是 active），必须补扣课时。
    // 见 chargeIfLeaveRejected 注释——这是「申假即免扣」口径下唯一的漏扣口子。
    chargeIfLeaveRejected(current, status);
    return updated > 0;
    }

    /**
     * 请假被驳回时的补扣（2026-10-28 S6）。
     *
     * <h3>补的是什么漏洞</h3>
     * 扣减规则是「只要有请假申请就不扣」（用户 2026-10-28 拍板，申请即算），
     * 于是「先申请 → 不扣 → 事后被管理员驳回 → 课还是上了」就白嫖了一节课。
     * 驳回会把状态退回 {@code active}，但此时课次已经不在「免扣」之列，
     * 却没有第二次扣减的触发点——流水里永远不会有这一笔。
     *
     * <h3>为什么这里不会重复扣</h3>
     * 走的是同一个 {@code classroom:{appointmentId}} 幂等键：
     * 若该课次此前已被结算（例如先 completed 后又被改成 cancelling 再驳回），
     * 插入流水会撞唯一键，按「已结算」直接返回。
     *
     * <h3>为什么失败只 warn</h3>
     * 补扣是账务动作，不能让「修改课次状态」这个业务操作失败——状态已经改成功了，
     * 抛异常只会让前端看到报错而实际已生效。留 WARN 供对账发现，缺口由兜底任务补。
     */
    void chargeIfLeaveRejected(Appointment before, String newStatus) {
        if (before == null || before.getId() == null) {
            return;
        }
        String oldStatus = before.getStatus();
        // 只处理「原来在请假中」的场景：原本就是 active 的课次不会因这次改状态而产生新欠费
        if (!com.reservation.common.AppointmentStatus.isCancelling(oldStatus)) {
            return;
        }
        // 新状态仍属免扣（改成 cancelled / t-cancelled / changed 等）→ 不需要补扣
        if (com.reservation.common.AppointmentStatus.isLessonExempt(newStatus)) {
            return;
        }
        if (com.reservation.common.AppointmentStatus.CHECKED_IN.equalsIgnoreCase(newStatus)
                || com.reservation.common.AppointmentStatus.ACTIVE.equalsIgnoreCase(newStatus)
                || com.reservation.common.AppointmentStatus.NOTED1.equalsIgnoreCase(newStatus)
                || com.reservation.common.AppointmentStatus.NOTED2.equalsIgnoreCase(newStatus)) {
            try {
                // 重新取一次：拿到已落库的最新状态，避免用调用方传进来的旧对象判免扣
                Appointment fresh = baseMapper.selectById(before.getId());
                if (fresh == null) {
                    return;
                }
                lessonDeductionService.settleByAppointment(fresh);
                log.info("请假被驳回，已补扣课时: appointmentId={}, {} → {}",
                        before.getId(), oldStatus, newStatus);
            } catch (Exception e) {
                log.warn("请假驳回补扣失败(需对账兜底): appointmentId={}, {} → {}, 原因={}",
                        before.getId(), oldStatus, newStatus, e.getMessage());
            }
        }
    }

public boolean removeById(Integer appId){
        log.info("删除预约时间开始, appointmentId={}", appId);
        // 先清该课次的通知发送流水。notification_dispatch_log 的幂等键
        // uk_dispatch_once(appointment_id, seq, receiver_user_id, dedup_key) 含 appointment_id，
        // 留着流水会让这个课次此后的通知永远发不出去（每次插入都撞唯一键）。
        // 实测该表已有 12 行指向不存在的课次——同类问题的既有证据。
        cascadeService.run(CascadeRules.SCENARIO_APPOINTMENT_DELETE, String.valueOf(appId));
        int deleted = baseMapper.deleteById(appId);
        log.info("删除预约时间结束, appointmentId={}, 影响行数={}", appId, deleted);
        return deleted > 0;
    }

    public boolean removeByBookingId(String bookingId){
        log.info("按预约ID批量删除预约时间开始, bookingId={}", bookingId);
        // 同样先清通知流水：批量删课次前逐个清理，否则留下悬空流水。
        // 这里不逐条调 removeById（那是 N 次 SQL），而是先取出课次 id 集合再批量清。
        if (bookingId != null && !bookingId.trim().isEmpty()) {
            List<Appointment> appts = getByBookingId(bookingId);
            if (appts != null && !appts.isEmpty()) {
                List<String> apptIds = appts.stream()
                        .map(a -> String.valueOf(a.getId()))
                        .collect(Collectors.toList());
                cascadeService.run(CascadeRules.SCENARIO_APPOINTMENT_DELETE, apptIds);
            }
        }
        int deleted = baseMapper.deleteByBookingId(bookingId);
        log.info("按预约ID批量删除预约时间结束, bookingId={}, 影响行数={}", bookingId, deleted);
        return deleted > 0;
    }
/**
 * 统计指定时间段以及状态下的预约数量（int）
 * 用于Controller直接调用，参数可以为 LocalDateTime 或 Timestamp，内部统一为 Timestamp 以便数据库查询。
 *
 * @param startTime 开始时间（java.time.LocalDateTime 或 java.sql.Timestamp）
 * @param endTime 结束时间
 * @param statuses 状态列表
 * @return 数量（int类型），适合 Controller 层调用
 */
public int countByTimeAndStatuses(Object startTime, Object endTime, java.util.List<String> statuses) {
    java.sql.Timestamp startTs, endTs;
    if (startTime instanceof java.sql.Timestamp) {
        startTs = (java.sql.Timestamp) startTime;
    } else if (startTime instanceof java.time.LocalDateTime) {
        startTs = java.sql.Timestamp.valueOf((java.time.LocalDateTime) startTime);
    } else {
        throw new IllegalArgumentException("startTime类型不支持: " + startTime.getClass());
    }
    if (endTime instanceof java.sql.Timestamp) {
        endTs = (java.sql.Timestamp) endTime;
    } else if (endTime instanceof java.time.LocalDateTime) {
        endTs = java.sql.Timestamp.valueOf((java.time.LocalDateTime) endTime);
    } else {
        throw new IllegalArgumentException("endTime类型不支持: " + endTime.getClass());
    }

    Long result = lambdaQuery()
            .ge(Appointment::getAppointmentDatetime, startTs.toLocalDateTime())
            .le(Appointment::getAppointmentDatetime, endTs.toLocalDateTime())
            .in(Appointment::getStatus, statuses)
            .count();
    return result == null ? 0 : result.intValue();
}

}