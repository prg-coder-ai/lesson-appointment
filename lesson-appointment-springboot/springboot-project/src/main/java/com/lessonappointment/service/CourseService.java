package com.lessonappointment.service;

import com.lessonappointment.entity.Course;
import com.lessonappointment.repository.CourseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CourseService {

    private final CourseRepository courseRepository;

    public List<Course> findAll() {
        return courseRepository.findAll();
    }

    public Optional<Course> findById(String id) {
        return courseRepository.findById(id);
    }

    public List<Course> findByTeacherId(String teacherId) {
        return courseRepository.findByTeacherId(teacherId);
    }

    public List<Course> findByTemplateId(String templateId) {
        return courseRepository.findByTemplateId(templateId);
    }

    @Transactional
    public Course create(Course course) {
        return courseRepository.save(course);
    }

    @Transactional
    public Course update(String id, Course course) {
        Course existing = courseRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Course not found: " + id));
        course.setCourseId(id);
        course.setCreateTime(existing.getCreateTime());
        return courseRepository.save(course);
    }

    @Transactional
    public void delete(String id) {
        if (!courseRepository.existsById(id)) {
            throw new RuntimeException("Course not found: " + id);
        }
        courseRepository.deleteById(id);
    }
}
