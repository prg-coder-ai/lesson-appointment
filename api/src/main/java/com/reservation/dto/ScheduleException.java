// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.dto;

/*import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.Date;
import java.util.List;*/
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
// 课程排期实体（对应设计2.2.2 排期相关接口） 
@Data
public class ScheduleException {
    private Long id;
    private Long scheduleId;
    private LocalDate originalDate;
    private Integer exceptionType; // 0=取消，1=调课
    private LocalDateTime newStartTime;
    private LocalDateTime newEndTime;
    private LocalDateTime createTime;
}
 