package com.lessonappointment.service;

import com.lessonappointment.entity.Schedule;
import com.lessonappointment.repository.ScheduleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final ScheduleRepository scheduleRepository;

    public List<Schedule> findAll() {
        return scheduleRepository.findAll();
    }

    public Optional<Schedule> findById(String id) {
        return scheduleRepository.findById(id);
    }

    public List<Schedule> findByCourseId(String courseId) {
        return scheduleRepository.findByCourseId(courseId);
    }

    public List<Schedule> findByStatus(String status) {
        return scheduleRepository.findByStatus(status);
    }

    public List<Schedule> findByCourseIdAndStatus(String courseId, String status) {
        return scheduleRepository.findByCourseIdAndStatus(courseId, status);
    }

    @Transactional
    public Schedule create(Schedule schedule) {
        if (schedule.getIsRepeat() != null && schedule.getIsRepeat()
                && (schedule.getRepeatWeek() == null || schedule.getRepeatWeek() < 1 || schedule.getRepeatWeek() > 7)) {
            throw new IllegalArgumentException("repeatWeek must be between 1 and 7 when isRepeat is true");
        }
        if (schedule.getEndTime() != null && schedule.getStartTime() != null
                && !schedule.getEndTime().isAfter(schedule.getStartTime())) {
            throw new IllegalArgumentException("endTime must be after startTime");
        }
        return scheduleRepository.save(schedule);
    }

    @Transactional
    public Schedule update(String id, Schedule schedule) {
        Schedule existing = scheduleRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Schedule not found: " + id));

        if (schedule.getIsRepeat() != null && schedule.getIsRepeat()
                && (schedule.getRepeatWeek() == null || schedule.getRepeatWeek() < 1 || schedule.getRepeatWeek() > 7)) {
            throw new IllegalArgumentException("repeatWeek must be between 1 and 7 when isRepeat is true");
        }
        if (schedule.getEndTime() != null && schedule.getStartTime() != null
                && !schedule.getEndTime().isAfter(schedule.getStartTime())) {
            throw new IllegalArgumentException("endTime must be after startTime");
        }

        schedule.setScheduleId(id);
        schedule.setCreateTime(existing.getCreateTime());
        return scheduleRepository.save(schedule);
    }

    @Transactional
    public void delete(String id) {
        if (!scheduleRepository.existsById(id)) {
            throw new RuntimeException("Schedule not found: " + id);
        }
        scheduleRepository.deleteById(id);
    }
}
