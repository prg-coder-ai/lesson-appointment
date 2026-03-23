package com.lessonappointment.repository;

import com.lessonappointment.entity.CourseTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CourseTemplateRepository extends JpaRepository<CourseTemplate, String> {

    List<CourseTemplate> findByLanguageType(String languageType);

    List<CourseTemplate> findByDifficultyLevel(String difficultyLevel);

    Optional<CourseTemplate> findByLanguageTypeAndDifficultyLevel(String languageType, String difficultyLevel);

    boolean existsByLanguageTypeAndDifficultyLevel(String languageType, String difficultyLevel);
}
