package com.reservation.service;

//import com.reservation.controller.CourseExecutionController;

 import com.reservation.common.PageResult;
 import com.reservation.common.BookingStatus;
import com.reservation.common.CascadeRules;
 import com.reservation.entity.*;
import com.reservation.dto.*; 
import com.reservation.query.*; 

import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.CourseTemplateMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.BookingMapper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
 import ch.qos.logback.core.joran.util.beans.BeanUtil;
 import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
import com.reservation.utils.TermMsg;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
 import com.baomidou.mybatisplus.core.toolkit.Wrappers;
 import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
 import com.baomidou.mybatisplus.extension.service.IService;
//import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;
 //import cn.hutool.core.util.StrUtil;
// Spring 自带工具类等价写法（无需额外引依赖）
 import org.springframework.util.StringUtils;
/**
 * 课程与排期管理服务，对应设计2.2.2 课程与排期管理模块所有接口的业务逻辑
 * 涵盖课程模板、教师课程、课程排期的增删改查，严格遵循权限校验和数据校验规则
 */
@Slf4j
@Service
public class CourseService   {
    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private CourseTemplateMapper courseTemplateMapper;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private ReferentialCascadeService cascadeService;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private BookingMapper bookingMapper;

/**
     * 分页查询课程列表
     * 
     * selectCourseList：com.reservation.dto.CourseQueryParam
     /**
      * 分页查询课程列表
      */
     public PageResult<Course> getCoursePage(CourseQueryPage query) {
         // 查询课程列表
         List<Course> courseList = courseMapper.selectCourseListByPage(query);

         // 封装分页对象
         Page<Course> page = new Page<>(query.getPageNum(), query.getPageSize());
         page.setRecords(courseList);

         // 查询总数
         Integer total = courseMapper.selectCourseListCount(query);
         page.setTotal(total);

         PageResult<Course> result = PageResult.of(page);
          return result;
    }

 
    /**
     * 创建课程模板，对应设计2.2.2 课程模板创建接口，仅管理员可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> insertTemplate(CourseTemplate template) {
        if (courseTemplateMapper.selectTemplatesByLangAndLevel(template.getLanguageType(), template.getDifficultyLevel())
                != null) {
            throw new BusinessException(TermMsg.t("该{classType}+{classLevel}的{course}模板已存在"));
        }
        String templateId = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        template.setTemplateId(templateId);
         
        courseTemplateMapper.insertTemplate(template);
        return Collections.singletonMap("templateId", templateId); // 替换Map.of，兼容低版本Java
    }

    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> updateTemplate(CourseTemplate template) {
        // 检查模板ID是否存在
        CourseTemplate exist = courseTemplateMapper.selectTemplateById(template.getTemplateId());
        if (exist == null) {
            throw new ResourceNotFoundException(TermMsg.t("待编辑的{course}模板不存在"));
        }
        // 若更改了语言类型和难度等级，检查唯一性
        CourseTemplate duplicate = courseTemplateMapper.selectTemplatesByLangAndLevel(template.getLanguageType(), template.getDifficultyLevel());
        if (duplicate != null && !duplicate.getTemplateId().equals(template.getTemplateId())) {
            throw new BusinessException(TermMsg.t("该{classType}+{classLevel}的{course}模板已存在"));
        }
        // 更新模板信息
        courseTemplateMapper.updateTemplate(template);
        return Collections.singletonMap("templateId", template.getTemplateId());
    }
   
   @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> updateTemplateStatus(String templateid, String action) { 
        // 更新模板信息
        courseTemplateMapper.updateTemplateStatus(templateid,action);
        return Collections.singletonMap("status", action);
    }

    public List<CourseTemplate> getTemplateListByLanguage(String languageType) {
        // 如果languageType为空或为"all"，查询所有模板，否则按languageType筛选
        if (languageType == null || languageType.trim().isEmpty() || "all".equalsIgnoreCase(languageType.trim())) {
            List<CourseTemplate> allTemplates = courseTemplateMapper.selectAllTemplates();
            return Optional.ofNullable(allTemplates).orElse(Collections.emptyList());
        } else {
            List<CourseTemplate> filteredTemplates = courseTemplateMapper.selectTemplatesByLanguage(languageType.trim());
            return Optional.ofNullable(filteredTemplates).orElse(Collections.emptyList());
        }
    }
    

    public PageResult<CourseTemplate> getTemplateListBypage(TemplateQueryPage query) {
         // 查询课程列表
         List<CourseTemplate> courseList = courseTemplateMapper.selectListByPage(query);

         // 封装分页对象
         Page<CourseTemplate> page = new Page<>(query.getPageNum(), query.getPageSize());
         page.setRecords(courseList);

         // 查询总数
         Integer total = courseTemplateMapper.selectListCountByPage(query);
         page.setTotal(total);

         PageResult<CourseTemplate> result = PageResult.of(page);
          return result;
    }
//          deleteTemplateById
        public int deleteTemplate(String Id) {
            log.info("删除课程模板开始, templateId={}", Id);
            // 先把该模板下每门课程（→排期→预订→课次）整条链清掉，再删模板。
            // 原先只有一句 DELETE，课程由数据库 fk_course_template 的 CASCADE 连带删除，
            // 而排期再往下的 booking / appointment 无人管 —— 删一次模板就制造一批悬空课次。
            // 级联改由程序显式逐层执行（报告根因 C）。
            cascadeService.run(CascadeRules.SCENARIO_TEMPLATE_DELETE, Id);
            int rows = courseTemplateMapper.deleteTemplate(Id);
            log.info("删除课程模板结束, templateId={}, 影响行数={}", Id, rows);
            return rows;
            }

    /**
     * 教师创建课程，对应设计2.2.2 教师课程创建接口，仅教师可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> addCourse(Course course) {
        CourseTemplate template = courseTemplateMapper.selectTemplateById(course.getTemplateId());
        if (template == null) {
            throw new ResourceNotFoundException(TermMsg.t("{course}模板不存在，请先选择正确的模板"));
        }
        // 校验当前租户课程数量是否超出套餐上限（原子占用，与插入同一事务，失败回滚）
        Long tenantId = TenantContext.getTenantId();
        tenantQuotaService.acquire(tenantId, TenantQuotaService.COURSE);
        String courseId = UUID.randomUUID().toString().replace("-", "");
        course.setCourseId(courseId);
        courseMapper.insert(course);
        return Collections.singletonMap("courseId", courseId);
    }
 
@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> updateCourseStatus (String courseId,String status) {

         courseMapper.updateCourseStatus(courseId,status);
        cascadeOnCourseStatusChange(courseId, status);
        return Collections.singletonMap("courseId", courseId);
    }

    /**
     * 课程状态变更后的级联处置（报告根因 C：数据完整性兜底）。
     *
     * <p><b>只在 frozen 时级联</b>：只有 {@code frozen} 是本系统的软删除语义
     * （管理端「删除」按钮走的就是它，见前端 {@code updateStatusByLastId?...status=frozen}）。
     * active / pending 等状态变更不改变"课程是否还存在"，级联会误伤正在编辑中的课程。
     *
     * <p><b>处置内容</b>：其下排期置 {@code inactive}（不再对外可约），<b>不删任何行</b>。
     * 排期置 inactive 而非 frozen，是因为课程恢复上架后排期应当原样可用；
     * 置 frozen 会要求教师把每条排期手工恢复一次。
     *
     * <p><b>已有预订与课次一律不动</b>（规则表里显式登记为 KEEP）。
     * 课程下架不等于可以静默取消学生已付款的预约——那会造成已付款订单无课可上，
     * 必须由管理员逐单显式处理退订。这一条写进规则表而不是留给下一个维护者去猜。
     */
    private void cascadeOnCourseStatusChange(String courseId, String status) {
        if (courseId == null || status == null
                || !BookingStatus.FROZEN.equalsIgnoreCase(status.trim())) {
            return;
        }
        ReferentialCascadeService.CascadeReport report = cascadeService.run(
                CascadeRules.SCENARIO_COURSE_FREEZE, courseId);
        if (report.isChanged()) {
            log.info("课程冻结级联：courseId={}，{}", courseId, report.toMap());
        }
    }

@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Integer updateCourseStatusByLastId (String templateId,String status) {

        int rows= courseMapper.updateCourseStatusByLastId(templateId,status);
        // 批量按模板冻结课程：逐门课走同一套级联，否则这条路径会绕过单条路径的处置，
        // 出现"单删会级联、批删不级联"的不一致（模板页的删除按钮正是走这条）。
        if (rows > 0 && status != null && BookingStatus.FROZEN.equalsIgnoreCase(status.trim())) {
            List<Course> courses = courseMapper.selectList(
                    Wrappers.<Course>lambdaQuery().eq(Course::getTemplateId, templateId));
            if (courses != null) {
                for (Course c : courses) {
                    if (c.getCourseId() != null && !c.getCourseId().trim().isEmpty()) {
                        cascadeOnCourseStatusChange(c.getCourseId(), status);
                    }
                }
            }
        }
        return  rows;
    }


    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> update (Course obj) {

        courseMapper.updateById(obj);
        return Collections.singletonMap("courseId", obj.getCourseId());
    }

