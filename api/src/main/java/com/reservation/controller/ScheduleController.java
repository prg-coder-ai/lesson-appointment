package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.CourseSchedule;
import com.reservation.dto.*;/*.ScheduleCreateDTO; 
import com.reservation.entity.IncSiteBody;
import com.reservation.entity.StatusBody;
import com.reservation.entity.SchedulePO;
import com.reservation.entity.ScheduleVO;
import com.reservation.entity.ScheduleGenerateDTO;*/

import com.reservation.service.CourseScheduleService; 
import  com.reservation.common.ScheduleGenerator; 
import com.reservation.service.ClassroomEventPushService;
import com.reservation.utils.PermissionCheck;
import com.reservation.utils.TenantContext;
import com.reservation.utils.TermMsg;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;

import com.reservation.query.*;
import com.reservation.common.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
//import jakarta.annotation.Resource;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
//import java.time.*;
// /course/schedule-->/schedule
@RestController
@RequestMapping("/api/v1/schedule")
@Slf4j
public class ScheduleController {

    @Autowired
    private CourseScheduleService scheduleService;
    @Autowired
    private PermissionCheck permissionCheck;
    /** 排期事件推送（我的课堂「同步课堂」用：把缺失的课次课堂补建出来） */
    @Autowired
    private ClassroomEventPushService classroomEventPushService;
    // 创建排期
    @PostMapping("/create")
    @Audit(action = AuditAction.SCHEDULE_CREATE, resourceType = "schedule")
    @ResponseBody
    public Result<Map<String, String>>  createSchedule(@Validated @RequestBody ScheduleCreateDTO dto,
                                                   @RequestHeader("Authorization") String token) {
         permissionCheck.checkTeacherOrAdmin(token);
         Map<String, String> resultMap = scheduleService.createSchedule(dto);//////TBD: local->UTC switch
        return Result.success(resultMap,"ok");
    }

    // 修改排期
    @PostMapping("/update")
    @ResponseBody
    public Result<Map<String, String>> updateSchedule(@Validated @RequestBody ScheduleCreateDTO dto,
                                      @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        Map<String, String> rst = scheduleService.update(dto); // TBD: local->UTC switch
        return Result.success(rst,"更新成功");
    }

 // 更新可用数incSiteBody { "inc":1、-1 ，"id":scheduleId)
    @PostMapping("/incSite")
    @ResponseBody
    public Result<String> ScheduleIncSite(@Validated @RequestBody IncSiteBody dto,
                                    @RequestHeader("Authorization") String token) {
         permissionCheck.checkTeacherOrAdmin(token);
        String scheduleId = scheduleService.updateScheduleSites(dto);
        return Result.success(scheduleId,"");
    }
    
    // 更新状态 (scheduleId，status)
    @PostMapping("/updateStatus")
     @ResponseBody
    public Result<String> updateStatus(@Validated @RequestBody StatusBody dto) { 

        String scheduleId = scheduleService.updateStatus(dto);////TBD: local->UTC switch
     //  log.debug("updateStatus:" + dto);
        return Result.success(scheduleId,"");
    }
    
    // 查询排期详情（不含展开后的实例，用于前端展示）
    @GetMapping("/detail/{id}")
     @ResponseBody
    public Result<CourseSchedule> getScheduleDetail(@PathVariable String id) {
        CourseSchedule schedule = scheduleService.selectById(id);////TBD: UTC-->local switch
        return Result.success(   schedule,"ok");
    }

//输入可能的检索参数，暂保留
    @GetMapping("/list")
     @ResponseBody
    public Result<List<ScheduleCreateDTO>> getScheduleList(@Validated  @RequestBody(required = false) ScheduleCreateDTO dtoA,
                   @RequestHeader("Authorization") String token) {
                     ScheduleCreateDTO dto = new ScheduleCreateDTO();
                             System.out .println("getScheduleList dto:" + dtoA);
              dto.setScheduleId(null); 
              dto.setStartDate(null);
              dto.setAvailableSites(null);
              dto.setStartTime(null);
              dto.setEndTime(null);
              dto.setRepeatType(null);
              dto.setRepeatInterval(null);
              dto.setRepeatDays(null);
          
               dto.setStatus("active");
               
              dto.setTimeZone(null);
         
              dto.setCourseId(null); // courseId


        List<ScheduleCreateDTO> schedules = scheduleService.selectList(dto); //TBD: UTC-->local switch
        return Result.success(schedules,"ok");
    }
 
