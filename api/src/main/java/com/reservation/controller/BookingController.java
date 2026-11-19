package com.reservation.controller;

import com.reservation.common.*;
import com.reservation.entity.Booking;
import com.reservation.dto.BookingQueryParaDTO;
import com.reservation.dto.BookingDTO;
import com.reservation.exception.BusinessException;
import com.reservation.query.BookingQueryPage;
import com.reservation.service.BookingService;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.service.MessageNotifyService;
import com.reservation.utils.PermissionCheck;
import com.reservation.utils.TermMsg;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/v1/course/booking")
@RequiredArgsConstructor
@Slf4j
public class BookingController {
    private final BookingService bookingService;
    private final MessageNotifyService messageNotifyService;
    private final PermissionCheck permissionCheck;
//create/update/updateStatus：返回id
    @PostMapping("/create")
    @Audit(action = AuditAction.BOOKING_CREATE, resourceType = "booking")
    public Result<String> create(@RequestBody Booking booking,
                                 @RequestHeader("Authorization") String token) {
        // 方法级兜底（2026-10-10 P1-4）：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
        try {
            // 归属收口（2026-11-19 H-1）：原先 studentId 完全信任请求体，
            // 学生改一个字段就能替别人下单 / 把席位记到别人名下。
            applyOwnerOnCreate(token, booking);
            String id = bookingService.create(booking);
            // 系统自动通知：学生预订课程 → 对应教师 + 本租户管理员
            // status='waiting' 为候补预订（排期名额已满时的候补申请），用候补文案单独通知
            if ("waiting".equalsIgnoreCase(booking.getStatus())) {
                messageNotifyService.notifyWaitlistCreated(id);
            } else {
                messageNotifyService.notifyBookingCreated(id);
            }
            return Result.success(id,"ok");
        } catch (IllegalArgumentException e) {
            // 契约：失败必须给出可判定的错误码。历史写为 fail(null,...)，
            // 叠加 non_null 序列化会让 code 字段整个消失，客户端只能读到 message。
            return Result.fail(400, e.getMessage());
        } catch (BusinessException e) {
            // 归属校验失败给 400（"请指定学生" / "学生不属于当前机构"），与上面同形
            return Result.fail(400, e.getMessage());
        }
    }

    @PostMapping("/update/{id}")
    public Result<String> update(@PathVariable String id, @RequestBody Booking booking,
                                 @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN
        permissionCheck.checkAdmin(token);
        try {
            return Result.success(bookingService.update(id, booking),"ok");
        } catch (RuntimeException e) {
            // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
            // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
            return ErrorCodes.fail(e);
        }
    }
//@PathVariable String id, 
    @PostMapping("/updateStatus")
    public Result<String> updateStatus(@RequestBody(required = true) BookingDTO dto,
                                       @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES（≡checkAnyLogin）。
        // 本端点是复用端点：学生自助操作（撤销/撤销候补/取消预约/撤回取消/重新申请，
        // student-bookingBrowserCards.js 的 5 种 actionForButton 全走它）与管理员确认/驳回预订共用。
        // 2026-10-10 P1 曾按"确认/驳回"的管理语义收紧为 checkAdmin，误伤学生 → 取消预约 403
        // （同款教训见 /course/list，AuthzRules 同日登记）。现统一 checkAnyLogin 恢复学生自助；
        // 数据级归属校验（学生只能改自己的预订）已于 2026-11-19 补在下面（H-1）：
        // 只对学生收口，管理员与教师路径保持原样，避免重演 2026-10-10 的误伤。
        permissionCheck.checkAnyLogin(token);
        try {
            // 归属校验（H-1）：先取当前行，学生只能改自己的预订。
            // 取不到行（id 不存在）时不在这里拦——交给 service 抛「预订记录不存在」，
            // 保持既有的 500/400 错误语义，不在控制器里另造一套。
            Booking owned = bookingService.selectById(dto.getId());
            if (owned != null) {
                permissionCheck.checkStudentSelf(token, owned.getStudentId());
            }
            String rs = bookingService.updateStatus(dto);
            // 系统自动通知：管理员确认预订 → 该学生（仅"确认"状态触发）
            // 注意：若本次是「候补 → booked」，Service 内部会转到递补逻辑（需校验名额并生成课次），
            //      此时同样给该学生发一条确认消息，保证两条入口的通知行为一致。
            if ("bookProved".equals(dto.getStatus()) || "booked".equals(dto.getStatus())) {
                // 只传语义动作码；「{course}预约」这类含行业词的文案由 MessageNotifyService 持有并按租户渲染
                messageNotifyService.notifyStudentConfirmed(dto.getId(), MessageNotifyService.ACTION_BOOKING);
            }
            return Result.success(rs,"ok");
        } catch (RuntimeException e) {
            return Result.fail(500, e.getMessage());
        }
    }

