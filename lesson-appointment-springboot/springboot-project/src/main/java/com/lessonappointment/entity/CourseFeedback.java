package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "course_feedback")
public class CourseFeedback {

    @Id
    @UuidGenerator
    @Column(name = "feedback_id", length = 36, nullable = false)
    private String feedbackId;

    @Column(name = "course_id", length = 36, nullable = false)
    private String courseId;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "content", length = 1000)
    private String content;

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    /**
     * Admin user ID who handles this feedback
     */
    @Column(name = "handle_id", length = 36, nullable = false)
    private String handleId;

    /**
     * Handle status: 0=pending / 1=handled
     */
    @Column(name = "handle_status", length = 36, nullable = false)
    private String handleStatus;

    @Column(name = "handle_content", length = 1000)
    private String handleContent;

    @Column(name = "handle_time")
    private LocalDateTime handleTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
    }
}