    /**
     * 获取课程列表（含可用排期），补充实现体，避免编译错误
     * 参数为语言、等级
     * CourseQueryParam
     */
    public List<Course> getCourseList(CourseQueryParam  params) {
        // 实现逻辑：调用Mapper查询，无结果返回空集合，避免空指针
         //log.debug("service:params: " + params);
        List<Course> courseList = courseMapper.selectCourseList(params); // 假设Mapper有该方法
        return Optional.ofNullable(courseList).orElse(Collections.emptyList());
    } 

  public  Course getCourseById(String id) {
        // 实现逻辑：调用Mapper查询，无结果返回空集合，避免空指针
         //log.debug("service:params: " + params);
         Course  course = courseMapper.selectById(id); // 假设Mapper有该方法
        return Optional.ofNullable(course).orElse(null);
    } 
    /** manageCourse相关的函数
     * 发布课程，将课程状态设为已发布
     */
    public void publishCourse(String courseId) {
        /*Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException(TermMsg.t("{course}不存在，无法发布"));
        }*/
       // course.setStatus("active"); // 假设"active"为已发布状态
        courseMapper.updateCourseStatus(courseId, "active");
    }
      /**
     * 回收课程，将课程状态设为回收/停用
     */
    public void recycleCourse(String courseId) {
      /*  Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException(TermMsg.t("{course}不存在，无法回收"));
        }*/
        //course.setStatus("inactive"); // 假设"inactive"为回收状态
        courseMapper.updateCourseStatus(courseId, "delete");    
    }

 
    public int deleteById(String courseId) {
        log.info("删除课程开始, courseId={}", courseId);
        // 先删其排期（并由排期规则展开预订与课次），再删课程本身。
        // 原先只有一句 DELETE，排期由数据库 ON DELETE CASCADE 连带删除，
        // 而 course_schedule 下的 booking 又被 CASCADE、再往下的 appointment 无人管，
        // 于是删一次课程就制造一批悬空课次（实测 109 行）。
        // 级联改由程序按依赖顺序显式执行（报告根因 C）。
        cascadeDeleteSchedulesOfCourse(courseId);
        int rows = courseMapper.deleteById(courseId);
        log.info("删除课程结束, courseId={}, 影响行数={}", courseId, rows);
        // 释放租户课程额度
        if (rows > 0) {
            tenantQuotaService.release(TenantContext.getTenantId(), TenantQuotaService.COURSE, rows);
        }
        return rows;
    }

