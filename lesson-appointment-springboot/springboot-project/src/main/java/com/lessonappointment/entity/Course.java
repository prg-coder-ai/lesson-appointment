package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "course")
public class Course {

    @Id
    @UuidGenerator
    @Column(name = "course_id", length = 36, nullable = false)
    private String courseId;

    @Column(name = "template_id", length = 36, nullable = false)
    private String templateId;

    @Column(name = "course_name", length = 50, nullable = false)
    private String courseName;

    @Column(name = "content", length = 1000, nullable = false)
    private String content;

    @Column(name = "feature", length = 1000, nullable = false)
    private String feature;

    @Column(name = "teacher_id", length = 36, nullable = false)
    private String teacherId;

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
