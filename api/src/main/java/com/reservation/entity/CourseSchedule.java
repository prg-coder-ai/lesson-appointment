// 课程模板实体（对应设计2.2.2 课程模板相关接口）
package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;

// 课程排期实体（对应设计2.2.2 排期相关接口）
@Data
@TableName("course_schedule")
public class CourseSchedule implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;

    @TableId(type = IdType.ASSIGN_ID)
    private String scheduleId;
    @NotBlank(message = "课程ID不能为空")
    private String courseId; 

    /**
     * 课程/咨询类型（classType 的 code）。默认取自课程，可在本条排期覆盖。
     *
     * <p><b>它不是课堂用语</b>——法律行业下 code=english 显示的是「劳动」。
     * 「用哪种语言上课」见 {@link #workLanguage}。
     */
    private String languageType;

    /**
     * 授课语言（本条排期实际使用的课堂用语：english/french/chinese/…）。
     *
     * <p>创建排期时由服务端从课程带入，之后可在排期上单独改——同一门课在不同排期
     * 用不同语言授课是真实业务（外教班 / 中教班），锁死在课程上就表达不了。
     *
     * <p>空串 = 跟随课程。代码取自 {@code sys_work_language.lang_code}。
     */
    private String workLanguage;

    /**
     * 课时长度（分钟）。
     *
     * <p>此前排期表没有这个字段，冲突检查只能硬编码「每节课 1 小时」
     * （{@code CourseScheduleService#checkScheduleOwnerConflict} 的 plusHours(1)），
     * 90 分钟的课与 20:00 的课被判为不冲突。落列后按各自时长判重叠。
     *
     * <p>用 Integer：编辑排期时未传该字段应为 null，让 MyBatis-Plus 的
     * NOT_NULL 更新策略跳过它，而不是把库里的 90 分钟静默改回 60。
     */
    private Integer classDuration;

    @NotBlank(message = "开始时间不能为空")
    private String startTime;  // 格式YYYY-MM-DD HH:mm:ss-（对应通用校验规则-时间）-暗含起始日期 
    @NotBlank(message = "结束时间不能为空")
    private String endTime;//暗含重复结束日期 repeatEndDate
    @NotNull(message = "重复标识不能为空")   
    private int repeatType;//重复类型：0=不重复，1=每天，2=每周，3=每月
    private int repeatInterval;//重复周期（如每2周一次=2）
    private String repeatDays;//重复的星期几：1=周一，2=周二...7=周日，逗号分隔（仅repeat_type=2时有效），type=3时为1-31,当月的那几天，如（1，3，5，7） ，（1，11，21）
   // private LocalDate repeatEndDate;  //重复结束时间（精确到秒）
    private int availableSites;//可预定数量，缺省为1，可填写，
    private String status;  // 枚举值：pending/active/inactive/frozen
    private String timeZone;//排期计划的时区
     private String name;//排期名称
    /** 是否满额（瞬时字段，不入库）：availableSites <= 占用席位数 时为 true。供编辑/发布界面向客户标注。 */
    @TableField(exist = false)
    private Boolean full;
}
//简化版本：每个排期只包含1次课（repeate_type=0),只允许available_sites个人参与预定，available_sites可以编辑（将来可从模板、课程中带入）。
