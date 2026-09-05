package  com.reservation.controller;

import com.reservation.entity.Appointment;
import com.reservation.dto.BookingDTO;//借用数据定义
import com.reservation.service.AppointmentService;
import com.reservation.service.MessageNotifyService;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.common.*;
import com.reservation.query.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List; 
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/course/appointment")
@Slf4j
public class AppointmentController {

    @Autowired
    private AppointmentService appointmentService;
    @Autowired
    private MessageNotifyService messageNotifyService;

    /**
     * 1. 新增预约时间
     */
    @PostMapping("/add")
    /**
     * 新增预约时间接口
     * 
     * 插入数据处理流程分析：
     * 1. 客户端发送 POST 请求，JSON 中包含 Appointment 字段。
     * 2. SpringMVC 通过 @RequestBody 自动反序列化 JSON 到 Appointment 类型。
     * 3. 控制器收到 Appointment 对象。可在此进行参数校验、日志记录。
     * 4. 调用 appointmentService.save(appointment)，即调用 MyBatis-Plus 通用 save 方法：
     *    - 内部校验 appointment 的主键/必需字段。
     *    - 构造 SQL INSERT 语句，将 appointment 对象属性映射到数据库表字段。
     *    - 执行插入操作，写入 appointment 表。
     *    - 保存成功返回 true，否则抛出异常或返回 false。
     * 5. 返回统一 Result<Boolean> 响应，data 为 true/false，message 统一为 "ok"。
     */
    public Result<Boolean> add(@RequestBody Appointment appointment) {
       // log.debug("add controller: " + appointment); // 日志：打印待插入实体内容
        boolean success = appointmentService.save(appointment); // 实际写入数据库表
        // 系统自动通知：学生请假 → 对应教师 + 本租户管理员
        messageNotifyService.notifyLeaveCreated(appointment.getBookingId());
        return Result.success(success, "ok");
    } 
//批量添加时间表
 /*   @PostMapping("/addBatch")
    public Result<Boolean> add(@RequestBody List<Appointment> appointment) {
         return Result.success(appointmentService.saveBatch(appointment),"ok");
    }
*/
    /**
     * 2. 根据ID删除
     */
    @DeleteMapping("/delete/{id}")
    public Result<Boolean> delete(@PathVariable Integer id) {
        return Result.success(appointmentService.removeById(id),"ok");
    }
    /**
     * 对应前端 axios:
     * axios.delete(`${API_BASE_URL}/course/appointment/deleteByBookingId`, {
     *     headers: { "Authorization": "Bearer " + token },
     *     params: { bookingId }
     * });
     */
    @DeleteMapping("/deleteByBookingId")
    public Result<Boolean> deleteByBookingId(@RequestParam String bookingId) {
        return Result.success(appointmentService.removeByBookingId(bookingId),"ok");
    }
    /**
     * 3. 根据ID修改
     */
    @PutMapping("/update")
    public Result<Boolean> update(@RequestBody Appointment appointment) {
        return Result.success(appointmentService.updateById(appointment),"ok");
    }

    @PutMapping("/updateStatusByBookingId")
    public Result<Boolean> updateStatusByBookingId(@RequestParam String bookingId,@RequestParam String status) {
        return Result.success(appointmentService.updateStatusByBookingId(bookingId,status),"ok");
    }

      @PutMapping("/updateStatusById")
    @Audit(action = AuditAction.APPOINTMENT_NOTE, resourceType = "appointment")
    public Result<Boolean> updateStatusById(@RequestBody BookingDTO  params) {
        String id = params.getId();
        String status = params.getStatus();
        boolean ok = appointmentService.updateStatusById(Integer.parseInt(id), status);
        // 系统自动通知：管理员确认请假 → 该学生
        try {
            Appointment appt = appointmentService.getById(Integer.parseInt(id));
            if (appt != null && appt.getBookingId() != null) {
                messageNotifyService.notifyStudentConfirmed(appt.getBookingId(), "请假");
            }
        } catch (Exception ignore) { /* 通知失败不影响主流程 */ }
        return Result.success(ok, "ok");
    }
    /**
     * 4. 根据ID查询单条
     */
    @GetMapping("/get/{id}")
    public Result<Appointment> getById(@PathVariable Integer id) {
        return Result.success(appointmentService.getById(id),"ok");
    }

