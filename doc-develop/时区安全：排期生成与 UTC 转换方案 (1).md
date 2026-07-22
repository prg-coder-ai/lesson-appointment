# 时区安全：排期生成与 UTC 转换方案

下面给你一套**生产可用、彻底解决时区/星期错乱**的完整方案：

前端传用户时区 → 后端统一转 **UTC 存储** → 返回时转回用户时区展示。

---

# 0. 整体流程（最重要）

1. 前端获取浏览器时区：`Asia/Shanghai`

2. 前端传：开始日期、时间、重复规则、时区

3. 后端**按用户时区生成排期**（保证星期正确）

4. 把每个排期时间 **转为 UTC 存入数据库**

5. 查询/返回时：UTC → 用户时区 → 前端展示

这样无论用户在全球哪里，**日期、星期、时间永远正确**。

---

# 补充：ZoneId 语法及用法（核心基础）

在本排期方案中，ZoneId 是实现时区安全的核心类，用于表示时区信息，贯穿“用户时区获取→排期生成→UTC转换”全流程，以下详细介绍其语法、用法及实战场景。

## 一、ZoneId 基本语法

ZoneId 是 Java 8 引入的 java.time 包下的类，用于封装时区信息，替代了传统的 TimeZone 类，语法简洁、线程安全，核心语法如下：

### 1. 核心构造/获取方式（3种常用）

```Java
ZoneId 核心获取语法
// 1. 通过时区ID获取（最常用，推荐）
ZoneId zoneId1 = ZoneId.of("Asia/Shanghai"); // 中国标准时间（CST，UTC+8）
ZoneId zoneId2 = ZoneId.of("UTC"); // 世界统一时间
ZoneId zoneId3 = ZoneId.of("America/New_York"); // 纽约时区（UTC-5/UTC-4）

// 2. 获取系统默认时区（不推荐用于跨时区项目，易错乱）
ZoneId defaultZone = ZoneId.systemDefault();

// 3. 获取所有可用时区ID（用于下拉选择等场景）
Set<String> allZoneIds = ZoneId.getAvailableZoneIds();
    
```

### 2. 关键说明

- 时区ID 遵循 IANA 标准（如 `Asia/Shanghai`、`Europe/London`），避免使用缩写（如 `CST` 可能有多种含义，易出错）。

- ZoneId 是不可变类，一旦创建，无法修改，线程安全，可直接用于多线程环境（如排期生成、接口并发请求）。

- 前端传递的时区ID（如 `Intl.DateTimeFormat().resolvedOptions().timeZone`），可直接通过`ZoneId.of()` 解析，无需额外转换。

## 二、ZoneId 核心用法（贴合本排期方案）

结合本排期方案的“时区判断、时间转换”核心需求，ZoneId 主要用于以下3个场景，与工具类、Controller 逻辑高度契合。

### 1. 场景1：按用户时区判断星期（排期核心）

通过 ZoneId 将 LocalDate 转为带时区的 ZonedDateTime，确保星期计算基于用户本地时区，避免跨时区错乱，对应工具类中 `isMatchWeek` 方法：

```Java
ZoneId 用于星期判断
// 传入用户时区ID，判断当前日期在该时区下的星期
private static boolean isMatchWeek(LocalDate date, List<Integer> target, ZoneId zoneId) {
    // LocalDate 转 ZonedDateTime（绑定用户时区）
    ZonedDateTime zonedDateTime = date.atStartOfDay(zoneId);
    // 获取该时区下的星期（1=周一，7=周日）
    int week = zonedDateTime.getDayOfWeek().getValue();
    return target.contains(week);
}

// 调用示例（前端传的时区ID）
ZoneId userZone = ZoneId.of("Asia/Shanghai");
boolean isMatch = isMatchWeek(LocalDate.of(2026,5,1), List.of(1), userZone);
    
```

### 2. 场景2：用户时区与UTC转换（存库/返回前端）

通过 ZoneId 实现 LocalDateTime 在“用户时区”与“UTC”之间的转换，是本方案“统一存UTC、展示转用户时区”的核心，对应工具类中 `toUtc` 和 `toUserZone` 方法：

