package com.lessonappointment.repository;

import com.lessonappointment.entity.CourseEvaluation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CourseEvaluationRepository extends JpaRepository<CourseEvaluation, String> {

    List<CourseEvaluation> findByStudentId(String studentId);

    List<CourseEvaluation> findByTeacherId(String teacherId);

    List<CourseEvaluation> findByCourseId(String courseId);

    Optional<CourseEvaluation> findByBookingId(String bookingId);

    boolean existsByBookingId(String bookingId);
}
