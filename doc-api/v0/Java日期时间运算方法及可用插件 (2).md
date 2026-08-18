# Java日期时间运算方法及可用插件

## 一、Java原生日期时间运算（无需插件，基础必备）

核心分为两个版本：JDK8之前（Date/Calendar）、JDK8及之后（java.time包，推荐），优先使用JDK8+新API，简洁无坑。

### 1. JDK8+ java.time 详细使用方法（核心重点）

JDK8 新增的 `java.time` 包，是替代旧版 Date/Calendar 的官方标准，无需额外依赖，原生支持日期时间运算、时区处理，以下是核心类及用法（结合开发场景，直接复制可用）：

#### 核心类说明（必记）

- **LocalDate**：仅包含日期（年/月/日），无时间、无时区（如：2026-04-24）

- **LocalTime**：仅包含时间（时/分/秒/纳秒），无日期、无时区（如：15:30:45）

- **LocalDateTime**：包含日期+时间，无时区（最常用，如：2026-04-24 15:30:45）

- **ZonedDateTime**：包含日期、时间、时区（跨时区场景用）

- **Duration**：计算两个时间的间隔（时/分/秒，适合短时间差）

- **Period**：计算两个日期的间隔（年/月/日，适合长时间差）

#### 详细使用示例（直接复制可用）

##### （1）创建日期/时间对象

```Plain Text
// 1. 获取当前日期（无时间）
LocalDate nowDate = LocalDate.now(); // 输出：2026-04-24

// 2. 获取当前时间（无日期）
LocalTime nowTime = LocalTime.now(); // 输出：15:35:20

// 3. 获取当前日期+时间（最常用）
LocalDateTime now = LocalDateTime.now(); // 输出：2026-04-24T15:35:20.123

// 4. 手动指定日期时间（避免格式错误）
LocalDate specifyDate = LocalDate.of(2026, 4, 24); // 2026-04-24
LocalTime specifyTime = LocalTime.of(9, 30, 0); // 09:30:00
LocalDateTime specifyDT = LocalDateTime.of(2026, 4, 24, 9, 30, 0); // 2026-04-24T09:30:00
```

##### （2）日期/时间加减运算

```Plain Text
// 1. LocalDate 加减（年/月/日）
LocalDate date = LocalDate.now();
LocalDate nextYear = date.plusYears(1); // 加1年
LocalDate lastMonth = date.minusMonths(1); // 减1个月
LocalDate next3Days = date.plusDays(3); // 加3天

// 2. LocalTime 加减（时/分/秒）
LocalTime time = LocalTime.now();
LocalTime nextHour = time.plusHours(1); // 加1小时
LocalTime last30Min = time.minusMinutes(30); // 减30分钟

// 3. LocalDateTime 综合加减（最常用）
LocalDateTime now = LocalDateTime.now();
LocalDateTime newDT = now.plusDays(10) // 加10天
                        .minusHours(2) // 减2小时
                        .plusMinutes(15); // 加15分钟
```

##### （3）两个日期/时间的间隔计算

```Plain Text
// ① 计算两个日期的间隔（年/月/日）
LocalDate date1 = LocalDate.of(2026, 1, 1);
LocalDate date2 = LocalDate.of(2026, 4, 24);
Period period = Period.between(date1, date2);
System.out.println(period.getYears() + "年" + period.getMonths() + "月" + period.getDays() + "天"); // 0年3月23天

// ② 计算两个时间的间隔（时/分/秒）
LocalTime time1 = LocalTime.of(9, 0, 0);
LocalTime time2 = LocalTime.of(10, 30, 45);
Duration duration = Duration.between(time1, time2);
System.out.println(duration.toHours() + "小时" + duration.toMinutesPart() + "分钟" + duration.toSecondsPart() + "秒"); // 1小时30分钟45秒

// ③ 计算两个日期时间的总间隔（综合）
LocalDateTime dt1 = LocalDateTime.of(2026, 1, 1, 0, 0);
LocalDateTime dt2 = LocalDateTime.of(2026, 4, 24, 15, 30);
Duration total = Duration.between(dt1, dt2);
System.out.println("总间隔：" + total.toDays() + "天" + total.toHoursPart() + "小时"); // 113天15小时
```