    /**
     * 查询某排期的候补队列，按申请时间升序——次序即递补次序（先来先得）。
     *
     * <p>课程排期页用它渲染「候补队列」；学生端「今日课程」提示条也用它计算排队位置。
     * 只返回 status='waiting' 的记录，不占席位。
     */
    @GetMapping("/waitlist/{scheduleId}")
    @ResponseBody
    public Result<List<Booking>> getWaitlistQueue(@PathVariable("scheduleId") String scheduleId,
                                                  @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
        try {
            return Result.success(bookingService.getWaitlistQueue(scheduleId), "ok");
        } catch (RuntimeException e) {
            return Result.fail(500, e.getMessage());
        }
    }

    /**
     * 递补：把一条候补（waiting）晋升为正式预订（booked），并生成该学生的课次时间列表。
     *
     * <p>服务端保证：名额校验（候补不占位，空位可能已被订走）、CAS 防并发重复递补、
     * 课次生成幂等。成功后自动发消息通知该学生。
     */
    @PostMapping("/waitlist/promote")
    @Audit(action = AuditAction.BOOKING_CONFIRM, resourceType = "booking")
    public Result<Map<String, Object>> promoteWaitlist(@RequestBody BookingDTO dto,
                                                       @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN（递补占名额）
        permissionCheck.checkAdmin(token);
        try {
            Map<String, Object> data = bookingService.promoteWaitlist(dto.getId());
            // 系统自动通知：递补成功 → 该学生（发送者=当前登录管理员）
            messageNotifyService.notifyWaitlistPromoted(dto.getId());
            return Result.success(data, TermMsg.t("递补成功，已生成{lessonNumber}并通知{student}"));
        } catch (RuntimeException e) {
            return Result.fail(500, e.getMessage());
        }
    }

    /**
     * 查询指定排期(scheduleId)下的所有booking
     * @param scheduleId 排期ID
     * @return booking列表
     */
    @GetMapping("/ListByScheduleId/{scheduleId}")
    @ResponseBody
    public Result<List<Booking>> getBookingListBySchedule(@PathVariable("scheduleId") String scheduleId,
                                                          @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
        BookingQueryParaDTO dto= new BookingQueryParaDTO();
      dto.setScheduleId(scheduleId);

        try {
            List<Booking> bookings = bookingService.selectList(dto);
            return Result.success(bookings, "ok");
        } catch (RuntimeException e) {
            // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
            // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
            return ErrorCodes.fail(e);
        }
    }

     @GetMapping("/countByScheduleId/{scheduleId}")
    @ResponseBody
    public Result<Integer> getBookingCountBySchedule(@PathVariable("scheduleId") String scheduleId,
                                                     @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
      BookingQueryParaDTO dto= new BookingQueryParaDTO();
      dto.setScheduleId(scheduleId);

        try {
            Integer count = bookingService.getBookingCountByScheduleId(scheduleId);
            return Result.success(count, "ok");
        } catch (RuntimeException e) {
            // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
            // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
            return ErrorCodes.fail(e);
        }
    }

    @PostMapping("/list")
    @ResponseBody
    public Result<List<Booking>> filterList(@RequestBody BookingQueryParaDTO dto,
                                            @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
        // 学生视角收窄（2026-11-19 H-1）：教师端与管理端共用本端点，所以**按角色分支**——
        // 学生强制本人（忽略请求体），其余角色原样透传。
        // 原先完全信任请求体里的 userId/userRole：把 userRole 删掉即可拉到同租户全部预订
        // （含他人 student_id / teacher_id）。SQL 侧本就支持这两列过滤，缺的只是不信任客户端。
        scopeStudentSelf(token, dto);
        //  log.debug("booking list input dto: " + dto);
         try {
           List<Booking> rs = bookingService.selectList(dto);
          
          //  log.debug("filterList 返回预约列表: " + rs); 
             return Result.success(rs,"ok");
            } catch (RuntimeException e) {
                 // log.debug("filterList fail: " + e.getMessage());
             // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
             // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
             return ErrorCodes.fail(e);
        } 
    }

    @PostMapping("/page")
    @ResponseBody
    public Result<PageResult<Booking>> filterListPage(@RequestBody BookingQueryPage dto,
                                                      @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
        // 学生视角收窄（H-1）：同 /list，按角色分支，学生强制本人
        if (permissionCheck.isStudent(token)) {
            dto.setUserId(permissionCheck.getUserIdFromToken(token));
            dto.setUserRole(RoleConst.STUDENT);
        }
        //  log.debug("booking list input dto: " + dto);
         try {
           PageResult <Booking> rs = bookingService.selectListPage(dto);
           
             return Result.success(rs,"ok");
            } catch (RuntimeException e) {
                 // log.debug("filterList fail: " + e.getMessage());
             // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
             // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
             return ErrorCodes.fail(e);
        } 
    }


    @GetMapping("/{id}")
    public Result<Booking> getById(@PathVariable String id,
                                   @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 ALL_ROLES
        permissionCheck.checkAnyLogin(token);
        Booking bk = bookingService.selectById(id);
        // 归属校验（H-1）：学生只能看自己的预订；管理员/教师保持放行
        if (bk != null) {
            permissionCheck.checkStudentSelf(token, bk.getStudentId());
        }
        return  Result.success(bk,"ok");
    }

