package com.lessonappointment.repository;

import com.lessonappointment.entity.Course;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CourseRepository extends JpaRepository<Course, String> {

    List<Course> findByTeacherId(String teacherId);

    List<Course> findByTemplateId(String templateId);
}
