package com.reservation.service;

 import com.reservation.entity.*; 
import com.reservation.dto.*; 

import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.ScheduleExceptionMapper;
import com.reservation.common.ScheduleGenerator;

import com.reservation.mapper.BookingMapper;
/*import com.reservation.service.AppointmentService;
      import java.time.LocalDate;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.BeanUtils;*/
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
 

@Service
public class CourseScheduleService {

    @Resource
    private CourseScheduleMapper scheduleMapper;
    @Resource
    private ScheduleExceptionMapper exceptionMapper;

  @Resource
    private BookingMapper bookingMapper;
     @Resource
    private AppointmentService appointmentService;

// 3. 冲突检测：先展开重复规则，检查每个实例是否冲突--TBD：课程+room是否冲突
// 参数excludeSchid 在修改已存在的排期时，带
/*  约定：排期使用dto带入的时区
 检查方法：1、与同一课程的其它排期的时间进行比较 ---采用--保守算法
             2、与同一课程的已经预订的排期时间表进行比较 --精确算法
*/

    public  List<Map<String, Object>>   checkScheduleOwnerConflict(ScheduleCreateDTO dto){
        ScheduleGenerateDTO  gto =CreateDtoToGenerateDto(dto);// new ScheduleGenerateDTO();
        String timeZone = dto.getTimeZone();//使用同一时区
           gto.setUserTimeZone(timeZone);
           
        String excludeSchid = null;
        try {  excludeSchid = dto.getScheduleId();//
            if (excludeSchid == null || excludeSchid.trim().isEmpty()) {
                excludeSchid = null;
            }
        } catch (Exception ex) {
                   excludeSchid = null;
                   System.out.println(" checkScheduleOwnerConflict Error getting scheduleId: " + ex.getMessage());
               }
    
       
         // 获取courseID= dto.getCourseId()的所有排期，以List方式输出
         List<CourseSchedule> scheduleList = scheduleMapper.selectList(
             new ScheduleCreateDTO() {{
                 setCourseId(dto.getCourseId());
             }}
         );
         if(excludeSchid!= null){
         // 从scheduleList中去除scheduleId对应的排期（即排除本身）
             String finalExcludeSchid = excludeSchid;
             scheduleList.removeIf(sch -> finalExcludeSchid.equals(sch.getScheduleId()));
         }
         
         List< ScheduleVO> scheduleInstances = ScheduleGenerator.generateUserZoneSchedule(gto);

         //对于每一个的排期，调用generateUserZoneSchedule创建排期时间表，然后与scheduleInstances内的日期和时间进行比较，比较的标准是，两个时间在1小时内没有重叠。如果有重叠，则把该排期的scheduleID加入一个冲突列表
        // 对每个已存在的排期，生成其实例时间表，然后与待新增的 scheduleInstances 中每个实例比较，判重
        //Map<String,String> conflictScheduleIds = null;
        List<Map<String, Object>> conflictScheduleIds = new ArrayList<>(); 
       // System.out .println("compared in tz : " +timeZone );
     //   System.out .println("scheduleInstances : " +scheduleInstances );
        // scheduleInstances 是当前待创建的实例时间列表
        // scheduleList 是数据库已有、同课程的其它排期
        int cnt=0;

        //System.out .println("newSchedule : "+cnt +" newGto:" +gto );
        for (CourseSchedule existSchedule : scheduleList) {
            // 构造 ScheduleGenerateDTO，转换 existSchedule 的各字段
            ScheduleGenerateDTO existGto = CreateDtoToGenerateDto( ObjectToCreateDto(existSchedule));//object->create->Gto
            existGto.setUserTimeZone(timeZone);//使用相同的时区进行比较

            //System.out .println("existSchedule : "+cnt +" existGto:" +existGto );
            List<com.reservation.dto.ScheduleVO> existInstances = ScheduleGenerator.generateUserZoneSchedule(existGto);
          cnt++;
            // 两个实例表逐个比较
            for (ScheduleVO existInst : existInstances) {

                String existDate = existInst.getDate();
                String existTime = existInst.getTime();
                // 合并字符串日期和时间为一个日期时间对象
                LocalDateTime existStart = LocalDateTime.parse(existDate + "T" + existTime); 
                int cntapp=0;
                for ( ScheduleVO newInst : scheduleInstances) {
                    String newDate = newInst.getDate();
                    String newTime = newInst.getTime();
                  //  System.out .println(cnt*1000+cntapp +"  newdate "+newDate +" "+newTime+" exist: " +existDate +" "+existTime+"org:"+newInst);
                   
                    // 判断existDate和newDate是否是系统的字符串
                    // 这里可以检查是否为null、并且是否为字符串类型（在Java中如果变量类型是String一般不用再判断类型，但可防御性书写如下）
                    if (!(existDate instanceof String) || !(newDate instanceof String)) {
                        System.out.println("existDate或newDate不是字符串类型，existDate=" + existDate + ", newDate=" + newDate);
                        continue; // 跳过本次比较
                    }
                
                    if (!existDate.equals(newDate)) {
                        continue; // 日期不同则跳过本次比较
                    }
            
                    LocalDateTime newStart = LocalDateTime.parse(newDate + "T" + newTime);
                  //  System.out .println(cnt*1000+cntapp +"newStart:"+newStart+"exist:"+existStart);
                    // 比较新旧两个排期实例是否重叠（以1小时为互斥区间, 可视为每节课持续1小时）
                    LocalDateTime existEnd = existStart.plusHours(1);
                    LocalDateTime newEnd = newStart.plusHours(1);

                    // overlap: 两段有交集（即不是完全前后）
                    boolean overlap = !(newEnd.isBefore(existStart) || newStart.isAfter(existEnd));
                   // System.out .println(cnt*1000+cntapp +"cmp : newdate"+newStart +"---"+newEnd+"existEnd:" +existStart+"---"+existEnd +"overlap"+overlap);
                   // cntapp= cntapp+1;
                    if (overlap) { 

                         Map<String, Object> map = new HashMap<>();
                            map.put("id", existSchedule.getScheduleId());
                            map.put("name", existSchedule.getName());
                            
                            boolean alreadyExists = false;
                            for (Map<String, Object> existing : conflictScheduleIds) {
                                if (existing.get("id") != null && existing.get("id").equals(map.get("id"))) {
                                    alreadyExists = true;
                                    break;
                                }
                            }
                            if (!alreadyExists) {                        
                            conflictScheduleIds.add(map);
                    }
                    }
                }//for
            }
        }
       // if (!conflictScheduleIds.isEmpty()) {
         //   throw new IllegalArgumentException("时间冲突，已存在排期scheduleId: " + String.join(",", conflictScheduleIds));
        //}
        // INSERT_YOUR_CODE
        // 定义一个由Json对象（如com.alibaba.fastjson.JSONObject）组成的List
        // 方式1：如果使用fastjson
        // List<JSONObject> jsonList = new ArrayList<>();

        // 方式2：如果使用Jackson
        // List<com.fasterxml.jackson.databind.JsonNode> jsonList = new ArrayList<>();

        // 方式3：如果用通用的Map表示Json对象:
        // List<Map<String, Object>> jsonList = new ArrayList<>();
        // INSERT_YOUR_CODE
        // 假设我们有一些数据，比如要把conflictScheduleIds（Map<String,String>）转为List<Map<String, Object>>
      /*  List<Map<String, Object>> jsonList = new ArrayList<>();
        for (Map.Entry<String, String> entry : conflictScheduleIds.entrySet()) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", entry.getKey());
            map.put("name", entry.getValue());
            jsonList.add(map);
        }
*/
        // 具体使用哪种取决于你的依赖库和业务场景

       // System.out .println("conflictScheduleIds:"+conflictScheduleIds);
      return  conflictScheduleIds;  
    }
    // 创建排期（含冲突检测）
    @Transactional(rollbackFor = Exception.class)
    public Map<String, String> createSchedule(ScheduleCreateDTO dto) {
        // 1. 基础校验：结束时间 > 开始时间
        /*if (dto.getEndTime().isBefore(dto.getStartTime())) {
            throw new IllegalArgumentException("结束时间必须晚于开始时间");
        }*/

        // 2. 转换DTO为实体
        CourseSchedule schedule = CreateDtoToObject(dto); 
     //    System.out .println("create : " +dto+"-->"+ schedule); 
        String  Id = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        schedule.setScheduleId( Id);
         //System.out .println("setScheduleId: " + schedule);
         //3-- 检查冲突---由其它程序完成，
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
  
//TBD:与createSchedule一样，需要检查排期冲突问题
  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> update(ScheduleCreateDTO dto) { 
        //  System.out .println("update : " +dto); 
          CourseSchedule schedule = CreateDtoToObject(dto);     
         // System.out .println("update : " + schedule); 
          scheduleMapper.update(schedule);
        return Collections.singletonMap("Id", dto.getScheduleId());
    }

//更新可用数 incSiteBody { "inc":1、-1 ，"id":scheduleId)
  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateScheduleSites(IncSiteBody Obj) {
         //System.out.println("updateScheduleSites : " +Obj);         
         scheduleMapper.updateSites(Obj);
        return Obj.getScheduleId();
    }


@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public   String updateStatus (StatusBody data) {       
         //System.out .println("updateStatus called with scheduleId: " + data);
         scheduleMapper.updateStatus(data);
        return  data.getScheduleId();
    }

// 可以返回DTO对象，TBD
  @Transactional(propagation = Propagation.REQUIRED )
    public CourseSchedule selectById(String id) { 
            
         return scheduleMapper.selectById(id);
    }

@Transactional(propagation = Propagation.REQUIRED)
    public List<ScheduleCreateDTO> selectList(ScheduleCreateDTO obj) {
         
          List<CourseSchedule> s = scheduleMapper.selectList(obj);//获取原始排期
            //System.out .println("selectList : " +s); 
          return ListObjectToCreateDto(s);
    }
 
 private  List<ScheduleCreateDTO> ListObjectToCreateDto(List<CourseSchedule> objList){
         List<ScheduleCreateDTO> result = new ArrayList<>();
           for (CourseSchedule cs : objList) {
               //System.out .println("ListObjectToCreateDto : " +cs); 
            ScheduleCreateDTO dto = ObjectToCreateDto(cs);
               result.add(dto);
           }
           return result;
 }
 private ScheduleCreateDTO ObjectToCreateDto (CourseSchedule cs){ 
               ScheduleCreateDTO dto = new ScheduleCreateDTO();
               String sid =null; 
               try {
                   sid = cs.getScheduleId();
               } catch (Exception ex) {
                   sid = null;
                   System.out.println("ObjectToCreateDto Error getting scheduleId: " + ex.getMessage());
               }
          
                dto.setScheduleId(cs.getScheduleId());
                dto.setCourseId(cs.getCourseId());
               // CourseSchedule 里没有 teacherId / ClassroomId 字段, 若需要请补充
              // dto.setTeacherId(null);--》courseObject
              // dto.setClassroomId(null);TBD

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
               dto.setName(cs.getName());
               return dto;
 }
 //用于保存到数据库
private CourseSchedule  CreateDtoToObject(ScheduleCreateDTO dto){
  //  System.out .println("CreateDtoToObject : " +dto);
    if (dto == null) return null;
    CourseSchedule cs = new CourseSchedule();
    cs.setCourseId(dto.getCourseId());
    cs.setScheduleId(dto.getScheduleId());
    // cs.setClassroomId(dto.getClassroomId());
   //System.out .println("CreateDtoToObject : " +dto);         
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
    cs.setName(dto.getName());
    return cs;
}

  // 完成指定学生预约排期：创建booking，批量创建appointments，并入库
  // 1. 创建 booking 数据，状态为 booked
  // 2. 基于排期 scheduleId 生成 appointment 列表，状态 active
  // 3. 将 booking、appointment 插入到数据库，事务保障原子性
  // 返回 true=成功, false=异常时抛出或返回false

  // 假设有以下依赖： BookingMapper bookingMapper; AppointmentMapper appointmentMapper;
  //              CourseScheduleMapper scheduleMapper;
 
 public ScheduleGenerateDTO CreateDtoToGenerateDto(ScheduleCreateDTO crtDto ){
    ScheduleGenerateDTO genDto   = new ScheduleGenerateDTO();
      genDto.setStartDate(crtDto.getStartDate());
         genDto.setEndDate(crtDto.getEndDate());
         genDto.setStartTime(crtDto.getStartTime());
           // genDto.setStartDate(crtDto.getStartTime() != null ? LocalDate.parse(crtDto.getStartTime().substring(0, 10)) : null);
           // genDto.setStartTime(crtDto.getStartTime() != null ? LocalTime.parse(crtDto.getStartTime().substring(11, 19)) : null);
          //  genDto.setEndDate(crtDto.getEndTime() != null ? LocalDate.parse(crtDto.getEndTime().substring(0, 10)) : null); 

        String  repeatType = "none";
        if (crtDto.getRepeatType() != null) 
        switch(crtDto.getRepeatType()){ 
            case 0: break;
            case 1:repeatType="day";break;
            case 2:repeatType="week";break;
            case 3:repeatType="month";break;
            default:repeatType = "none";
        }
        genDto.setRepeatType(repeatType);

        genDto.setInterval(crtDto.getRepeatInterval());
        genDto.setRepeatDays(crtDto.getRepeatDays());
        genDto.setTimeZone(crtDto.getTimeZone());
        genDto.setUserTimeZone(crtDto.getTimeZone());
        return genDto;
}

  @Transactional(rollbackFor = Exception.class)
  public boolean asgn_student(String scheduleId, String studentId,String teacherId) {
      // 1. 创建 booking 数据
      Booking booking = new Booking();
      String bookingId = UUID.randomUUID().toString();
      booking.setId(bookingId);
      booking.setScheduleId(scheduleId);
      booking.setStudentId(studentId);
      booking.setTeacherId(teacherId);
      booking.setStatus("booked");
    //  booking.setCreateTime(LocalDateTime.now());
      bookingMapper.insert(booking);
 //System.out .println("insert Book:" + booking);

      // 2. 根据 scheduleId 获取排期详情（比如起止日期、重复规则）
      CourseSchedule schedule = scheduleMapper.selectById(scheduleId);
      if (schedule == null) {
          throw new RuntimeException("排期不存在");
      }
      // 构造 generateDTO 用于生成 appointment 时间列表 ScheduleGenerateDTO
      ScheduleCreateDTO crtDto= ObjectToCreateDto(schedule); 
      ScheduleGenerateDTO genDto   =  CreateDtoToGenerateDto(crtDto);
//.out .println("asgn_student genDto:" + genDto);
      // 3. 由工具类展开实例日期+时间
      List<ScheduleVO> instanceList = ScheduleGenerator.generateUserZoneSchedule(genDto);
//System.out .println("asgn_student instanceList:" + instanceList);

      List<Appointment> appointmentList = new ArrayList<>();
      int index =1;
      for (ScheduleVO vo : instanceList) {
          Appointment appt = new Appointment();
         // appt.setAppointmentId(UUID.randomUUID().toString());
         appt.setBookingId(bookingId); 
          appt.setClassIndex(index++); 
              String appointmentDateTime = vo.getDate() + " " + vo.getTime(); 
          // 将 appointmentDateTime 字符串转为 LocalDateTime
          LocalDateTime localDateTime = LocalDateTime.parse(appointmentDateTime, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
          appt.setAppointmentDatetime(localDateTime);
           appt.setLastDatetime(localDateTime); 
         
          appt.setStatus("active");  
          appointmentList.add(appt);
      }
     // System.out .println("asgn_student appointmentList:" + appointmentList);
      // 批量插入 appointments
      if (!appointmentList.isEmpty()) {
          appointmentService.insertAppointmentList(appointmentList);
         // System.out .println("asgn_student:insertAppointmentList");
      }
      // 成功
      return true;
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