##### （4）时区相关（补充）

```Plain Text
// 1. 获取当前系统时区的日期时间
ZonedDateTime zdt = ZonedDateTime.now(); // 如：2026-04-24T15:40:00+08:00[Asia/Shanghai]

// 2. 指定时区（如UTC、纽约时区）
ZonedDateTime utcDT = ZonedDateTime.now(ZoneId.of("UTC"));
ZonedDateTime nyDT = ZonedDateTime.now(ZoneId.of("America/New_York"));

// 3. 时区转换（如UTC转北京时间）
ZonedDateTime utcZdt = ZonedDateTime.now(ZoneId.of("UTC"));
ZonedDateTime beijingZdt = utcZdt.withZoneSameInstant(ZoneId.of("Asia/Shanghai"));
```

##### （5）日期格式化（结合开发常用）

```Plain Text
// 方式1：原生SimpleDateFormat（兼容旧代码）
SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
String format1 = sdf.format(Date.from(now.atZone(ZoneId.systemDefault()).toInstant()));

// 方式2：JDK8+新方式（推荐，无需处理时区转换）
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String format2 = now.format(formatter); // 直接格式化，无需转换
```

##### （6）常见判断场景

```Plain Text
// 判断日期是否在当前之前/之后
LocalDate today = LocalDate.now();
LocalDate target = LocalDate.of(2026, 5, 1);
boolean isBefore = target.isBefore(today); // false（5月1日在4月24日之后）
boolean isAfter = target.isAfter(today); // true

// 判断两个日期是否相等
boolean isEqual = today.isEqual(LocalDate.of(2026, 4, 24)); // true
```

核心类：LocalDate（日期）、LocalTime（时间）、LocalDateTime（日期+时间）、Duration（时间间隔）、Period（日期间隔），运算无需手动处理时区、闰年，自动适配。

#### 常用运算示例（直接复制可用）

- **日期加减**（年/月/日）

- `// 1. 当前日期加1年、减2个月、加3天
LocalDate nowDate = LocalDate.now();
LocalDate newDate = nowDate.plusYears(1) // 加1年
                          .minusMonths(2) // 减2个月
                          .plusDays(3); // 加3天
System.out.println(newDate); // 输出：2027-02-27（当前为2026-04-24）`

- **时间加减**（时/分/秒）

- `// 2. 当前时间加2小时、减30分钟
LocalTime nowTime = LocalTime.now();
LocalTime newTime = nowTime.plusHours(2)
                          .minusMinutes(30);
System.out.println(newTime); // 输出：当前时间+2h-30min`

- **日期时间加减**（综合运算）

- `// 3. 当前日期时间加10天、减1小时
LocalDateTime now = LocalDateTime.now();
LocalDateTime newDateTime = now.plusDays(10)
                               .minusHours(1);
System.out.println(newDateTime);`

- **计算两个日期/时间的间隔**

- `// 4. 计算两个日期的间隔（年/月/日）
LocalDate date1 = LocalDate.of(2026, 1, 1);
LocalDate date2 = LocalDate.of(2026, 4, 24);
Period period = Period.between(date1, date2);
System.out.println("间隔：" + period.getYears() + "年" + period.getMonths() + "月" + period.getDays() + "天"); // 0年3月23天

// 5. 计算两个时间的间隔（时/分/秒）
LocalTime time1 = LocalTime.of(9, 0, 0);
LocalTime time2 = LocalTime.of(10, 30, 45);
Duration duration = Duration.between(time1, time2);
System.out.println("间隔：" + duration.toHours() + "小时" + duration.toMinutesPart() + "分钟" + duration.toSecondsPart() + "秒"); // 1小时30分钟45秒`

