package com.lessonappointment.repository;

import com.lessonappointment.entity.Booking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BookingRepository extends JpaRepository<Booking, String> {

    List<Booking> findByStudentId(String studentId);

    List<Booking> findByScheduleId(String scheduleId);

    List<Booking> findByStatus(String status);

    List<Booking> findByStudentIdAndStatus(String studentId, String status);
}
