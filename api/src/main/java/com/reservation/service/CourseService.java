package com.reservation.service;

//import com.reservation.controller.CourseExecutionController;
 import com.reservation.entity.*; 
import com.reservation.dto.*; 
import com.reservation.query.*; 
import com.reservation.exception.BusinessException;
import com.reservation.exception.ResourceNotFoundException;
import com.reservation.mapper.CourseTemplateMapper;
import com.reservation.mapper.CourseMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

//import java.text.SimpleDateFormat;
import java.util.*;

/**
 * 课程与排期管理服务，对应设计2.2.2 课程与排期管理模块所有接口的业务逻辑
 * 涵盖课程模板、教师课程、课程排期的增删改查，严格遵循权限校验和数据校验规则
 */
@Service
public class CourseService {
    @Autowired
    private CourseMapper courseMapper;
     @Autowired
    private CourseTemplateMapper courseTemplateMapper;

/**
     * 分页查询课程列表
     */
    public PageResult<Course> getCoursePage(CourseQuery query) {
        // 1. 构建分页对象：当前页 + 每页条数
        Page<Course> page = new Page<>(query.getPageNum(), query.getPageSize());

        // 2. 构建查询条件（动态拼接）
        LambdaQueryWrapper<Course> wrapper = Wrappers.lambdaQuery();
        // 课程名称模糊搜索
        if (StrUtil.isNotBlank(query.getCourseName())) {
            wrapper.like(Course::getCourseName, query.getCourseName());
        }
        // 语言类型精准筛选
        if (StrUtil.isNotBlank(query.getLanguageType())) {
            wrapper.eq(Course::getLanguageType, query.getLanguageType());
        }
        // 状态筛选
        if (query.getStatus() != null) {
            wrapper.eq(Course::getStatus, query.getStatus());
        }
        // 按创建时间倒序，最新的在前
        wrapper.orderByDesc(Course::getCreateTime);

        // 3. 执行分页查询（自动执行 count统计 + 分页数据两条SQL）
        Page<Course> resultPage = this.page(page, wrapper);

        // 4. 实体转VO，返回给前端（简单场景可直接返回Course实体） CourseVO 为视图对象，可按需扩展字段（如教师姓名，关联查询后填充），纯单表场景可直接返回 Course 实体。
        List<Course> voList = BeanUtil.copyToList(resultPage.getRecords(), Course.class);
        return PageResult.of(resultPage).setRows(voList);
    }

    /**
     * 创建课程模板，对应设计2.2.2 课程模板创建接口，仅管理员可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> insertTemplate(CourseTemplate template) {
        if (courseTemplateMapper.selectTemplatesByLangAndLevel(template.getLanguageType(), template.getDifficultyLevel())
                != null) {
            throw new BusinessException("该语言类型+难度等级的课程模板已存在");
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
            throw new ResourceNotFoundException("待编辑的课程模板不存在");
        }
        // 若更改了语言类型和难度等级，检查唯一性
        CourseTemplate duplicate = courseTemplateMapper.selectTemplatesByLangAndLevel(template.getLanguageType(), template.getDifficultyLevel());
        if (duplicate != null && !duplicate.getTemplateId().equals(template.getTemplateId())) {
            throw new BusinessException("该语言类型+难度等级的课程模板已存在");
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
    /**
     * 教师创建课程，对应设计2.2.2 教师课程创建接口，仅教师可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> addCourse(Course course) {
        CourseTemplate template = courseTemplateMapper.selectTemplateById(course.getTemplateId());
        if (template == null) {
            throw new ResourceNotFoundException("课程模板不存在，请先选择正确的模板");
        }
        String courseId = UUID.randomUUID().toString().replace("-", "");
        course.setCourseId(courseId);
        courseMapper.insertCourse(course);
        return Collections.singletonMap("courseId", courseId);
    }
 
@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> updateCourseStatus (String courseId,String status) {
      /*  Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("updateCourseStatus：课程不存在");
        } */
         // INSERT_YOUR_CODE
         System.out.println("updateCourseStatus called with courseId: " + courseId + ", status: " + status);
 
         courseMapper.updateCourseStatus(courseId,status);
        return Collections.singletonMap("courseId", courseId);
    }

    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> update (Course obj) {

        courseMapper.updateCourse(obj);
        return Collections.singletonMap("courseId", obj.getCourseId());
    }

    /**
     * 获取课程列表（含可用排期），补充实现体，避免编译错误
     * 参数为语言、等级
     * CourseQueryParam
     */
    public List<Course> getCourseList(CourseQueryParam  params) {
        // 实现逻辑：调用Mapper查询，无结果返回空集合，避免空指针
         //System.out.println("service:params: " + params);
        List<Course> courseList = courseMapper.selectCourseList(params); // 假设Mapper有该方法
        return Optional.ofNullable(courseList).orElse(Collections.emptyList());
    } 

  public  Course getCourseById(String id) {
        // 实现逻辑：调用Mapper查询，无结果返回空集合，避免空指针
         //System.out.println("service:params: " + params);
         Course  course = courseMapper.getCourseById(id); // 假设Mapper有该方法
        return Optional.ofNullable(course).orElse(null);
    } 
    /** manageCourse相关的函数
     * 发布课程，将课程状态设为已发布
     */
    public void publishCourse(String courseId) {
        /*Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("课程不存在，无法发布");
        }*/
       // course.setStatus("active"); // 假设"active"为已发布状态
        courseMapper.updateCourseStatus(courseId, "active");
    }

    /**
     * 删除课程
     */
    public void deleteCourse(String courseId) {
       /* Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("课程不存在，无法删除");
        }
      */
        courseMapper.updateCourseStatus(courseId, "forzen");
    }

    /**
     * 回收课程，将课程状态设为回收/停用
     */
    public void recycleCourse(String courseId) {
      /*  Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("课程不存在，无法回收");
        }*/
        //course.setStatus("inactive"); // 假设"inactive"为回收状态
        courseMapper.updateCourseStatus(courseId, "inactive");
    }

    /**
     * 检查课程归属权，若courseId不存在或非teacherId归属，抛出业务异常
     */
    public void checkCourseOwner(String courseId, String teacherId) {
        Course course = courseMapper.getCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("课程不存在");
        }
        if (!teacherId.equals(course.getTeacherId())) {
            throw new BusinessException("没有操作该课程的权限");
        }
    }
// INSERT_YOUR_CODE
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
    
}