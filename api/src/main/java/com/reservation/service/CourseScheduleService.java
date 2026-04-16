package com.reservation.service;

import com.reservation.entity.CourseSchedule;
import com.reservation.entity.CourseScheduleCreateDTO; 
import com.reservation.entity.ScheduleGenerateDTO;  
import com.reservation.entity.IncSiteBody;
import com.reservation.entity.StatusBody;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.ScheduleExceptionMapper;
import com.reservation.common.ScheduleGenerator;

import jakarta.validation.constraints.NotBlank;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.BeanUtils;
import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
 

@Service
public class CourseScheduleService {

    @Resource
    private CourseScheduleMapper scheduleMapper;
    @Resource
    private ScheduleExceptionMapper exceptionMapper;

    // 创建排期（含冲突检测）
    @Transactional(rollbackFor = Exception.class)
    public Map<String, String> createSchedule(CourseScheduleCreateDTO dto) {
        // 1. 基础校验：结束时间 > 开始时间
        /*if (dto.getEndTime().isBefore(dto.getStartTime())) {
            throw new IllegalArgumentException("结束时间必须晚于开始时间");
        }*/

        // 2. 转换DTO为实体
        CourseSchedule schedule = DtoToObject(dto);
         // 3. 冲突检测：先展开重复规则，检查每个实例是否冲突--TBD：课程+room是否冲突
       /* ScheduleGenerateDTO gto;
        // 复制dto的字段到gto, userTimezone = timeZone
        gto = new ScheduleGenerateDTO();
        if(dto.getStartDate() != null) gto.setStartDate(dto.getStartDate().toLocalDate());
        if(dto.getEndDate() != null) gto.setEndDate(dto.getEndDate().toLocalDate());
        if(dto.getStartTime() != null) gto.setStartTime(dto.getStartTime().toLocalTime());
        // repeatType转换：CourseScheduleCreateDTO为Integer，ScheduleGenerateDTO为String
        if(dto.getRepeatType() == 0) {
            gto.setRepeatType("none");
        } else if(dto.getRepeatType() == 1) {
            gto.setRepeatType("day");
        } else if(dto.getRepeatType() == 2) {
            gto.setRepeatType("week");
        } else if(dto.getRepeatType() == 3) {
            gto.setRepeatType("month");
        }
        gto.setInterval(dto.getRepeatInterval());
        gto.setRepeatDays(dto.getRepeatDays());
        gto.setTimeZone(dto.getTimeZone());
        gto.setUserTimeZone(dto.getTimeZone());
       
         List<LocalDateTime> scheduleInstances = ScheduleGenerator.generateUserZoneSchedule(gto);
        for (LocalDateTime instance : scheduleInstances) {
            LocalDateTime start = instance[0];
            LocalDateTime end = instance[1];
            List<CourseSchedule> conflicts = scheduleMapper.selectConflictingSchedules(
                dto.getTeacherId(),  start, end, null
            );
            if (!conflicts.isEmpty()) {
                throw new IllegalArgumentException("时间冲突：" + start + " 至 " + end + " 教师或教室已被占用");
            }
        }*/
        
        String  Id = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        schedule.setScheduleId( Id);
         //System.out .println("setScheduleId: " + schedule);
        // 4. 插入排期
        scheduleMapper.insertSchedule(schedule);
       
        return  Collections.singletonMap("Id", Id);
    }

