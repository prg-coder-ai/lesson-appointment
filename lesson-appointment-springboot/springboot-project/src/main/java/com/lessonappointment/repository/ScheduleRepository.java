package com.lessonappointment.repository;

import com.lessonappointment.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScheduleRepository extends JpaRepository<Schedule, String> {

    List<Schedule> findByCourseId(String courseId);

    List<Schedule> findByStatus(String status);

    List<Schedule> findByCourseIdAndStatus(String courseId, String status);
}
