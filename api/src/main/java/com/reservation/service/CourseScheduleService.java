package com.reservation.service;

 import com.reservation.entity.*; 
import com.reservation.dto.*; 

import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.ScheduleExceptionMapper;
import com.reservation.common.ScheduleGenerator;
import com.reservation.common.BookingStatus;
import com.reservation.common.AppointmentStatus;
import com.reservation.common.CascadeRules;
import com.reservation.common.BookingIdGenerator;

import com.reservation.mapper.BookingMapper;
import com.reservation.query.ScheduleQueryPage;
import com.reservation.common.PageResult;
import com.reservation.exception.BusinessException;
import com.reservation.utils.TenantContext;
import com.reservation.utils.TermMsg;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.reservation.dto.ScheduleCreateDTO;
/*import com.reservation.service.AppointmentService;
      import java.time.LocalDate;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.BeanUtils;*/
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.Resource;
//import java.time.LocalDate;
//import java.time.LocalTime;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
 

@Slf4j
@Service
public class CourseScheduleService {

    @Resource
    private CourseScheduleMapper scheduleMapper;
    @Resource
    private ScheduleExceptionMapper exceptionMapper;
    @Resource
    private ReferentialCascadeService cascadeService;

  @Resource
    private BookingMapper bookingMapper;
     @Resource
    private AppointmentService appointmentService;
     @Resource
    private TenantQuotaService tenantQuotaService;

    /** 名额校验（含加锁与锁定读）统一由 BookingSeatService 提供，与学生预定/候补递补共用同一闸门 */
    @Resource
    private BookingSeatService bookingSeatService;

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
                   log.debug(" checkScheduleOwnerConflict Error getting scheduleId: " + ex.getMessage());
               }
    
       
         // 获取courseID= dto.getCourseId()的所有排期，以List方式输出
         List<CourseSchedule> scheduleList = scheduleMapper.selectByCreateDto(
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
                        log.debug("existDate或newDate不是字符串类型，existDate=" + existDate + ", newDate=" + newDate);
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
                    // INSERT_YOUR_CODE
                    // 如果结束时间与开始时间相同，认为是不冲突
                    if (existEnd.equals(newStart) || newEnd.equals(existStart)) {
                        continue; // 不算冲突，跳过
                    }
          
                    // overlap: 两段有交集（即不是完全前后）
                    boolean overlap = !(newEnd.isBefore(existStart) || newStart.isAfter(existEnd));
                    if(overlap){
                     System.out .println(cnt*1000+cntapp +"cmp : newdate"+newStart +"---"+newEnd+"existEnd:" +existStart+"---"+existEnd +"overlap"+overlap);
                    }
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
        // 校验当前租户排期数量是否超出套餐上限（原子占用，与插入同一事务）
        Long tenantId = TenantContext.getTenantId();
        tenantQuotaService.acquire(tenantId, TenantQuotaService.SCHEDULE);
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
          // 席位字段可空，语义是「本次不改席位」。必须先取排期行锁并沿用库中现值：
          // CreateDtoToObject 会给 int 字段填兜底默认值，不处理的话，一次没带席位的普通编辑
          // 就会把容量整体改写成那个默认值；显式改小时则要求不低于已占位数，否则改完立即超卖。
          CourseSchedule current = bookingSeatService.lockScheduleAndAssertExists(dto.getScheduleId());
          Integer newSites = dto.getAvailableSites();
          if (newSites != null && newSites != current.getAvailableSites()) {
              bookingSeatService.assertSitesNotBelowOccupied(dto.getScheduleId(), newSites);
          }
          CourseSchedule schedule = CreateDtoToObject(dto);     
         // System.out .println("update : " + schedule); 
          if (newSites == null) {
              schedule.setAvailableSites(current.getAvailableSites());
          }
          scheduleMapper.updateById (schedule);
        return Collections.singletonMap("Id", dto.getScheduleId());
    }

