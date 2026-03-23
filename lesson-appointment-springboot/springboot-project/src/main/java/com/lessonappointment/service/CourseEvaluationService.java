package com.lessonappointment.service;

import com.lessonappointment.entity.CourseEvaluation;
import com.lessonappointment.repository.CourseEvaluationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CourseEvaluationService {

    private final CourseEvaluationRepository courseEvaluationRepository;

    public List<CourseEvaluation> findAll() {
        return courseEvaluationRepository.findAll();
    }

    public Optional<CourseEvaluation> findById(String id) {
        return courseEvaluationRepository.findById(id);
    }

    public List<CourseEvaluation> findByStudentId(String studentId) {
        return courseEvaluationRepository.findByStudentId(studentId);
    }

    public List<CourseEvaluation> findByTeacherId(String teacherId) {
        return courseEvaluationRepository.findByTeacherId(teacherId);
    }

    public List<CourseEvaluation> findByCourseId(String courseId) {
        return courseEvaluationRepository.findByCourseId(courseId);
    }

    public Optional<CourseEvaluation> findByBookingId(String bookingId) {
        return courseEvaluationRepository.findByBookingId(bookingId);
    }

    @Transactional
    public CourseEvaluation create(CourseEvaluation evaluation) {
        if (courseEvaluationRepository.existsByBookingId(evaluation.getBookingId())) {
            throw new IllegalArgumentException("Evaluation already exists for booking: " + evaluation.getBookingId());
        }
        if (evaluation.getScore() < 1 || evaluation.getScore() > 5) {
            throw new IllegalArgumentException("Score must be between 1 and 5");
        }
        return courseEvaluationRepository.save(evaluation);
    }

    @Transactional
    public CourseEvaluation update(String id, CourseEvaluation evaluation) {
        CourseEvaluation existing = courseEvaluationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("CourseEvaluation not found: " + id));
        if (evaluation.getScore() < 1 || evaluation.getScore() > 5) {
            throw new IllegalArgumentException("Score must be between 1 and 5");
        }
        evaluation.setEvaluationId(id);
        evaluation.setCreateTime(existing.getCreateTime());
        return courseEvaluationRepository.save(evaluation);
    }

    @Transactional
    public void delete(String id) {
        if (!courseEvaluationRepository.existsById(id)) {
            throw new RuntimeException("CourseEvaluation not found: " + id);
        }
        courseEvaluationRepository.deleteById(id);
    }
}
