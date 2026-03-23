package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "schedule")
public class Schedule {

    @Id
    @UuidGenerator
    @Column(name = "schedule_id", length = 36, nullable = false)
    private String scheduleId;

    @Column(name = "course_id", length = 36, nullable = false)
    private String courseId;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    /**
     * Whether to repeat: 0 = no, 1 = yes
     */
    @Column(name = "is_repeat", nullable = false)
    private Boolean isRepeat;

    /**
     * Repeat weekday: 1-7 (Monday-Sunday), required when isRepeat = true
     */
    @Column(name = "repeat_week")
    private Integer repeatWeek;

    /**
     * Status: available / unavailable
     */
    @Column(name = "status", length = 20, nullable = false)
    private String status = "available";

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    @Column(name = "update_time", nullable = false)
    private LocalDateTime updateTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
        updateTime = LocalDateTime.now();
        if (status == null) status = "available";
    }

    @PreUpdate
    protected void onUpdate() {
        updateTime = LocalDateTime.now();
    }
}