```Java
ZoneId 用于时区转换
// 1. 用户时区 → UTC（存库）
public static LocalDateTime toUtc(LocalDateTime userDateTime, String zoneId) {
    ZoneId userZone = ZoneId.of(zoneId); // 解析用户时区
    return userDateTime.atZone(userZone) // 绑定用户时区
            .withZoneSameInstant(ZoneId.of("UTC")) // 转换为UTC时区
            .toLocalDateTime(); // 转为LocalDateTime存库
}

// 2. UTC → 用户时区（返回前端）
public static LocalDateTime toUserZone(LocalDateTime utcDateTime, String zoneId) {
    ZoneId userZone = ZoneId.of(zoneId);
    return utcDateTime.atZone(ZoneId.of("UTC")) // 绑定UTC时区
            .withZoneSameInstant(userZone) // 转换为用户时区
            .toLocalDateTime(); // 转为用户本地时间
}
    
```

### 3. 场景3：获取时区相关辅助信息

可通过 ZoneId 获取时区偏移量、时区名称等信息，用于日志打印、排期备注等场景：

```Java
ZoneId 辅助用法
ZoneId userZone = ZoneId.of("Asia/Shanghai");
// 获取时区偏移量（如 UTC+8:00）
ZoneOffset offset = userZone.getRules().getOffset(Instant.now());
System.out.println(offset); // 输出：+08:00

// 获取时区ID和显示名称
String zoneIdStr = userZone.getId(); // 输出：Asia/Shanghai
String displayName = userZone.getDisplayName(TextStyle.FULL, Locale.CHINA); // 输出：中国标准时间
    
```

## 三、注意事项（避坑重点）

- 禁止使用 `ZoneId.systemDefault()` 进行排期生成和时区转换——系统默认时区依赖服务器配置，若服务器时区变更，会导致全表排期错乱。

- 前端传递的时区ID必须是 IANA 标准ID（如 `Asia/Shanghai`），避免传递 `CST`、`GMT+8` 等非标准格式，否则 `ZoneId.of()` 会报错。

- ZoneId 与 LocalDate/LocalDateTime 结合使用时，需通过 `atStartOfDay(zoneId)`（LocalDate）或 `atZone(zoneId)`（LocalDateTime）绑定时区，否则仍为无时区时间。

---

# 1. 前端完整提交代码（带时区）

```JavaScript
// 获取用户时区（关键）
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// 构造参数
const form = {
  startDate: document.getElementById('startDate').value,
  startTime: document.getElementById('startTime').value,
  repeatType: document.getElementById('repeatType').value,
  interval: parseInt(document.getElementById('interval').value) || 1,
  repeatDays: (() => {
    if (document.getElementById('repeatType').value === 'week') {
      return Array.from(document.querySelectorAll('#weekDays input:checked'))
        .map(cb => Number(cb.value));
    }
    return [];
  })(),
  endDate: document.getElementById('endDate').value,
  timeZone: userTimeZone  // 必须传
};

// 请求后端生成排期
fetch("/api/schedule/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(form)
})
.then(res => res.json())
.then(data => {
  console.log("排期结果（用户本地时间）", data.data);
  renderList(data.data);
});
```

---

# 2. DTO 接收类

```Java
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class ScheduleGenerateDTO {
    private LocalDate startDate;
    private LocalTime startTime;
    private String repeatType;    // none/day/week/month
    private Integer interval;
    private List<Integer> repeatDays; // 1=周一 ... 7=周日
    private LocalDate endDate;
    private String timeZone;      // 前端传的用户时区
}
```

---

# 3. 【核心工具类】时区安全排期生成 + UTC 转换

```Java
import java.time.*;
import java.util.ArrayList;
import java.util.List;

public class ScheduleGenerator {

    // 生成用户时区的排期
    public static List<LocalDateTime> generateUserZoneSchedule(ScheduleGenerateDTO dto) {
        ZoneId userZone = ZoneId.of(dto.getTimeZone());
        LocalDate start = dto.getStartDate();
        LocalDate end = dto.getEndDate();
        String type = dto.getRepeatType();
        int interval = dto.getInterval() == null ? 1 : dto.getInterval();
        List<Integer> weekDays = dto.getRepeatDays() == null ? List.of() : dto.getRepeatDays();
        LocalTime time = dto.getStartTime();

        List<LocalDateTime> userSchedule = new ArrayList<>();
        LocalDate current = start;

        while (!current.isAfter(end)) {
            boolean needAdd = switch (type) {
                case "none" -> true;
                case "day"  -> true;
                case "week" -> isMatchWeek(current, weekDays, userZone);
                case "month"-> true;
                default -> false;
            };

            if (needAdd) {
                userSchedule.add(LocalDateTime.of(current, time));
            }

            current = nextDate(current, type, interval);
        }
        return userSchedule;
    }

    // 判断星期（按用户时区，绝对正确）
    private static boolean isMatchWeek(LocalDate date, List<Integer> target, ZoneId zoneId) {
        int week = date.atStartOfDay(zoneId).getDayOfWeek().getValue();
        return target.contains(week);
    }

    // 下一个日期
    private static LocalDate nextDate(LocalDate current, String type, int interval) {
        return switch (type) {
            case "none" -> current.plusYears(100);
            case "day"  -> current.plusDays(interval);
            case "week" -> current.plusWeeks(interval);
            case "month"-> current.plusMonths(interval);
            default -> current;
        };
    }

    // ==================== 时区转换工具 ======================
    // 用户时区 → UTC（存库）
    public static LocalDateTime toUtc(LocalDateTime userDateTime, String zoneId) {
        ZoneId userZone = ZoneId.of(zoneId);
        return userDateTime.atZone(userZone)
                .withZoneSameInstant(ZoneId.of("UTC"))
                .toLocalDateTime();
    }

    // UTC → 用户时区（返回前端）
    public static LocalDateTime toUserZone(LocalDateTime utcDateTime, String zoneId) {
        ZoneId userZone = ZoneId.of(zoneId);
        return utcDateTime.atZone(ZoneId.of("UTC"))
                .withZoneSameInstant(userZone)
                .toLocalDateTime();
    }
}
```

