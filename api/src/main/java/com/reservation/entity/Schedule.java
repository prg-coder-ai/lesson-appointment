// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Date;
import java.io.Serializable;
// 课程排期实体（对应设计2.2.2 排期相关接口）
@Data
public class Schedule implements Serializable {
    private String scheduleId;
    @NotBlank(message = "课程ID不能为空")
    private String courseId;
    @NotBlank(message = "开始时间不能为空")
    private Date startTime;  // 格式YYYY-MM-DD HH:mm:ss（对应通用校验规则-时间）
    @NotBlank(message = "结束时间不能为空")
    private Date endTime;
    @NotNull(message = "重复标识不能为空")
    private Boolean isRepeat;
    private Integer repeatWeek;  // 1-7，isRepeat=true时必填（对应通用校验规则）
    private String status;  // 枚举值：available/unavailable
}