    @PostMapping("/page")
    @ResponseBody
    public Result<PageResult<ScheduleCreateDTO>> filterListPage(@RequestBody ScheduleQueryPage query) {
          
         try {
           PageResult <ScheduleCreateDTO> rs = scheduleService.selectListPage(query);
           
             return Result.success(rs,"ok");
            } catch (RuntimeException e) {
                 // log.debug("filterList fail: " + e.getMessage());
             // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
             // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
             return ErrorCodes.fail(e);
        } 
    }

    @GetMapping("/selectByCourseId/{courseId}")
     @ResponseBody
    public Result<List<ScheduleCreateDTO>> getScheduleByCourseId(@PathVariable String courseId, 
     @RequestParam(required = false) String status,
    @RequestHeader("Authorization") String token) {

    //    log.debug("selectByCourseId status:" +status);

              ScheduleCreateDTO dto = new ScheduleCreateDTO();
              
              dto.setScheduleId(null);
             // dto.setCourseId(null);
             // dto.setCourseName(null);
             //  dto.setTeacherId(null);
             // dto.setTeacherName(null);
              dto.setStartDate(null);
              dto.setAvailableSites(null);
              dto.setStartTime(null);
              dto.setEndTime(null);
              dto.setRepeatType(null);
              dto.setRepeatInterval(null);
              dto.setRepeatDays(null);
              if(status!= null)
               dto.setStatus(status);
              else
              dto.setStatus(null);

              dto.setTimeZone(null);
        if(courseId!= null)
              dto.setCourseId(courseId); // courseId
 
    ////System.out .println("getScheduleByCourseId dto:" + dto);
              List<ScheduleCreateDTO> schedules = scheduleService.selectList(dto); 

       return Result.success(schedules,"ok");
    } 
 
