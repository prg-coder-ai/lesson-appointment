# SpringBoot 预约表完整 CRUD 开发文档

我已经把**今天下午我们所有对话**完整整理成 **Markdown 格式文件**，你直接复制下面全部内容，保存为 `\.md` 后缀文件即可（例如：`springboot\-appointment\-crud\.md`）。

```markdown
# SpringBoot 预约表( appointment ) 完整 CRUD 开发文档

## 一、数据库表结构
```sql
CREATE TABLE `appointment` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '唯一编号',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '预约id',
  `class_index` int DEFAULT '1' COMMENT '课时序号',
  `appointmemnt_datetime` datetime DEFAULT NULL COMMENT '排期预约中的一个课时时间',
  `last_datetime` datetime DEFAULT NULL COMMENT '可能修改前的日期时间',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT '本预约时间的状态:active生效/noted已发通知1/2/completed已完成/已改期changed',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预约时间列表';
```

## 二、SpringBoot 完整代码

### 1\. 实体类 Appointment\.java

```java
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("appointment")
public class Appointment {
    @TableId(type = IdType.AUTO)
    private Integer id;
    private String bookingId;
    private Integer classIndex;
    private LocalDateTime appointmentDatetime;
    private LocalDateTime lastDatetime;
    private String status;
}
```

### 2\. Mapper 接口 AppointmentMapper\.java

```java
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.demo.entity.Appointment;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AppointmentMapper extends BaseMapper<Appointment> {
}
```

### 3\. Service 接口 AppointmentService\.java

```java
import com.baomidou.mybatisplus.extension.service.IService;
import com.example.demo.entity.Appointment;
import java.util.List;

public interface AppointmentService extends IService<Appointment> {
    List<Appointment> getByBookingId(String bookingId);
    List<Appointment> getByStatus(String status);
    List<Appointment> getBetweenTime(String startTime, String endTime);
}
```

### 4\. Service 实现类 AppointmentServiceImpl\.java

```java
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.demo.entity.Appointment;
import com.example.demo.mapper.AppointmentMapper;
import com.example.demo.service.AppointmentService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.List;

@Service
@Slf4j
public class AppointmentServiceImpl
        extends ServiceImpl<AppointmentMapper, Appointment>
        implements AppointmentService {

    @Override
    public List<Appointment> getByBookingId(String bookingId) {
        log.info("【查询预约】开始执行，bookingId: {}", bookingId);
        List<Appointment> list = lambdaQuery()
                .eq(Appointment::getBookingId, bookingId)
                .list();
        log.info("【查询预约】执行完成，结果数量: {}", list.size());
        return list;
    }

    @Override
    public List<Appointment> getByStatus(String status) {
        log.info("【按状态查询】状态值: {}", status);
        return lambdaQuery()
                .eq(Appointment::getStatus, status)
                .list();
    }

    @Override
    public List<Appointment> getBetweenTime(String startTime, String endTime) {
        return lambdaQuery()
                .between(Appointment::getAppointmentDatetime,
                        LocalDateTime.parse(startTime),
                        LocalDateTime.parse(endTime))
                .list();
    }
}
```

### 5\. 控制器 AppointmentController\.java

```java
import com.example.demo.entity.Appointment;
import com.example.demo.service.AppointmentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/appointment")
public class AppointmentController {

    @Autowired
    private AppointmentService appointmentService;

    @PostMapping("/add")
    public boolean add(@RequestBody Appointment appointment) {
        return appointmentService.save(appointment);
    }

    @DeleteMapping("/delete/{id}")
    public boolean delete(@PathVariable Integer id) {
        return appointmentService.removeById(id);
    }

    @PutMapping("/update")
    public boolean update(@RequestBody Appointment appointment) {
        return appointmentService.updateById(appointment);
    }

    @GetMapping("/get/{id}")
    public Appointment getById(@PathVariable Integer id) {
        return appointmentService.getById(id);
    }

    @GetMapping("/list")
    public List<Appointment> list() {
        return appointmentService.list();
    }

    @GetMapping("/getByBookingId")
    public List<Appointment> getByBookingId(@RequestParam String bookingId) {
        return appointmentService.getByBookingId(bookingId);
    }

    @GetMapping("/getByStatus")
    public List<Appointment> getByStatus(@RequestParam String status) {
        return appointmentService.getByStatus(status);
    }
}
```

### 6\. 启动类

```java
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.example.demo.mapper")
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
```

### 7\. 配置文件 application\.yml

```yaml
spring:
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/你的数据库名?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    username: root
    password: 你的密码

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
  type-aliases-package: com.example.demo.entity
```

## 三、自定义查询方法（Service 层）

### 常用查询条件

```java
lambdaQuery()
   .eq(字段, 值)       // 等于
   .ne(字段, 值)       // 不等于
   .like(字段, 值)     // 模糊查询
   .gt(字段, 值)       // 大于
   .lt(字段, 值)       // 小于
   .between(字段, 开始, 结束)
   .in(字段, 集合)
   .list()  // 返回列表
   .one()   // 返回单个
   .count() // 返回数量
```

## 四、Service 层日志使用

### 1\. 开启日志

```java
@Service
@Slf4j
public class AppointmentServiceImpl { ... }
```

### 2\. 日志级别

```java
log.debug("调试日志");
log.info("普通日志");
log.warn("警告日志");
log.error("错误日志", e);
```

### 3\. 异常日志示例

```java
@Override
public boolean updateAppointment(Appointment appointment) {
    try {
        log.info("【修改预约】id: {}", appointment.getId());
        return updateById(appointment);
    } catch (Exception e) {
        log.error("【修改预约】异常！", e);
        return false;
    }
}
```

## 五、接口列表

- POST `/appointment/add` 新增

- DELETE `/appointment/delete/\{id\}` 删除

- PUT `/appointment/update` 修改

- GET `/appointment/get/\{id\}` 单条查询

- GET `/appointment/list` 全部查询

- GET `/appointment/getByBookingId` 按预约 ID 查询

- GET `/appointment/getByStatus` 按状态查询

```Plain Text
---

### 保存方法
1. 新建文本文件
2. 把上面**全部内容**复制进去
3. 重命名为：`对话记录.md`
4. 用 Typora / VS Code / 记事本 都能打开

需要我帮你**导出成可直接下载的文件**，或者**整理成更精简版**也可以告诉我！
```

> （注：文档部分内容可能由 AI 生成）
