package com.lessonappointment.repository;

import com.lessonappointment.entity.CourseCheckIn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CourseCheckInRepository extends JpaRepository<CourseCheckIn, String> {

    List<CourseCheckIn> findByBookingId(String bookingId);

    boolean existsByBookingId(String bookingId);
}