  /**
   * 生成用户时区下的排期列表（POST /generate）
   * @param dto   前端传入的排期表单（包含起止日期、重复类型、周期等）
   * @param token 鉴权token（校园管理员或者教师）
   * @return      Result<List<ScheduleVO>> 返回选定时区下的日期+时间集合
   * 
   * 语法分析：
   * - @PostMapping("/generate")   标记该方法处理/generate的POST请求
   * - @ResponseBody               方法返回值序列化为JSON响应
   * - 参数：
   *      @RequestBody ScheduleGenerateDTO dto  从请求体JSON反序列化为业务DTO
   *      @RequestHeader("Authorization") String token  从header获取token参数
   * - 权限校验：
   *      permissionCheck.checkTeacherOrAdmin(token); // 检查用户为老师/管理员
   * - 业务调用/数据转换：
   *      List<ScheduleVO> userZoneList = ScheduleGenerator.generateUserZoneSchedule(dto);
   *        // 由工具类根据前端请求、时区等参数生成前端需要的排期列表
   * - 返回结构：
   *      Result.success(userZoneList,"localtime list");
   *      // 返回成功响应，含排期列表和消息
   */
  @PostMapping("/generate")
  @ResponseBody
  public Result<List<ScheduleVO>> generateList(@RequestBody ScheduleGenerateDTO dto, @RequestHeader("Authorization") String token) {
      // 1. 校验身份（老师/管理员权限）
     // permissionCheck.checkTeacherOrAdmin(token);

      // 2. 根据表单内容与时区配置，生成对应的排期
      List<ScheduleVO> userZoneList = ScheduleGenerator.generateUserZoneSchedule(dto);

      // 3. 打印日志（便于开发调试，实际生产可去除）
     // log.debug("ret:" + Result.success(userZoneList, "localtime list"));

      // 4. 返回统一数据结构（包含 code/message/data 字段）
      return Result.success(userZoneList, "user localtime list");
  }
   
//检查指定的排期是否与相同课程的其它排期冲突，返回冲突的排除id和name
     @PostMapping("/checkConflict")
    @ResponseBody
  public Result< List<Map<String, Object>> > checkConflict(@RequestBody ScheduleCreateDTO cto, @RequestHeader("Authorization") String token) {
     
       List<Map<String, Object>> confictScds = scheduleService.checkScheduleOwnerConflict(cto);
 
      //   返回统一数据结构（包含 code/message/data 字段）
      return Result.success(confictScds,  "confict schedule list for   id and name ");
  }
 
/**
 * 指定学生预约排期，并生成appointment，保障原子性
 * 前端传 scheduleId, studentId，后端调用service事务处理
 * 成功返回ok，异常返回fail
 */
@PostMapping("/assign-student")
@Audit(action = AuditAction.SCHEDULE_ASSIGN, resourceType = "schedule")
@ResponseBody
public Result<Boolean> assignStudentToSchedule(@RequestBody Map<String, Object> params, @RequestHeader("Authorization") String token) {
     
    try {
        // 校验权限（可选，根据需要开启）
        // permissionCheck.checkTeacherOrAdmin(token);

        Object schIdObj = params.get("scheduleId");
        Object stuIdObj = params.get("studentId");
        Object tecIdObj = params.get("teacherId");
        if (schIdObj == null || stuIdObj == null|| tecIdObj == null) {
            
            return Result.fail(500,    " parameter omitted"); 
             
        }
        String scheduleId = schIdObj.toString();
        String studentId = stuIdObj.toString();
         String teacherId = tecIdObj.toString();

        // 调用service执行原子操作
        boolean ok = scheduleService.asgn_student(scheduleId, studentId,teacherId);
        if (ok) {
           return Result.success(  true, "ok"); 
        } else { 
          return Result.fail( 500,"分配失败，请检查参数与数据库。");
        }
    } catch (Exception e) {
         
         return Result.fail(500,   "error:" + e.getMessage()); 
    } 
}
/**
 * 删除指定ID的排期
 * @param id 排期ID
 * @param token 权限token
 * @return 删除结果
 */
@DeleteMapping("/delete/{id}")
@Audit(action = AuditAction.SCHEDULE_DELETE, resourceType = "schedule", resourceId = "id")
@ResponseBody
public Result<Integer> deleteById(@PathVariable("id") String id, @RequestHeader("Authorization") String token) {
    try {
        // 权限校验，只允许老师和管理员删除排期
        permissionCheck.checkTeacherOrAdmin(token);
        // cascade: none 本层不处置——CourseScheduleService#deleteById 内已先清
        // 该排期的课次与预订（SCHEDULE_DELETE / BOOKING_DELETE 场景）
        int rows = scheduleService.deleteById(id);
        return Result.success(rows, "删除成功");
    } catch (Exception e) {
        // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
        // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
        return ErrorCodes.fail(e, "删除失败: " + e.getMessage());
    }
}
/**
 * 根据课程ID删除该课程下的所有排期
 * @param courseId 课程ID
 * @param token 权限token
 * @return 删除的排期数量
 */
@DeleteMapping("/deleteByCourseId/{courseId}")
@ResponseBody
public Result<Integer> deleteByCourseId(@PathVariable("courseId") String courseId, @RequestHeader("Authorization") String token) {
    try {
        // 权限校验，只允许老师和管理员进行操作
        permissionCheck.checkTeacherOrAdmin(token);
        int deletedCount = scheduleService.deleteByCourseId(courseId);
        return Result.success(deletedCount, "删除成功");
    } catch (Exception e) {
        // 按异常语义给码（Business→400 / NoPermission→403 / 未找到→404 / 其余 500），
        // 与 GlobalExceptionHandler 的映射表一致，避免两条路径 code 分叉。
        return ErrorCodes.fail(e, TermMsg.t("删除{schedule}失败: ") + e.getMessage());
    }
    }