- **日期比较**

- `// 6. 比较两个日期大小（isAfter/isBefore/isEqual）
LocalDate dateA = LocalDate.of(2026, 4, 24);
LocalDate dateB = LocalDate.of(2026, 4, 25);
boolean isAfter = dateA.isAfter(dateB); // false
boolean isBefore = dateA.isBefore(dateB); // true
boolean isEqual = dateA.isEqual(dateB); // false`

### 2. JDK8之前（Date/Calendar，不推荐）

缺点：需手动处理时区、闰年，代码繁琐，易出错，仅用于旧项目兼容。

```java
// 示例：日期加1天
Date date = new Date();
Calendar calendar = Calendar.getInstance();
calendar.setTime(date);
calendar.add(Calendar.DAY_OF_MONTH, 1); // 加1天
Date newDate = calendar.getTime();
```

## 二、常用日期时间插件（简化开发，提升效率）

原生API已能满足大部分需求，插件主要用于复杂场景（如跨时区、格式化、工具类封装），以下是最常用、最稳定的3个插件。

### 1. Joda-Time（经典老牌，旧项目常用）

JDK8之前的“日期工具天花板”，JDK8的java.time包就是参考它设计的，适合旧项目升级、兼容场景。

#### 使用步骤

- 1. 导入Maven依赖

- `<dependency>
    <groupId>joda-time</groupId>
    <artifactId>joda-time</artifactId>
    <version>2.12.5</version>
</dependency>`

- 2. 核心运算示例

- `// 日期加1年、减3天
DateTime dateTime = new DateTime();
DateTime newDateTime = dateTime.plusYears(1).minusDays(3);

// 计算两个日期间隔
DateTime date1 = new DateTime(2026, 1, 1, 0, 0);
DateTime date2 = new DateTime(2026, 4, 24, 0, 0);
Days days = Days.daysBetween(date1, date2);
System.out.println("间隔天数：" + days.getDays()); // 113天`

### 2. Hutool（国产工具包，推荐新项目）

Java工具集，封装了原生java.time和Joda-Time，API更简洁，无需记忆复杂方法，还支持日期格式化、解析、时区转换，日常开发首选。

#### 使用步骤

- 1. 导入Maven依赖

- `<dependency>
    <groupId>cn.hutool</groupId>
    <artifactId>hutool-all</artifactId>
    <version>5.8.25</version>
</dependency>`

- 2. 核心运算示例（极简）

```Plain Text
// 1. 日期加减（无需手动创建对象）
LocalDate newDate = DateUtil.offset(LocalDate.now(), DateField.YEAR, 1); // 加1年
LocalDateTime newDateTime = DateUtil.offset(LocalDateTime.now(), DateField.DAY_OF_MONTH, -3); // 减3天

// 2. 计算间隔
long days = DateUtil.betweenDay(LocalDate.of(2026,1,1), LocalDate.of(2026,4,24), true); // 113天（true表示包含结束日期）

// 3. 日期比较
boolean isAfter = DateUtil.isAfter(LocalDate.of(2026,4,24), LocalDate.of(2026,4,25)); // false

// 4. 格式化（附带常用功能）
String format = DateUtil.format(LocalDateTime.now(), "yyyy-MM-dd HH:mm:ss"); // 2026-04-24 15:30:00

// 补充：根据当前时区显示时间和日期（核心新增）
// 方法1：获取当前时区（系统默认时区，如东八区）
String currentZoneTime = DateUtil.now("yyyy-MM-dd HH:mm:ss", TimeZone.getDefault());
System.out.println("当前时区时间：" + currentZoneTime); // 输出当前系统时区的日期时间

// 方法2：指定时区显示（如东八区、UTC时区）
// 东八区（北京时间）
TimeZone beijingZone = TimeZone.getTimeZone("GMT+8");
String beijingTime = DateUtil.now("yyyy-MM-dd HH:mm:ss", beijingZone);
System.out.println("北京时区时间：" + beijingTime);

// UTC时区
TimeZone utcZone = TimeZone.getTimeZone("UTC");
String utcTime = DateUtil.now("yyyy-MM-dd HH:mm:ss", utcZone);
System.out.println("UTC时区时间：" + utcTime);

// 方法3：获取当前时区信息+对应时间（完整用法）
TimeZone currentZone = TimeZone.getDefault();
String zoneId = currentZone.getID(); // 如 Asia/Shanghai
String currentTimeWithZone = DateUtil.format(LocalDateTime.now(), "yyyy-MM-dd HH:mm:ss") + "（时区：" + zoneId + "）";
System.out.println("当前时区及时间：" + currentTimeWithZone);
```