    /**
     * 5. 查询所有预约时间
     */
    @GetMapping("/list")
    public Result<List<Appointment>> list() {
        return Result.success(appointmentService.list(),"ok");
    }
  
      @PostMapping("/listByPage")
    public Result<PageResult<Appointment>> listByPage(@RequestBody AppointmentQueryPage query) {
        return Result.success(appointmentService.listByPage(query.getPageNum(),query.getPageSize(),query.getStatus()),"ok");
    }
    /**
     * 查询指定 bookingId 的预约列表
     * GET /course/appointment/listByBookingId?bookingId=xxx
     */   
    
    @GetMapping("/getByBookingId")
    public Result<List<Appointment>> getByBookingId(@RequestParam("bookingId") String bookingId) {
        return Result.success(appointmentService.getByBookingId(bookingId),"ok");
    }

    // 根据状态查询
    @GetMapping("/getByStatus")
    public Result<List<Appointment>> getByStatus(@RequestParam String status) {
        return Result.success(appointmentService.getByStatus(status),"ok");
    }
 

    @GetMapping("/statistical/byMonth")
    @ResponseBody
    public Result<java.util.Map<String, Integer>> countByTimeAndStatus(
            @RequestParam("year") int year,
            @RequestParam("month") int month
    ) {
        // 获取月初和月末的具体时间
        java.time.LocalDate monthStart = java.time.LocalDate.of(year, month, 1);
        java.time.LocalDate monthEnd = monthStart.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());

        // 月初：00:00:00
        java.time.LocalDateTime monthStartTime = monthStart.atStartOfDay();
        // 月末：23:59:59
        java.time.LocalDateTime monthEndTime = monthEnd.atTime(23, 59, 59);

        // 统计月初到月末预约数量 统计某年月的预约（Booking）数量 
        int bookingMonth  = appointmentService.countByTimeAndStatuses(java.sql.Timestamp.valueOf(monthStartTime),java.sql.Timestamp.valueOf(monthEndTime), java.util.Arrays.asList("active", "completed"));

        // 计算上一月的起始和结束时间
        java.time.LocalDate prevMonth = monthStart.minusMonths(1);
        java.time.LocalDate prevMonthStart = prevMonth.withDayOfMonth(1);
        java.time.LocalDate prevMonthEnd = prevMonth.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());
        java.time.LocalDateTime prevMonthStartTime = prevMonthStart.atStartOfDay();
        java.time.LocalDateTime prevMonthEndTime = prevMonthEnd.atTime(23, 59, 59);

        // 上月统计月初到月末预约数量 统计某年月的预约（Booking）数量 
        int bookingMonthLast  = appointmentService.countByTimeAndStatuses(java.sql.Timestamp.valueOf(prevMonthStartTime),java.sql.Timestamp.valueOf(prevMonthEndTime), java.util.Arrays.asList("active", "completed"));

        java.util.Map<String, Integer> data = new java.util.HashMap<>();
        data.put("appMonth", bookingMonth);
        data.put("appMonthLast", bookingMonthLast);

        return Result.success(data, "查询成功");
    }

    /**
     * 统计指定天数days内的预约（appointment）预约列表（含active/completed状态）
     * @param days 近几天（如3表示近3天）
     * @return 预约列表
     */
    @GetMapping("/statistical/listByDays")
    @ResponseBody
    public Result<List<Appointment>> listByDays(
             @RequestParam("days") int days,
             @RequestParam(required = false, defaultValue = "") String userId,
             @RequestParam(required = false, defaultValue = "")  String role,
             @RequestParam(required = false, defaultValue = "appointmentDatetime") String sortField,
             @RequestParam(required = false, defaultValue = "asc") String sortOrder
    ) { 
       //  log.debug("listByDays  listByDays 参数：days = " + days);
        // 获取当前时间（now）和days天之后的相同时间
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        java.time.LocalDateTime endOfPeriod = now.plusDays(days);
   
 //getBetweenTime
        List<Appointment> appList
         = appointmentService.getBetweenTime(
                userId,role,
                java.sql.Timestamp.valueOf(now),
                java.sql.Timestamp.valueOf(endOfPeriod),
                sortField, sortOrder
         ); 
        return Result.success(appList, "查询成功");
    }