    // 查询指定教师的可预约排期（可用席位 > 已预约数量）
    @GetMapping("/getAvailableSchedule")
    @ResponseBody
    public Result<List<CourseSchedule>> getAvailableSchedule(@RequestParam String teacherId) {
        List<CourseSchedule> schedules = scheduleService.getAvailableSchedule(teacherId);
        return Result.success(schedules, "ok");
    }

    // 查询指定教师的全部活跃排期（含已约满）——职业信息编辑界面「读取排期」专用。
    // 与 getAvailableSchedule 的区别：不过滤余位，返回该教师所有 active 排期，
    // 便于编辑/发布时配置对外链接与优选标记。置于登录鉴权之下（不进公开白名单）。
    @GetMapping("/listByTeacher")
    @ResponseBody
    public Result<List<CourseSchedule>> listByTeacher(@RequestParam String teacherId) {
        List<CourseSchedule> schedules = scheduleService.getSchedulesByTeacher(teacherId);
        return Result.success(schedules, "ok");
    }

    // ==================== 我的课堂：排期 → 课次实例（2026-11-13） ====================

    /**
     * 列出某排期按重复规则展开出的具体课次。
     *
     * <p><b>为什么必须放在服务端</b>：课次展开只有 {@code ScheduleInstances.expand} 一份权威实现
     * （每 N 周 + 星期几集合、每月 + 日期集合、排期时区墙钟）。前端若自己算，一旦与后端
     * 推送课堂时用的规则漂移，就会出现「列表上的第 3 次课、课堂里的第 3 次课不是同一节课」——
     * 出勤和扣课时会算到别的课次上，这类问题几乎无法靠肉眼排查。
     *
     * <p>返回的 {@code classroomKey} 是课次级课堂标识（第 1 课次为裸 id，见 {@code ClassroomKey}），
     * 前端用它进课堂、拉讲稿、查回放。
     *
     * <p>权限：ALL_ROLES（与 {@code /listByTeacher} 同口径）。排期时间本身不是敏感信息
     * （对外订阅页也展示），课堂内容仍由课堂服务的 ClassroomAccessGuard 逐课次校验身份。
     */
    @GetMapping("/class-instances/{scheduleId}")
    @ResponseBody
    public Result<List<ClassInstanceVO>> getClassInstances(@PathVariable String scheduleId,
                                                           @RequestHeader("Authorization") String token) {
        try {
            permissionCheck.checkAnyLogin(token);
            CourseSchedule schedule = scheduleService.selectById(scheduleId);
            if (schedule == null) {
                return Result.fail(404, TermMsg.t("排期不存在"));
            }
            return Result.success(buildClassInstances(schedule), "ok");
        } catch (Exception e) {
            return ErrorCodes.fail(e, TermMsg.t("查询{schedule}课次失败: ") + e.getMessage());
        }
    }

