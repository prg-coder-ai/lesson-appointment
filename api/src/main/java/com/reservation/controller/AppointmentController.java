package  com.reservation.controller;

import com.reservation.entity.Appointment;
import com.reservation.service.AppointmentService;
import com.reservation.common.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
// 解决依赖注入找不到 AppointmentService 的问题
// 如果你用的是实现类（如 AppointmentServiceImpl），并已加 @Service 注解，确保包扫描没问题。
// 若自定义实现未加 @Service，可手动声明 bean 或补上注解。
// 这里给接口加 @Service 是错误做法 —— 应检查实现类代码。
// 示例：确保实现类在 com.reservation.service.impl 包下，并写有：
// @Service
// public class AppointmentServiceImpl implements AppointmentService { ... }
// 如果依然报错，可以添加如下配置作为兜底（通常只针对特殊配置环境，常规 Spring Boot 不需）：
/*
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.reservation.service.impl.AppointmentServiceImpl;

@Configuration
public class ServiceConfig {
    @Bean
    public AppointmentService appointmentService() {
        return new AppointmentServiceImpl();
    }
}
*/

@RestController
@RequestMapping("/course/appointment")
public class AppointmentController {

    @Autowired
    private AppointmentService appointmentService;

    /**
     * 1. 新增预约时间
     */
    @PostMapping("/add")
    public Result<Boolean> add(@RequestBody Appointment appointment) {
         return Result.success(appointmentService.save(appointment),"ok");
    }
//批量添加时间表
@PostMapping("/addBatch")
    public Result<Boolean> add(@RequestBody List<Appointment> appointment) {
         return Result.success(appointmentService.saveBatch(appointment),"ok");
    }

    /**
     * 2. 根据ID删除
     */
    @DeleteMapping("/delete/{id}")
    public Result<Boolean> delete(@PathVariable Integer id) {
        return Result.success(appointmentService.removeById(id),"ok");
    }

    /**
     * 3. 根据ID修改
     */
    @PutMapping("/update")
    public Result<Boolean> update(@RequestBody Appointment appointment) {
        return Result.success(appointmentService.updateById(appointment),"ok");
    }

@PutMapping("/updateStatusByBookingId")
    public Result<Boolean> update(@RequestParam String bookingId,@RequestParam String status) {
        return Result.success(appointmentService.updateStatusByBookingId(bookingId,status),"ok");
    }
    /**
     * 4. 根据ID查询单条
     */
    @GetMapping("/get/{id}")
    public Result<Appointment> getById(@PathVariable Integer id) {
        return Result.success(appointmentService.getById(id),"ok");
    }

    /**
     * 5. 查询所有预约时间
     */
    @GetMapping("/list")
    public Result<List<Appointment>> list() {
        return Result.success(appointmentService.list(),"ok");
    }
 
    // 根据 bookingId 查询
    @GetMapping("/getByBookingId")
    public Result<List<Appointment>> getByBookingId(@RequestParam String bookingId) {
        return Result.success(appointmentService.getByBookingId(bookingId),"ok");
    }

    // 根据状态查询
    @GetMapping("/getByStatus")
    public Result<List<Appointment>> getByStatus(@RequestParam String status) {
        return Result.success(appointmentService.getByStatus(status),"ok");
    }
}