// 
    @PostMapping("/statistical/listByDaysByPage")
    @ResponseBody        
    public Result<PageResult<Appointment>> listByDaysByPage(@RequestBody AppointmentQueryPage query  ) { 
        log.debug("listByDaysByPage   参数：days = " + query);
        // 获取当前时间（now）和days天之后的相同时间
        Integer days = query.getDays();
        java.time.LocalDateTime startOfPeriod,endOfPeriod;
        if(days<=0)
        { // 全部数据，不限制时间：使用 MySQL DATETIME 合法边界作为最早/最晚时间
          // LocalDateTime.MIN / MAX 超出 Timestamp & MySQL DATETIME 支持范围，会触发 valueOf 转换异常或写入异常
          startOfPeriod = java.time.LocalDateTime.of(1000, 1, 1, 0, 0, 0);
          endOfPeriod   = java.time.LocalDateTime.of(9999, 12, 31, 23, 59, 59);
        } else {
          startOfPeriod = java.time.LocalDateTime.now();
          endOfPeriod = startOfPeriod.plusDays(days);
        }
        Integer pageNum = (query.getPageNum() != null) ? query.getPageNum() : null;
        Integer pageSize = (query.getPageSize() != null) ? query.getPageSize() : null;

        //getBetweenTime
        PageResult<Appointment> appList
            = appointmentService.getBetweenTimeByPage(
                query.getUserId(),
                query.getUserRole(),
                java.sql.Timestamp.valueOf(startOfPeriod),
                java.sql.Timestamp.valueOf(endOfPeriod),
                pageNum,
                pageSize,
                query.getStatus()
        ); 
        return Result.success(appList, "查询成功");
    }
 // 对应前端调用示例（appointmentNotes.js）:
    // 
    // async function getAppointmentListPage(query ) {
    //   try {
    //       const res  = await request({
    //         url: `${API_BASE_URL}/course/appointment/statistical/listByDaysByPage`, 
    //         Method: "get", 
    //         data: query
    //       });
    //       return res;
    //     } catch (e) {
    //      console.error("getAppointmentListPage",e);
    //      return null;
    //     }
    // }
    //

/**
     * 统计指定天数days内的预约（appointment）数量 
     * @param days 近几天（如3表示近3天）
     * @return 预约数量
     */
    @GetMapping("/statistical/onDays")
    @ResponseBody
    public Result<Integer> countByTimeOnDays(
            @RequestParam("ondays") int days
    ) { 
        // INSERT_YOUR_CODE
       // log.debug("onDays countByTimeOnDays ondays = " + days);

        // now为当日零点
        java.time.LocalDateTime now = java.time.LocalDate.now().atStartOfDay();
        // endOfPeriod为days后的零点（不含最后一天）
        java.time.LocalDateTime endOfPeriod = now.plusDays(days);
   
 //getBetweenTime
        int count
         = appointmentService.getCountBetweenTime(
                java.sql.Timestamp.valueOf(now),
                java.sql.Timestamp.valueOf(endOfPeriod));
 
        return Result.success(count, "查询成功");
    }
}