    /**
     * 补推课堂事件（排期在课堂服务里还没有课堂时使用）。
     *
     * <p><b>解决什么</b>：课堂记录由排期事件（created/updated）推送到课堂服务后创建。
     * 若排期是在「租户开通课堂」之前建的，课堂服务里根本没有这些课次，
     * 于是教师课前想上传讲稿会拿到「课堂不存在」——知识管理就断在第一步。
     * 本端点让教师/管理员主动重推一次 created 事件，把缺失的课次课堂补齐。
     *
     * <p>幂等性由课堂侧的 eventId 守卫保证：同一 eventId（含 {@code -cN} 后缀）重复投递
     * 返回 received=false,duplicate=true，不会重复建课堂。
     *
     * <p>权限：教师或管理员（重推会写课堂服务数据，学生不可用）。
     */
    @PostMapping("/class-instances/{scheduleId}/sync")
    @ResponseBody
    public Result<Map<String, Object>> syncClassrooms(@PathVariable String scheduleId,
                                                      @RequestHeader("Authorization") String token) {
        try {
            permissionCheck.checkTeacherOrAdmin(token);
            CourseSchedule schedule = scheduleService.selectById(scheduleId);
            if (schedule == null) {
                return Result.fail(404, TermMsg.t("排期不存在"));
            }
            Long tenantId = TenantContext.getTenantId();
            if (tenantId == null || tenantId == 0L) {
                tenantId = schedule.getTenantId();
            }
            if (tenantId == null || tenantId == 0L) {
                // 平台保留租户（0）没有课堂服务绑定，推也推不到；明确告知而不是静默成功
                return Result.fail(400, TermMsg.t("当前租户未开通课堂，无法同步"));
            }
            // 无事务上下文时 pushAfterCommit 会同步执行（见该方法注释），此处正是该路径
            classroomEventPushService.pushAfterCommit(tenantId, scheduleId, "created");
            int classCount = ScheduleInstances.expand(schedule).size();
            Map<String, Object> data = new java.util.LinkedHashMap<>();
            data.put("scheduleId", scheduleId);
            data.put("classCount", classCount);
            data.put("pushed", true);
            return Result.success(data, TermMsg.t("已发起课堂同步"));
        } catch (Exception e) {
            return ErrorCodes.fail(e, TermMsg.t("同步课堂失败: ") + e.getMessage());
        }
    }

    /**
     * 把排期展开成课次 VO 列表（含 classroomKey 与时间态）。
     *
     * <p>状态按**排期时区的当前墙钟**判断，与课次时间的口径保持一致；
     * 时区非法时回落 Asia/Shanghai（与 {@code ScheduleInstances} 的兜底一致）。
     */
    private List<ClassInstanceVO> buildClassInstances(CourseSchedule schedule) {
        List<ClassInstanceVO> out = new java.util.ArrayList<>();
        List<ScheduleVO> instances = ScheduleInstances.expand(schedule);
        int duration = ScheduleInstances.durationMinutes(schedule);
        String zoneText = (schedule.getTimeZone() == null || schedule.getTimeZone().trim().isEmpty())
                ? "Asia/Shanghai" : schedule.getTimeZone().trim();
        java.time.ZoneId zone;
        try {
            zone = java.time.ZoneId.of(zoneText);
        } catch (Exception ignore) {
            zone = java.time.ZoneId.of("Asia/Shanghai");
        }
        java.time.LocalDateTime now = java.time.LocalDateTime.now(zone);
        int total = instances.size();

        for (int i = 0; i < total; i++) {
            java.time.LocalDateTime startAt;
            try {
                startAt = ScheduleInstances.localDateTime(instances.get(i));
            } catch (Exception e) {
                // 单个课次时间非法只跳过这一条（与事件推送的容错口径一致）
                log.warn("课次时间非法，已跳过: scheduleId={}, classIndex={}, err={}",
                        schedule.getScheduleId(), i + 1, e.getMessage());
                continue;
            }
            java.time.LocalDateTime endAt = startAt.plusMinutes(duration);

            ClassInstanceVO vo = new ClassInstanceVO();
            vo.setClassIndex(i + 1);
            vo.setScheduleId(schedule.getScheduleId());
            vo.setClassroomKey(ClassroomKey.of(schedule.getScheduleId(), i + 1));
            vo.setStartTime(startAt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            vo.setEndTime(endAt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            vo.setDurationMinutes(duration);
            vo.setClassCount(total);

            boolean finished = !now.isBefore(endAt);
            boolean ongoing = !finished && !now.isBefore(startAt);
            vo.setState(finished ? "finished" : (ongoing ? "ongoing" : "upcoming"));
            vo.setPast(finished);
            out.add(vo);
        }
        return out;
    }
}



 