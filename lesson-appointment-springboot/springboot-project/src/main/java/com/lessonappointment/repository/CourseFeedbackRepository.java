package com.lessonappointment.repository;

import com.lessonappointment.entity.CourseFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CourseFeedbackRepository extends JpaRepository<CourseFeedback, String> {

    List<CourseFeedback> findByCourseId(String courseId);

    List<CourseFeedback> findByUserId(String userId);

    List<CourseFeedback> findByHandleStatus(String handleStatus);

    List<CourseFeedback> findByHandleId(String handleId);
}