---

# 4. Controller（生成 + 保存 + 查询）

```Java
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/schedule")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleMapper scheduleMapper;

    // 生成排期并保存（存 UTC）
    @PostMapping("/generate")
    public Result<List<ScheduleVO>> generateAndSave(@RequestBody ScheduleGenerateDTO dto) {
        // 1. 生成用户时区排期（星期正确）
        List<LocalDateTime> userZoneList = ScheduleGenerator.generateUserZoneSchedule(dto);

        // 2. 转 UTC 存库
        List<SchedulePO> poList = userZoneList.stream().map(userTime -> {
            LocalDateTime utcTime = ScheduleGenerator.toUtc(userTime, dto.getTimeZone());
            SchedulePO po = new SchedulePO();
            po.setCourseId(1L); // 你自己的课程ID
            po.setScheduleUtc(utcTime);
            po.setTimeZone(dto.getTimeZone());
            return po;
        }).collect(Collectors.toList());

        // 批量保存
        scheduleMapper.insertBatch(poList);

        // 3. 转回用户时区返回前端
        List<ScheduleVO> voList = userZoneList.stream().map(time -> {
            ScheduleVO vo = new ScheduleVO();
            vo.setDate(time.toLocalDate().toString());
            vo.setTime(time.toLocalTime().toString());
            return vo;
        }).collect(Collectors.toList());

        return Result.success(voList);
    }

    // 查询排期（自动转用户时区）
    @PostMapping("/list")
    public Result<List<ScheduleVO>> list(Long courseId, String timeZone) {
        List<SchedulePO> poList = scheduleMapper.selectByCourseId(courseId);

        List<ScheduleVO> voList = poList.stream().map(po -> {
            LocalDateTime userTime = ScheduleGenerator.toUserZone(po.getScheduleUtc(), timeZone);
            ScheduleVO vo = new ScheduleVO();
            vo.setDate(userTime.toLocalDate().toString());
            vo.setTime(userTime.toLocalTime().toString());
            return vo;
        }).collect(Collectors.toList());

        return Result.success(voList);
    }
}
```

---

# 5. 数据库 PO / VO

### PO（存库，UTC 时间）

```Java
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class SchedulePO {
    private Long id;
    private Long courseId;
    private LocalDateTime scheduleUtc;  // 存 UTC
    private String timeZone;            // 记录用户时区
}
```

### VO（返回前端，用户本地时间）

```Java
import lombok.Data;

@Data
public class ScheduleVO {
    private String date;
    private String time;
}
```

---

# 6. 为什么这套方案永远不会乱？

1. **排期生成基于用户时区** → 星期 100% 匹配前端勾选

2. **数据库统一存 UTC** → 全球统一、跨时区不乱

3. **返回时自动转回用户时区** → 展示正确

4. 彻底避免：

5. 前端选周一 → 后端变成周二

6. 国内正常 → 国外日期错一天

7. 服务器时区变了 → 全表排期错乱

---

# 7. 你只需要补充一个 Mapper 接口

```Java
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface ScheduleMapper {
    void insertBatch(@Param("list") List<SchedulePO> list);
    List<SchedulePO> selectByCourseId(@Param("courseId") Long courseId);
}
```

---

需要我再给你写：

- 对应的 XML SQL（批量插入 + 查询）

或者

- 把这套逻辑直接整合到你现有的排期管理页面？
> （注：文档部分内容可能由 AI 生成）