    // 解析repeatDays字符串为整数列表
    private List<Integer> parseRepeatDays(String repeatDays) {

        if (repeatDays == null || repeatDays.isEmpty()) {
            return new ArrayList<>();
        }
        repeatDays=repeatDays.trim();
        if(repeatDays.isEmpty())
            return new ArrayList<>();
        return Arrays.stream(repeatDays.split(","))
            .map(Integer::parseInt)  
            .collect(Collectors.toList());
    }
  
@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public   String updateStatus (StatusBody data) {       
         //System.out .println("updateStatus called with scheduleId: " + data);
         scheduleMapper.updateStatus(data);
        return  data.getScheduleId();
    }

  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String update(CourseScheduleCreateDTO dto) { 
         //System.out .println("update : " +dto); 
          CourseSchedule schedule = DtoToObject(dto);        
          scheduleMapper.update(schedule);
        return dto.getScheduleId();
    }

//更新可用数 incSiteBody { "inc":1、-1 ，"id":scheduleId)
  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateScheduleSites(IncSiteBody Obj) {
         System.out.println("updateScheduleSites : " +Obj);         
         scheduleMapper.updateSites(Obj);
        return Obj.getScheduleId();
    }


// 
  @Transactional(propagation = Propagation.REQUIRED )
    public CourseSchedule selectById(String id) { 
            
         return scheduleMapper.selectById(id);
    }

@Transactional(propagation = Propagation.REQUIRED)
    public List<CourseScheduleCreateDTO> selectList(CourseScheduleCreateDTO obj) {
         
          List<CourseSchedule> s = scheduleMapper.selectList(obj);//获取原始排期
            //System.out .println("selectList : " +s); 
          return ListObjectToDto(s);
    }
 
 private  List<CourseScheduleCreateDTO> ListObjectToDto(List<CourseSchedule> objList){
         List<CourseScheduleCreateDTO> result = new ArrayList<>();
           for (CourseSchedule cs : objList) {
               //System.out .println("ListObjectToDto : " +cs); 

               CourseScheduleCreateDTO dto = new CourseScheduleCreateDTO();
                dto.setScheduleId(cs.getScheduleId());
                dto.setCourseId(cs.getCourseId());
               // CourseSchedule 里没有 teacherId / ClassroomId 字段, 若需要请补充
               dto.setTeacherId(null);
               dto.setClassroomId(null);

               // startTime-->statDate,startTime, endTime 转换为 LocalDateTime
               if (cs.getStartTime() != null && !cs.getStartTime().isEmpty()) {
                   try {
                       dto.setStartDate(java.time.LocalDate.parse(cs.getStartTime().substring(0, 10)));
                  
                   } catch (Exception ex) { dto.setStartDate(null); }

                   try {
                      String timePart = cs.getEndTime().length() >= 19 ? cs.getEndTime().substring(11, 19) : null;
                       dto.setStartTime(java.time.LocalTime.parse(timePart));
                   } catch (Exception ex) { dto.setStartTime(null); }
               } 

               if (cs.getEndTime() != null && !cs.getEndTime().isEmpty()) {
                   try {
                       dto.setEndDate(java.time.LocalDate.parse(cs.getEndTime().substring(0, 10)));
                   } catch (Exception ex) { dto.setEndDate(null); }
                    try {
                       // INSERT_YOUR_CODE
                       String timePart = cs.getEndTime().length() >= 19 ? cs.getEndTime().substring(11, 19) : null; 
                       dto.setEndTime(java.time.LocalTime.parse(timePart));
                   } catch (Exception ex) { dto.setEndTime(null); 
                      System.out.println("setEndTime : " +ex);   
                      System.out.println(java.time.LocalTime.parse(cs.getEndTime().substring(0, 19)));
                   }
               }  
               // repeatType = 课程中是int, DTO是Integer
               dto.setRepeatType(cs.getRepeatType());
               dto.setRepeatInterval(cs.getRepeatInterval());
               // repeatDays: 字符串转 List<Integer>
               dto.setRepeatDays(parseRepeatDays(cs.getRepeatDays())); 
               
               dto.setTimeZone(cs.getTimeZone()); 
                dto.setStatus(cs.getStatus()); 
               dto.setAvailableSites(cs.getAvailableSites());
               result.add(dto);
           }
           return result;
 }
 //用于保存到数据库
private CourseSchedule  DtoToObject(CourseScheduleCreateDTO dto){
    if (dto == null) return null;
    CourseSchedule cs = new CourseSchedule();
    cs.setCourseId(dto.getCourseId());
    cs.setScheduleId(dto.getScheduleId());
    // cs.setClassroomId(dto.getClassroomId());
   //System.out .println("DtoToObject : " +dto);         
    // LocalDateTime 转 String（假定格式为 "yyyy-MM-dd HH:mm:ss"）
    // 错误分析:
    // 1. dto.getStartDate() 和 dto.getStartTime() 已分别是 LocalDate 和 LocalTime，无需再调用 toLocalDate()/toLocalTime()
    // 2. LocalDateTime.of(LocalDate, LocalTime) 直接使用即可，否则会抛异常（因为 LocalDate 没有 toLocalDate 方法）
    // 3. toString().replace('T', ' ') 得到"yyyy-MM-dd HH:mm:ss.nnn"，但 endTime 可能需要格式化去掉纳秒部分

    if (dto.getStartDate() != null && dto.getStartTime() != null) {
        LocalDateTime ldt = LocalDateTime.of(dto.getStartDate(), dto.getStartTime());
        // 格式化为"yyyy-MM-dd HH:mm:ss"
        String strTime = ldt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        cs.setStartTime(strTime);
    }

    // endDate and startTime are merged to form endTime
    // 若dto.getEndDate()和dto.getEndTime()都不为空，取其LocalDate, LocalTime组装endTime
    if (dto.getEndDate() != null && dto.getStartTime() != null) {
        cs.setEndTime(LocalDateTime.of(
            dto.getEndDate() , // 采用startDate作为endTime的date组件
            dto.getEndTime() 
        ).toString().replace('T', ' ')); // "yyyy-MM-dd HH:mm:ss"
    } 

    cs.setRepeatType(dto.getRepeatType());
    cs.setRepeatInterval(dto.getRepeatInterval());
    cs.setAvailableSites(dto.getAvailableSites());
    // 将 List<Integer> repeatDays 转为字符串存储（如 "1,3,5"）
    if (dto.getRepeatDays() != null && !dto.getRepeatDays().isEmpty()) {
        cs.setRepeatDays(dto.getRepeatDays().stream().map(String::valueOf).collect(Collectors.joining(",")));
    } else {
        cs.setRepeatDays(" ");
    }
 
    cs.setTimeZone(dto.getTimeZone());
    cs.setStatus(dto.getStatus());
    return cs;
}
}