//更新可用数 incSiteBody { "inc":1、-1 ，"id":scheduleId)
  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateScheduleSites(IncSiteBody Obj) {
         //log.debug("updateScheduleSites : " +Obj);         
         // 席位调整必须过闸门：先锁排期行，再按已占位数校验新容量。
         // 原先是无条件 available_sites = available_sites + inc，可以一路减到低于已占位数、
         // 甚至负数（列是 tinyint，允许负值），把「满员」改成「超员」——这是顺序操作即可触发的超卖。
         CourseSchedule current = bookingSeatService.lockScheduleAndAssertExists(Obj.getScheduleId());
         bookingSeatService.assertSitesNotBelowOccupied(
                 Obj.getScheduleId(), current.getAvailableSites() + Obj.getInc());
         int rows = scheduleMapper.updateSites(Obj);
         if (rows == 0) {
             // SQL 侧的下界兜底拦下了这次调整（正常路径不会走到这里，走到了说明校验被绕过）
             throw new BusinessException(TermMsg.t("该{schedule}席位调整失败，请刷新后重试"));
         }
        return Obj.getScheduleId();
    }


@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public   String updateStatus (StatusBody data) {
         //System.out .println("updateStatus called with scheduleId: " + data);
         scheduleMapper.updateStatus(data);
        cascadeOnScheduleStatusChange(data.getScheduleId(), data.getStatus());
        return  data.getScheduleId();
    }

    /**
     * 排期状态变更后的级联处置（报告根因 C：数据完整性兜底）。
     *
     * <p><b>为什么只在 frozen 时级联</b>：本方法被所有排期状态变更调用（active/pending/
     * inactive/frozen/结束等）。只有 {@code frozen} 是<b>软删除</b>语义——
     * 用户在界面上确认"删除"后前端走的就是这条路径（{@code operateSchedule(id,"frozen")}）。
     * 其余状态（激活、结束…）不改变"这条排期是否还存在"的判断，
     * 级联置子表状态反而会误伤：把排期临时置 pending 再切回 active，
     * 若每次都级联，其下的预订与课次会被反复改写。
     *
     * <p><b>处置内容</b>（规则见 {@link CascadeRules#SCENARIO_SCHEDULE_FREEZE}）：
     * 其下 booking 置 {@code frozen}、其下 appointment 置 {@code frozen}，全部<b>保留行</b>。
     * 保留而非物理删，是因为"排期暂停"不等于"这些预订从未存在"，
     * 排期恢复后这些预订应当原样可用；删掉就等于抹掉历史且不可恢复。
     *
     * <p>原先这个级联由浏览器编排（{@code deleteScheduleByFrozen} 先 confirm
     * 再逐个把预订置 frozen，最后才置排期），非原子、且只有 Web 端有；
     * 小程序调同一条接口完全不会级联——这与根因 B 同源。
     */
    private void cascadeOnScheduleStatusChange(String scheduleId, String status) {
        if (scheduleId == null || status == null
                || !BookingStatus.FROZEN.equalsIgnoreCase(status.trim())) {
            return;
        }
        // 先把该排期下每条预订的课次置 frozen，再把预订置 frozen。
        // 顺序与物理删除相反（软删是先把子置好、父最后），因为冻结全程保留行：
        // booking 只要还在，就能按 booking_id 找到它的课次。
        List<Booking> bookings = bookingMapper.selectList(
                Wrappers.<Booking>lambdaQuery().eq(Booking::getScheduleId, scheduleId));
        if (bookings != null && !bookings.isEmpty()) {
            List<String> bookingIds = bookings.stream()
                    .map(Booking::getBookingId)
                    .filter(b -> b != null && !b.trim().isEmpty())
                    .collect(Collectors.toList());
            cascadeService.run(CascadeRules.SCENARIO_BOOKING_FREEZE, bookingIds);
        }
        ReferentialCascadeService.CascadeReport report = cascadeService.run(
                CascadeRules.SCENARIO_SCHEDULE_FREEZE, scheduleId);
        log.info("排期冻结级联：scheduleId={}，预订 {} 条，{}", scheduleId,
                bookings == null ? 0 : bookings.size(), report.toMap());
    }

// 可以返回DTO对象，TBD
  @Transactional(propagation = Propagation.REQUIRED )
    public CourseSchedule selectById(String id) { 
            
         return scheduleMapper.selectById(id);
    }