### 3. Apache Commons Lang3（通用工具包，顺带使用）

Apache出品的通用工具包，包含日期工具类DateUtils，适合已引入该包的项目（无需额外导包），功能简洁，适合简单运算。

#### 使用步骤

- 1. 导入Maven依赖

- `<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-lang3</artifactId>
    <version>3.14.0</version>
</dependency>`

- 2. 核心运算示例

- `// 日期加1天、减1小时（支持Date类型）
Date date = new Date();
Date newDate = DateUtils.addDays(date, 1);
Date newDate2 = DateUtils.addHours(date, -1);

// 日期比较
boolean isAfter = DateUtils.isAfter(date, new Date(System.currentTimeMillis() - 10000)); // 判断当前日期是否在10秒前之后`

## 三、关键注意事项

- 优先使用 **JDK8+ java.time包**，原生无依赖，避免冗余，且自动适配时区、闰年。

- 新项目推荐搭配 **Hutool**，简化开发，减少重复代码（如日期格式化、时区转换）。

- 日期运算时注意 **时区问题**：LocalDateTime默认无时区，跨时区场景用ZonedDateTime；浏览器端需获取用户本地时区，再与后端时间同步。

- 旧项目兼容用Joda-Time，新项目优先用java.time包，避免依赖冗余。

- 新增：如何从浏览器中获取用户的时区信息（前端+后端联动）

    浏览器自带获取时区的能力，无需额外插件，前端代码（JavaScript）可直接获取，再传递给后端，实现“用户本地时区+后端时间”同步，示例如下：
    `
// 前端（JavaScript）获取用户浏览器时区
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; 
// 输出示例：Asia/Shanghai（东八区）、America/New_York（西五区）等
// 然后将userTimezone通过接口参数传递给后端，后端结合该时区处理时间显示

// 后端（Java）接收浏览器传递的时区，结合Hutool处理
String userTimezone = "Asia/Shanghai"; // 前端传递过来的用户时区
// 结合Hutool格式化对应时区的时间
String userLocalTime = DateUtil.format(LocalDateTime.now(), "yyyy-MM-dd HH:mm:ss", TimeZone.getTimeZone(userTimezone));
System.out.println("用户本地时区时间：" + userLocalTime);
    `
    核心说明：浏览器通过Intl.DateTimeFormat() API获取用户本地时区（系统自动识别，无需用户手动输入），传递给后端后，后端可根据该时区格式化时间，确保用户看到的时间与自己本地时间一致。
  

- 优先使用 **JDK8+ java.time包**，原生无依赖，避免Joda-Time的冗余（Joda-Time已停止更新）。

- 新项目推荐搭配 **Hutool**，简化代码，减少重复开发（如日期格式化、跨时区转换）。

- 日期运算时注意 **时区问题**：LocalDateTime默认无时区，需时区转换用ZonedDateTime（如UTC转北京时间）。

- 旧项目兼容用Joda-Time，新项目尽量不引入，避免依赖冗余。
> （注：文档部分内容可能由 AI 生成）