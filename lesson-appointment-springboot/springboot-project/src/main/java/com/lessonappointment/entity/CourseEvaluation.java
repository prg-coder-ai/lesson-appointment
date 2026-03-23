package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "course_evaluation")
public class CourseEvaluation {

    @Id
    @UuidGenerator
    @Column(name = "evaluation_id", length = 36, nullable = false)
    private String evaluationId;

    @Column(name = "booking_id", length = 36, nullable = false, unique = true)
    private String bookingId;

    @Column(name = "student_id", length = 36, nullable = false)
    private String studentId;

    @Column(name = "teacher_id", length = 36, nullable = false)
    private String teacherId;

    @Column(name = "course_id", length = 36, nullable = false)
    private String courseId;

    /**
     * Score: 1-5
     */
    @Column(name = "score", nullable = false)
    private Integer score;

    @Column(name = "content", length = 500)
    private String content;

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
    }
}