@Transactional(propagation = Propagation.REQUIRED)
    public List<ScheduleCreateDTO> selectList(ScheduleCreateDTO obj) {
         
          List<CourseSchedule> s = scheduleMapper.selectByCreateDto(obj);//获取原始排期
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
                   log.debug("ObjectToCreateDto Error getting scheduleId: " + ex.getMessage());
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
                      String timePart = cs.getStartTime().length() >= 19 ? cs.getStartTime().substring(11, 19) : null;
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
                      log.debug("setEndTime : " +ex);   
                      log.debug(String.valueOf(java.time.LocalTime.parse(cs.getEndTime().substring(0, 19))));
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

    // endDate和endTime组合为end_time（格式 yyyy-MM-dd HH:mm:ss）
    if (dto.getEndDate() != null && dto.getEndTime() != null) {
        LocalDateTime endLdt = LocalDateTime.of(dto.getEndDate(), dto.getEndTime());
        cs.setEndTime(endLdt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

        //rguo: 如果结束日期与开始日期相同，结束日期增加 50 分钟
        if (  dto.getEndTime().equals(dto.getStartTime())) {
            endLdt = endLdt.plusMinutes(50);
            cs.setEndTime(endLdt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        }
    }
 
    cs.setRepeatType(dto.getRepeatType() == null ? 0 : dto.getRepeatType());
    cs.setRepeatInterval(dto.getRepeatInterval() == null ? 0 : dto.getRepeatInterval());
    // 席位总数：dto 里是 Integer（可空），实体是 int（不可空）。
    // 直接 setAvailableSites(dto.getAvailableSites()) 在当前端未传该字段时拆箱 NPE（500）。
    // 缺省为 1 与实体注释、DB 列 DEFAULT '1' 保持一致。
    // 注意：编辑排期时若 dto 未传，update() 会用库中现值覆盖这里，不会把容量重置成 1。
    cs.setAvailableSites(dto.getAvailableSites() == null ? 1 : dto.getAvailableSites());
    // 将 List<Integer> repeatDays 转为字符串存储（如 "1,3,5"）
    if (dto.getRepeatDays() != null && !dto.getRepeatDays().isEmpty()) {
        cs.setRepeatDays(dto.getRepeatDays().stream().map(String::valueOf).collect(Collectors.joining(",")));
    } else {
        cs.setRepeatDays(" ");
    }
 
    cs.setTimeZone(dto.getTimeZone());
    // 多租户/前端未传 status 时兜底为 active（枚举 pending/active/inactive/frozen），避免 NOT NULL 约束触发 500
    cs.setStatus(dto.getStatus() == null ? "active" : dto.getStatus());
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

        genDto.setInterval(crtDto.getRepeatInterval() == null ? 0 : crtDto.getRepeatInterval());
        genDto.setRepeatDays(crtDto.getRepeatDays());
        genDto.setTimeZone(crtDto.getTimeZone());
        genDto.setUserTimeZone(crtDto.getTimeZone());
        return genDto;
}

  @Transactional(rollbackFor = Exception.class)
  public boolean asgn_student(String scheduleId, String studentId,String teacherId) {
      if (scheduleId == null || studentId == null) {
          throw new BusinessException(TermMsg.t("{schedule}ID与{student}ID不能为空"));
      }

      // 1. 同一学生同一排期只应存在一条 booking。
      //    原实现无条件 insert：候补转正后再点「指定学生」会多出一条记录，
      //    同一学生同一排期出现两条 booked，席位被重复占用。
      //
      //    查重必须落在排期行锁**之内**：排期锁把并发的「指定学生」串行化，后到的请求
      //    才能看到先到者刚插入的那一行；若像原先那样先普通读查重、再进闸门拿锁，
      //    两个并发请求都会读到 null，各自走 insert 分支，锁完全覆盖不到这次判断。
      bookingSeatService.lockScheduleAndAssertExists(scheduleId);
      Booking existing = bookingMapper.selectLatestByScheduleAndStudent(scheduleId, studentId);
      String bookingId;
      if (existing != null) {
          bookingId = existing.getBookingId();
          if (BookingStatus.isBooked(existing.getStatus())) {
              // 已是正式预订：幂等返回，不新建记录、不重复占位、不重复生成课次
              log.info("指定学生：已存在正式预订，幂等返回。scheduleId={}, studentId={}, bookingId={}",
                      scheduleId, studentId, bookingId);
              return true;
          }
          // 候补 / 已取消 / 待确认 → 复用该记录转正（校验名额时排除自身）
          bookingSeatService.assertSeatsAvailable(
                  scheduleId, bookingId, BookingStatus.BOOKED, "无法再指定学生");
          bookingMapper.updateStatus(bookingId, BookingStatus.BOOKED);
          log.info("指定学生：复用已有记录并转为正式预订。bookingId={}, 原状态={}",
                  bookingId, existing.getStatus());
      } else {
          bookingSeatService.assertSeatsAvailable(
                  scheduleId, null, BookingStatus.BOOKED, "无法再指定学生");
          Booking booking = new Booking();
          // bookingId 生成口径与 BookingService#create 统一（32 位无横线 hex）。
          // 原先这里是 UUID.randomUUID().toString()（36 位带横线），而 BookingService
          // 产出的是 replace("-","") 的 32 位——同一张表两种格式的 ID 并存，
          // 是"悬空 booking_id"的根因之一：任何按 booking_id 的关联/排查都得同时对付
          // 两种长度，写错一处（少个 replace）就查不到对上行。
          bookingId = BookingIdGenerator.next();
          booking.setBookingId(bookingId);
          booking.setScheduleId(scheduleId);
          booking.setStudentId(studentId);
          booking.setTeacherId(teacherId);
          booking.setStatus(BookingStatus.BOOKED);
          bookingMapper.insert(booking);
      }

      // 2. 生成该 booking 的课次时间列表（幂等）
      generateAppointmentsForBooking(bookingId, scheduleId);
      return true;
  }

  /**
   * 为指定 booking 生成课次（appointment）时间列表。
   *
   * <p>幂等：该 booking 已有课次则直接返回，重复调用不会产生双份时间表。
   * 「指定学生」与「候补递补」共用这一份实现，避免两处各写一遍、日后走偏。
   */
  @Transactional(rollbackFor = Exception.class)
  public boolean generateAppointmentsForBooking(String bookingId, String scheduleId) {
      if (bookingId == null || scheduleId == null) {
          return false;
      }
      List<Appointment> existingAppointments = appointmentService.getByBookingId(bookingId);
      if (existingAppointments != null && !existingAppointments.isEmpty()) {
          // 幂等返回，但**不能就此认为完好**：课次存在不等于还在生效。
          // 典型场景 booked → cancelled（课次置 cancelled）→ 又被确认回 booked，
          // 此时若直接 return，booking 是 booked 而课次全是 cancelled —— 上课时间表"凭空消失"。
          // 故这里校验是否存在仍生效的课次；全是非生效态时补生成一份并显式核对条数。
          boolean anyActive = existingAppointments.stream()
                  .anyMatch(a -> AppointmentStatus.occupiesTime(a.getStatus()));
          if (anyActive) {
              log.info("课次已存在且仍生效，跳过生成：bookingId={}, 已有{}条",
                      bookingId, existingAppointments.size());
              return true;
          }
          // 走到这里说明课次存在但全部已取消/冻结：先物理清理再重新展开。
          // 这是唯一允许物理删除课次的路径——重复生成会导致同一时段出现两条时间行。
          log.info("课次存在但全部失效，重新生成：bookingId={}, 原{}条", bookingId, existingAppointments.size());
          // cascade: none AppointmentService#removeByBookingId 内已先清
          // notification_dispatch_log（APPOINTMENT_DELETE 场景）再删课次
          appointmentService.removeByBookingId(bookingId);
      }
      CourseSchedule schedule = scheduleMapper.selectById(scheduleId);
      if (schedule == null) {
          throw new BusinessException(TermMsg.t("{schedule}不存在"));
      }
      // 由排期的重复规则展开实例日期+时间
      ScheduleCreateDTO crtDto = ObjectToCreateDto(schedule);
      ScheduleGenerateDTO genDto = CreateDtoToGenerateDto(crtDto);
      List<ScheduleVO> instanceList = ScheduleGenerator.generateUserZoneSchedule(genDto);

      // 排期时区：从排期实体取，是本次换算的唯一依据。
      // generateUserZoneSchedule 展开出的 date+time 是「排期本地墙钟时间」，
      // 落库前必须转成 UTC，否则课次时间会随服务器时区/比较口径整体错位
      // （见 doc-develop/课次时间UTC化改造方案.md 步骤 2）。
      String scheduleZone = schedule.getTimeZone();

      List<Appointment> appointmentList = new ArrayList<>();
      int index = 1;
      for (ScheduleVO vo : instanceList) {
          Appointment appt = new Appointment();
          appt.setBookingId(bookingId);
          appt.setClassIndex(index++);
          String appointmentDateTime = vo.getDate() + " " + vo.getTime();
          LocalDateTime scheduleLocal = LocalDateTime.parse(
                  appointmentDateTime, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
          // 排期本地时间 → UTC。写入 appointment 的唯一转换点，勿绕过。
          LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(scheduleLocal, scheduleZone);
          appt.setAppointmentDatetime(utc);
          appt.setLastDatetime(utc);
          appt.setStatus("active");
          appointmentList.add(appt);
      }
      if (!appointmentList.isEmpty()) {
          appointmentService.insertAppointmentList(appointmentList);
      }
      log.info("生成课次完成：bookingId={}, scheduleId={}, 共{}条", bookingId, scheduleId, appointmentList.size());
      return true;
  }
    /**
     * 删除指定ID的排期
     * @param id 排期ID
     * @return 删除的排期数量（通常为1，若未找到则为0）
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int deleteById(String id) {
        log.info("删除排期开始, scheduleId={}", id);
            // 先由程序显式清理子表（课次 → 预订），再删排期本身。
            // 原先这里只有一句 DELETE，排期的预订由数据库的 ON DELETE CASCADE 连带删掉——
            // 而 appointment 没有指向 booking 的外键，于是那些课次全部变成悬空行
            // （实测 149 行课次中 109 行 booking_id 指向不存在的预订）。
            // 级联改由程序做，顺序与范围才可见、可审计（报告根因 C）。
            cascadeDeleteSchedules(Collections.singletonList(id));
            // 删除排期
            int deleted = scheduleMapper.deleteById(id);
            log.info("删除排期结束, scheduleId={}, 影响行数={}", id, deleted);
            // 释放租户排期额度
            if (deleted > 0) {
                tenantQuotaService.release(TenantContext.getTenantId(), TenantQuotaService.SCHEDULE);
            }
            // 返回实际删除条数：原先无条件 return 1，排期不存在时也报"删除成功"
            // （配合 FK CASCADE，删除 0 行时子表却已被连带删掉，调用方无从察觉）。
            return deleted;
      }

    /**
     * 删除一批排期的级联展开（课次 → 预订），<b>不删排期本身</b>。
     *
     * <p><b>为什么逐层展开而不写在一条规则里</b>：appointment 没有 schedule_id 列，
     * 只能经 {@code appointment.booking_id → booking.booking_id} 两跳抵达；
     * 而 booking 一旦先被删掉，第二跳就断了。因此必须"先按排期取 booking_id 集合，
     * 再逐条删课次，最后删预订"。这条跳数写在代码里而不是藏进规则表，
     * 是为了让"为什么这里要查一次 booking"成为显式的一步。
     */
    private void cascadeDeleteSchedules(List<String> scheduleIds) {
        if (scheduleIds == null || scheduleIds.isEmpty()) {
            return;
        }
        for (String scheduleId : scheduleIds) {
            if (scheduleId == null || scheduleId.trim().isEmpty()) {
                continue;
            }
            List<Booking> bookings = bookingMapper.selectList(
                    Wrappers.<Booking>lambdaQuery().eq(Booking::getScheduleId, scheduleId));
            if (bookings != null && !bookings.isEmpty()) {
                List<String> bookingIds = bookings.stream()
                        .map(Booking::getBookingId)
                        .filter(b -> b != null && !b.trim().isEmpty())
                        .collect(Collectors.toList());
                // 第一跳：按 booking_id 删课次（课次的唯一父引用就是 booking_id）
                cascadeService.run(CascadeRules.SCENARIO_BOOKING_DELETE, bookingIds);
            }
            // 第二跳：删预订（规则里 course_schedule→appointment 是 SKIP 占位，说明跳数）
            cascadeService.run(CascadeRules.SCENARIO_SCHEDULE_DELETE, scheduleId);
        }
    }
    /**
     * 根据课程ID删除该课程下的所有排期
     * @param courseId 课程ID
     * @return 删除的排期数量
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public int deleteByCourseId(String courseId) {
            log.info("按课程ID删除排期开始, courseId={}", courseId);
             // 同 deleteById：先按排期逐条做程序级联，再批量删排期。
             // 顺序不能颠倒——booking 一旦先被删掉，就再也定位不到它的课次。
             List<CourseSchedule> schedules = scheduleMapper.selectList(
                     Wrappers.<CourseSchedule>lambdaQuery().eq(CourseSchedule::getCourseId, courseId));
             if (schedules != null && !schedules.isEmpty()) {
                 List<String> scheduleIds = schedules.stream()
                         .map(CourseSchedule::getScheduleId)
                         .filter(s -> s != null && !s.trim().isEmpty())
                         .collect(Collectors.toList());
                 cascadeDeleteSchedules(scheduleIds);
             }
             int rows=            scheduleMapper.deleteByCourseId(courseId);
            log.info("按课程ID删除排期结束, courseId={}, 影响行数={}", courseId, rows);
            // 释放租户排期额度（按删除的排期条数）
            if (rows > 0) {
                tenantQuotaService.release(TenantContext.getTenantId(), TenantQuotaService.SCHEDULE, rows);
            }
            return rows;
      }

    @Transactional(propagation = Propagation.REQUIRED)
    public PageResult<ScheduleCreateDTO> selectListPage(ScheduleQueryPage query) {
        List<CourseSchedule> list = scheduleMapper.selectListByPage(query);
        List<ScheduleCreateDTO> dtoList = ListObjectToCreateDto(list);
        Integer total = scheduleMapper.selectCountByCondition(query);
        Page<ScheduleCreateDTO> page = new Page<>(query.getPageNum(), query.getPageSize());
        page.setRecords(dtoList);
        page.setTotal(total);
        return PageResult.of(page);
    }

    // 查询指定教师的可预约排期（可用席位 > 已预约数量）
    public List<CourseSchedule> getAvailableSchedule(String teacherId) {
        // 本方法是**免登录公开接口**（/schedule/getAvailableSchedule 在三处白名单里）的专用实现：
        // 公开链接的访问者没有租户身份，TenantContext 为空，普通查询会被租户插件追加
        // tenant_id = -1 而恒不命中（返回空列表），故这里统一走 *IgnoreTenant 版本。
        // 详见 CourseScheduleMapper#selectActiveSchedulesByTeacherIdIgnoreTenant 的注释。
        List<CourseSchedule> schedules = scheduleMapper.selectActiveSchedulesByTeacherIdIgnoreTenant(teacherId);

        List<CourseSchedule> availableSchedules = new ArrayList<>();
        for (CourseSchedule schedule : schedules) {
            // 剩余席位同样必须用忽略租户的计数，否则计数恒为 0，
            // 会把「已约满」的排期也当成有空位返回给家长
            int bookingCount = bookingMapper.countBookingByScheduleIdIgnoreTenant(
                    schedule.getScheduleId(), BookingStatus.NON_OCCUPYING);
            if (schedule.getAvailableSites() > bookingCount) {
                availableSchedules.add(schedule);
            }
        }
        return availableSchedules;
    }

    // 查询指定教师的全部活跃排期（含已约满），供职业信息编辑界面「读取排期」使用。
    // 与 getAvailableSchedule（公开预订页专用，仅返回有空位的排期）区分：编辑/发布场景
    // 需要看到全部活跃排期，以便配置对外链接与优选标记。复用忽略租户的查询——
    // teacherId 取自已登录教师的职业信息（受信任），且本接口置于登录鉴权之下（不进公开
    // 白名单），平台管理员跨租户查看时也正确返回该教师的排期。
    public List<CourseSchedule> getSchedulesByTeacher(String teacherId) {
        // 编辑/发布界面专用：放开 course 状态限制（仅要求排期本身 active），
        // 这样课程处于 pending/draft/frozen 时其 active 排期仍可在「读取排期」中显示并配置优选/链接。
        List<CourseSchedule> schedules = scheduleMapper.selectActiveSchedulesByTeacherIdManageIgnoreTenant(teacherId);
        for (CourseSchedule schedule : schedules) {
            // 与 getAvailableSchedule 相同的余位口径：占用席位 = 状态不在 NON_OCCUPYING 的预订数。
            // full = 可用席位 <= 占用数（即没有空位）。前端据此向客户标注「满额」。
            int bookingCount = bookingMapper.countBookingByScheduleIdIgnoreTenant(
                    schedule.getScheduleId(), BookingStatus.NON_OCCUPYING);
            schedule.setFull(!(schedule.getAvailableSites() > bookingCount));
        }
        return schedules;
    }
  
}//all 