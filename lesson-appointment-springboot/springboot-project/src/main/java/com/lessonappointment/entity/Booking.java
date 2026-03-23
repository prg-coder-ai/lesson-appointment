package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "booking")
public class Booking {

    @Id
    @UuidGenerator
    @Column(name = "booking_id", length = 36, nullable = false)
    private String bookingId;

    @Column(name = "schedule_id", length = 36, nullable = false)
    private String scheduleId;

    @Column(name = "student_id", length = 36, nullable = false)
    private String studentId;

    /**
     * Status: booked / cancelled / completed
     */
    @Column(name = "status", length = 20, nullable = false)
    private String status = "booked";

    @Column(name = "create_time", nullable = false, updatable = false)
    private LocalDateTime createTime;

    @Column(name = "update_time", nullable = false)
    private LocalDateTime updateTime;

    @PrePersist
    protected void onCreate() {
        createTime = LocalDateTime.now();
        updateTime = LocalDateTime.now();
        if (status == null) status = "booked";
    }

    @PreUpdate
    protected void onUpdate() {
        updateTime = LocalDateTime.now();
    }
}