// checkScheduleOwner：
// 用于检查排期(scheduleId)是否归属于指定教师(teacherId)。先查找排期，若不存在则抛出“排期不存在”；
// 再取排期对应课程ID，校验课程有效且归属该教师，否则抛出无权限或资源不存在等业务异常。
/*
    public void checkScheduleOwner(String scheduleId, String teacherId) {
        CourseSchedule schedule = scheduleMapper.selectById(scheduleId);
        if (schedule == null) {
            throw new ResourceNotFoundException("排期不存在");
        }
        String courseId = schedule.getCourseId();
        if (courseId == null) {
            throw new BusinessException("排期关联的课程无效");
        }
        Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("排期关联的课程不存在");
        }
        if (!teacherId.equals(course.getTeacherId())) {
            throw new BusinessException("没有操作该排期的权限");
        }
    }
*/
/**
 * 分析: BeanCreationException 和 SAXParseException 很可能是 CourseScheduleMapper.xml 配置错误（如 XML 第32行有非法字符、标签不闭合等）。
 * 1. 通常是 XML 配置里 <resultMap>、<select>、<update>、<sql> 等标签书写有误，引发 SAX 解析异常。
 * 2. 修复方法:
 *    - 仔细检查 CourseScheduleMapper.xml 第32行左右是否有:
 *      a. 非法字符（如 &、<、> 未转义等）
 *      b. 标签未闭合或写法错误（如 <if test="..."> 未正确结束、缺</if>）
 *      c. 属性拼写/引号丢失
 *    - 通常MyBatis相关Bean注入失败均为XML配置或Mapper接口/注解问题，与Service层无关。
 * 3. 建议:
 *   - 打开 CourseScheduleMapper.xml，用带行号的编辑器定位第32行，逐一排查。
 *   - 确认所有 XML 标签已闭合，字符实体(&)等已转义，SQL片段无冗余尖括号。
 * 4. 该 Service 层无需额外代码（问题在Mapper XML层），建议修复XML后重启服务即可。
 */