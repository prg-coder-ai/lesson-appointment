package com.lessonappointment.service;

import com.lessonappointment.entity.CourseTemplate;
import com.lessonappointment.repository.CourseTemplateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CourseTemplateService {

    private final CourseTemplateRepository courseTemplateRepository;

    public List<CourseTemplate> findAll() {
        return courseTemplateRepository.findAll();
    }

    public Optional<CourseTemplate> findById(String id) {
        return courseTemplateRepository.findById(id);
    }

    public List<CourseTemplate> findByLanguageType(String languageType) {
        return courseTemplateRepository.findByLanguageType(languageType);
    }

    public List<CourseTemplate> findByDifficultyLevel(String difficultyLevel) {
        return courseTemplateRepository.findByDifficultyLevel(difficultyLevel);
    }

    @Transactional
    public CourseTemplate create(CourseTemplate template) {
        if (courseTemplateRepository.existsByLanguageTypeAndDifficultyLevel(
                template.getLanguageType(), template.getDifficultyLevel())) {
            throw new IllegalArgumentException(
                    "Template already exists for language: " + template.getLanguageType()
                    + " and level: " + template.getDifficultyLevel());
        }
        return courseTemplateRepository.save(template);
    }

    @Transactional
    public CourseTemplate update(String id, CourseTemplate template) {
        CourseTemplate existing = courseTemplateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("CourseTemplate not found: " + id));

        boolean languageChanged = !existing.getLanguageType().equals(template.getLanguageType());
        boolean levelChanged = !existing.getDifficultyLevel().equals(template.getDifficultyLevel());

        if ((languageChanged || levelChanged) && courseTemplateRepository.existsByLanguageTypeAndDifficultyLevel(
                template.getLanguageType(), template.getDifficultyLevel())) {
            throw new IllegalArgumentException(
                    "Template already exists for language: " + template.getLanguageType()
                    + " and level: " + template.getDifficultyLevel());
        }

        template.setTemplateId(id);
        template.setCreateTime(existing.getCreateTime());
        return courseTemplateRepository.save(template);
    }

    @Transactional
    public void delete(String id) {
        if (!courseTemplateRepository.existsById(id)) {
            throw new RuntimeException("CourseTemplate not found: " + id);
        }
        courseTemplateRepository.deleteById(id);
    }
}
