package com.lessonappointment.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "course_check_in")
public class CourseCheckIn {

    @Id
    @UuidGenerator
    @Column(name = "check_in_id", length = 36, nullable = false)
    private String checkInId;

    @Column(name = "booking_id", length = 36, nullable = false)
    private String bookingId;

    @Column(name = "check_in_time", nullable = false)
    private LocalDateTime checkInTime;

    @PrePersist
    protected void onCreate() {
        if (checkInTime == null) {
            checkInTime = LocalDateTime.now();
        }
    }
}