    /**
     * 删一门课程前，先把它下面的排期整条链清掉（排期 → 预订 → 课次），<b>不删课程本身</b>。
     *
     * <p>逐层展开的原因见 {@code CascadeRules#SCENARIO_TEMPLATE_DELETE} 的注释：
     * 链上每层父键类型不同（course_id → schedule_id → booking_id），
     * 规则表只管"这一步里子表怎么处置"，跨层取键由调用方显式做。
     */
    private void cascadeDeleteSchedulesOfCourse(String courseId) {
        if (courseId == null || courseId.trim().isEmpty()) {
            return;
        }
        List<CourseSchedule> schedules = courseScheduleMapper.selectList(
                Wrappers.<CourseSchedule>lambdaQuery().eq(CourseSchedule::getCourseId, courseId));
        if (schedules == null || schedules.isEmpty()) {
            return;
        }
        List<String> scheduleIds = schedules.stream()
                .map(CourseSchedule::getScheduleId)
                .filter(s -> s != null && !s.trim().isEmpty())
                .collect(Collectors.toList());
        for (String scheduleId : scheduleIds) {
            List<Booking> bookings = bookingMapper.selectList(
                    Wrappers.<Booking>lambdaQuery().eq(Booking::getScheduleId, scheduleId));
            if (bookings != null && !bookings.isEmpty()) {
                List<String> bookingIds = bookings.stream()
                        .map(Booking::getBookingId)
                        .filter(b -> b != null && !b.trim().isEmpty())
                        .collect(Collectors.toList());
                // 先删课次：booking 一旦先没，就再也定位不到它的课次
                cascadeService.run(CascadeRules.SCENARIO_BOOKING_DELETE, bookingIds);
            }
            cascadeService.run(CascadeRules.SCENARIO_SCHEDULE_DELETE, scheduleId);
        }
        // 最后删课程下的排期行本身
        cascadeService.run(CascadeRules.SCENARIO_COURSE_DELETE, courseId);
    }
   
