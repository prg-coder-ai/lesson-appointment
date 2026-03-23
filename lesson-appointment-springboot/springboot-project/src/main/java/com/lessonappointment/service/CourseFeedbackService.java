package com.lessonappointment.service;

import com.lessonappointment.entity.CourseFeedback;
import com.lessonappointment.repository.CourseFeedbackRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CourseFeedbackService {

    private final CourseFeedbackRepository courseFeedbackRepository;

    public List<CourseFeedback> findAll() {
        return courseFeedbackRepository.findAll();
    }

    public Optional<CourseFeedback> findById(String id) {
        return courseFeedbackRepository.findById(id);
    }

    public List<CourseFeedback> findByCourseId(String courseId) {
        return courseFeedbackRepository.findByCourseId(courseId);
    }

    public List<CourseFeedback> findByUserId(String userId) {
        return courseFeedbackRepository.findByUserId(userId);
    }

    public List<CourseFeedback> findByHandleStatus(String handleStatus) {
        return courseFeedbackRepository.findByHandleStatus(handleStatus);
    }

    @Transactional
    public CourseFeedback create(CourseFeedback feedback) {
        return courseFeedbackRepository.save(feedback);
    }

    @Transactional
    public CourseFeedback update(String id, CourseFeedback feedback) {
        CourseFeedback existing = courseFeedbackRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("CourseFeedback not found: " + id));
        feedback.setFeedbackId(id);
        feedback.setCreateTime(existing.getCreateTime());
        return courseFeedbackRepository.save(feedback);
    }

    @Transactional
    public void delete(String id) {
        if (!courseFeedbackRepository.existsById(id)) {
            throw new RuntimeException("CourseFeedback not found: " + id);
        }
        courseFeedbackRepository.deleteById(id);
    }
}
