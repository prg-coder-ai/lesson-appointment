// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.dto;

import com.fasterxml.jackson.annotation.JsonSetter;
import lombok.AccessLevel;
import lombok.Data;
import lombok.Setter;

/*import java.io.Serializable;
import java.util.Date;*/
import java.time.LocalDate;
import java.time.LocalTime;

 
import java.util.List; 

@Data
public class ScheduleCreateDTO {
    /** 租户ID — SaaS多租户；服务端应以 TenantContext 覆盖，勿信任客户端传值 */
    private Long tenantId;
    private String scheduleId;
    private String courseId;
    //private String teacherId;
    //private String ClassroomId;

    /**
     * 课程/咨询类型（classType 的 code，可空）。为空时由服务端从课程带入；排期上可单独覆盖。
     */
    private String languageType;

    /**
     * 授课语言（可空）。用哪种语言上课，代码取自 sys_work_language.lang_code。
     *
     * <p>为空时由服务端从课程带入；排期上可单独覆盖（外教班 / 中教班）。
     * 空串表示"跟随课程"，不要与 languageType（课程/咨询类型）混用。
     */
    private String workLanguage;

    /**
     * 课时长度（分钟，可空）。为空时由服务端从课程带入（课程也为空则 60）。
     * 冲突检查按此值判重叠，不再硬编码 1 小时。
     */
    private Integer classDuration;

    private LocalDate startDate;
    private LocalTime startTime;
    private LocalDate endDate;
    private LocalTime endTime;
    
    @Setter(AccessLevel.NONE)
    private Integer repeatType; //0-none 1=day/2-week/3-month

    @JsonSetter("repeatType")
    public void setRepeatType(Object value) {
        if (value == null) {
            this.repeatType = null;
            return;
        }
        if (value instanceof Number) {
            this.repeatType = ((Number) value).intValue();
            return;
        }
        String s = value.toString().trim().toLowerCase();
        switch (s) {
            case "none":
            case "0":
                this.repeatType = 0;
                break;
            case "day":
            case "1":
                this.repeatType = 1;
                break;
            case "week":
            case "2":
                this.repeatType = 2;
                break;
            case "month":
            case "3":
                this.repeatType = 3;
                break;
            default:
                this.repeatType = Integer.parseInt(s);
        }
    }
    private Integer repeatInterval;
    private List<Integer> repeatDays; // 前端传数组，如 [1,3,5] 
    private String timeZone;      // 前端传的排期时区
    private Integer availableSites;//
    private String status;
    private String name;

}