    /**
     * 学生下单时的归属收口（2026-11-19 H-1）。
     *
     * <p>学生：{@code studentId} 一律取令牌里的 userId，<b>不信任请求体</b>；
     * 管理员/教师代订：保留请求体，但要求目标账号真实存在且（非平台管理员时）属于本租户——
     * 同租户判定借租户插件完成，详见 {@link PermissionCheck#assertSameTenantUser}。
     *
     * <p>教师维度（教师代订时还要求排期在自己课下）本批未做，见安全分析参考文档的待做清单。
     */
    private void applyOwnerOnCreate(String token, Booking booking) {
        if (permissionCheck.isStudent(token)) {
            booking.setStudentId(permissionCheck.getUserIdFromToken(token));
            return;
        }
        // 代订：管理员/教师代下必须明确指定学生，且必须落在本租户内
        permissionCheck.assertSameTenantUser(booking.getStudentId(), "学生");
    }

    /**
     * {@code /list} 的学生视角收窄：把查询条件里的 userId/userRole 强制改写为本人。
     * 仅在调用者是学生时生效——教师端与管理端也在用这个端点，不能被一起改掉。
     */
    private void scopeStudentSelf(String token, BookingQueryParaDTO dto) {
        if (dto == null || !permissionCheck.isStudent(token)) {
            return;
        }
        dto.setUserId(permissionCheck.getUserIdFromToken(token));
        dto.setUserRole(RoleConst.STUDENT);
    }


    /**
     * 统计某年月的预约（Booking）数量：月初（0点）和月末（23:59:59）
     * 前端调用: GET /booking/statistical/byMonth?year=2024&month=6
     * 返回: { "bookingMonthStart": 32, "bookingMonthEnd": 44 }
     */
    @GetMapping("/statistical/byMonth")
    @ResponseBody
    public Result<java.util.Map<String, Integer>> getBookingStatisticalByMonth(
            @RequestParam("year") int year,
            @RequestParam("month") int month,
            @RequestHeader("Authorization") String token
    ) {
        // 方法级兜底：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN（管理面统计）
        permissionCheck.checkAdmin(token);
        // 获取月初和月末的具体时间
        java.time.LocalDate monthStart = java.time.LocalDate.of(year, month, 1);
        java.time.LocalDate monthEnd = monthStart.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());

        // 月初：00:00:00
        java.time.LocalDateTime monthStartTime = monthStart.atStartOfDay();
        // 月末：23:59:59
        java.time.LocalDateTime monthEndTime = monthEnd.atTime(23, 59, 59);

        // 统计月初到月末预约数量 统计某年月的预约（Booking）数量 
        int bookingMonth  = bookingService.countBookingAtDate(java.sql.Timestamp.valueOf(monthStartTime),java.sql.Timestamp.valueOf(monthEndTime));

    // 计算上一月的起始和结束时间
        java.time.LocalDate prevMonth = monthStart.minusMonths(1);
        java.time.LocalDate prevMonthStart = prevMonth.withDayOfMonth(1);
        java.time.LocalDate prevMonthEnd = prevMonth.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());
        java.time.LocalDateTime prevMonthStartTime = prevMonthStart.atStartOfDay();
        java.time.LocalDateTime prevMonthEndTime = prevMonthEnd.atTime(23, 59, 59);

   // 上月统计月初到月末预约数量 统计某年月的预约（Booking）数量 
        int bookingMonthLast  = bookingService.countBookingAtDate(java.sql.Timestamp.valueOf(prevMonthStartTime),java.sql.Timestamp.valueOf(prevMonthEndTime));

       // log.debug(" /statistical/byMonth:"+year+","+month+","+monthStartTime+","+monthEndTime+","+prevMonthStartTime+","+prevMonthEndTime);
        java.util.Map<String, Integer> data = new java.util.HashMap<>();
        data.put("bookingMonth", bookingMonth);
        data.put("bookingMonthLast", bookingMonthLast);

        return Result.success(data, "查询成功");
    }
    
    // 经检查，当前 BookingController.java 文件不存在明显的语法错误。所有注解、方法和 Java 语法均正常。如果还需优化具体业务逻辑或风格，请明确说明需求。

    @DeleteMapping("/delete/{id}")
    @Audit(action = AuditAction.BOOKING_CANCEL, resourceType = "booking", resourceId = "id")
    public Result<Integer> delete(@PathVariable String id,
                                  @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN
        permissionCheck.checkAdmin(token);
        try {
           int rows= bookingService.delete(id);
            return Result.success(rows,"delete");
        } catch (RuntimeException e) {
            // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
            // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
            return ErrorCodes.fail(e);
        }
    }
    @DeleteMapping("/deleteByScheduleId/{id}")
    public Result<Integer> deleteByScheduleId(@PathVariable String id,
                                              @RequestHeader("Authorization") String token) {
        // 方法级兜底：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN（级联删预订）
        permissionCheck.checkAdmin(token);
        return Result.success(bookingService.deleteByScheduleId(id),"ok");
    }
}
