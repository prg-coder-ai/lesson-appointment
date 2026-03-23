package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "course_template")
public class CourseTemplate {

    @Id
    @UuidGenerator
    @Column(name = "template_id", length = 36, nullable = false)
    private String templateId;

    /**
     * Language type: 英语/日语/韩语/法语/德语/西班牙语
     */
    @Column(name = "language_type", length = 20, nullable = false)
    private String languageType;

    /**
     * Difficulty level: 入门/进阶/中级/高级
     */
    @Column(name = "difficulty_level", length = 20, nullable = false)
    private String difficultyLevel;

    @Column(name = "class_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal classFee;

    /**
     * Duration in minutes (>= 15, multiple of 15)
     */
    @Column(name = "class_duration", nullable = false)
    private Integer classDuration;

    /**
     * Class form: 一对一/小班课/大班课
     */
    @Column(name = "class_form", length = 20, nullable = false)
    private String classForm;

    @Column(name = "description", length = 500, nullable = false)
    private String description;

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    @Column(name = "update_time", nullable = false)
    private LocalDateTime updateTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
        updateTime = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updateTime = LocalDateTime.now();
    }
}
