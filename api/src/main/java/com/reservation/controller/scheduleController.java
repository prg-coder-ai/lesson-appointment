import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import javax.annotation.Resource;

@RestController
@RequestMapping("/course/schedule")
public class CourseScheduleController {

    @Resource
    private CourseScheduleService scheduleService;

    // 创建排期
    @PostMapping("/create")
    public Result<Long> createSchedule(@Validated @RequestBody CourseScheduleCreateDTO dto) {
        Long scheduleId = scheduleService.createSchedule(dto);
        return Result.success(scheduleId);
    }

    // 修改排期
    @PostMapping("/update")
    public Result<Long> createSchedule(@Validated @RequestBody Schedule dto) {
        String scheduleId = scheduleService.updateSchedule(dto);
        return Result.success(scheduleId);

 // 更新可用数incSiteBody { "inc":1、-1 ，"id":scheduleId)
    @PostMapping("/incSite")
    public Result<Long> createSchedule(@Validated @RequestBody incSiteBody dto) {
        Long scheduleId = scheduleService.updateScheduleSites(dto);
        return Result.success(scheduleId);

// 更新状态 (scheduleId，status)
    @PostMapping("/updateStatus")
    public Result<Long> createSchedule(@Validated @RequestBody StatusBody dto) {
        Long scheduleId = scheduleService.updateScheduleStatus(dto);
        return Result.success(scheduleId);

    // 查询排期详情（含展开后的实例，用于前端展示）
    @GetMapping("/detail/{id}")
    public Result<CourseSchedule> getScheduleDetail(@PathVariable Long id) {
        CourseSchedule schedule = scheduleService.selectById(id);
        return Result.success(schedule);
    }

//输入可能的检索参数，暂保留
    @GetMapping("/list")
    public Result< List<CourseSchedule>> getScheduleList(@Validated @RequestBody Schedule dto) {
        List<CourseSchedule> schedules = scheduleService.selectList(dto);
        Map<String, List<Course>> resultMap = Map.of("schedules", courseList);
        return Result.success(resultMap, "查询成功");
    }
}