    /**
     * 检查课程归属权，若courseId不存在或非teacherId归属，抛出业务异常
     */
    public void checkCourseOwner(String courseId, String teacherId) {
        Course course = courseMapper.selectById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException(TermMsg.t("{course}不存在"));
        }
        if (!teacherId.equals(course.getTeacherId())) {
            throw new BusinessException(TermMsg.t("没有操作该{course}的权限"));
        }
    } 

    /**
     * 统计截至指定时间点已发布的课程数（含指定时间）
     * @param dateTime 截止时间点
     * @return 已发布课程数
     */
    public int countPublishedCourseAtDate(java.time.LocalDateTime dateTime) {
        // 需将java.time.LocalDateTime转换为数据库可用的时间格式（如Timestamp）
        java.sql.Timestamp timestamp = java.sql.Timestamp.valueOf(dateTime);
        // 假定"active"为已发布课程状态，需要CourseMapper提供对应查询
        return courseMapper.countPublishedCourseAtDate(timestamp, "active");
    }

    public int deleteByTemplateId(String id) {
        log.info("按模板ID删除课程开始, templateId={}", id);
        // 删模板连带删其课程：先把每门课程下的排期（→预订→课次）清掉，再删课程。
        // 逐门课程处理而不是只删课程，是因为"删课程时清排期"这一步在规则里，
        // 由程序显式走一遍才可见；数据库的 CASCADE 只会静默带走整条链。
        List<Course> courses = courseMapper.selectList(
                Wrappers.<Course>lambdaQuery().eq(Course::getTemplateId, id));
        if (courses != null && !courses.isEmpty()) {
            for (Course c : courses) {
                if (c.getCourseId() != null && !c.getCourseId().trim().isEmpty()) {
                    // 逐门课程展开整条链（排期→预订→课次）：规则表里
                    // TEMPLATE_DELETE 只管"删课程"这一步，链上的其余层由调用方走，
                    // 否则删模板会只删到 course 一层就收工。
                    cascadeDeleteSchedulesOfCourse(c.getCourseId());
                }
            }
        }
        cascadeService.run(CascadeRules.SCENARIO_TEMPLATE_DELETE, id);
        int rows = courseMapper.deleteByTemplateId(id);
        log.info("按模板ID删除课程结束, templateId={}, 影响行数={}", id, rows);
        // 释放租户课程额度
        if (rows > 0) {
            tenantQuotaService.release(TenantContext.getTenantId(), TenantQuotaService.COURSE, rows);
        }
        return rows;
    }

    /**
     * 根据课程ID查询课程形式
     * 前端调用: GET /course/classform?courseId=T001
     * 返回: "1v1"
     */
    public String getClassFormByCourseId(String courseId) {
        return courseMapper.getClassFormByCourseId(courseId);
    }
}