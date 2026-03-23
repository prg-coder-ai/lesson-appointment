package com.lessonappointment.service;

import com.lessonappointment.entity.CourseCheckIn;
import com.lessonappointment.repository.CourseCheckInRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CourseCheckInService {

    private final CourseCheckInRepository courseCheckInRepository;

    public List<CourseCheckIn> findAll() {
        return courseCheckInRepository.findAll();
    }

    public Optional<CourseCheckIn> findById(String id) {
        return courseCheckInRepository.findById(id);
    }

    public List<CourseCheckIn> findByBookingId(String bookingId) {
        return courseCheckInRepository.findByBookingId(bookingId);
    }

    @Transactional
    public CourseCheckIn create(CourseCheckIn checkIn) {
        if (courseCheckInRepository.existsByBookingId(checkIn.getBookingId())) {
            throw new IllegalArgumentException("Check-in already exists for booking: " + checkIn.getBookingId());
        }
        return courseCheckInRepository.save(checkIn);
    }

    @Transactional
    public CourseCheckIn update(String id, CourseCheckIn checkIn) {
        if (!courseCheckInRepository.existsById(id)) {
            throw new RuntimeException("CourseCheckIn not found: " + id);
        }
        checkIn.setCheckInId(id);
        return courseCheckInRepository.save(checkIn);
    }

    @Transactional
    public void delete(String id) {
        if (!courseCheckInRepository.existsById(id)) {
            throw new RuntimeException("CourseCheckIn not found: " + id);
        }
        courseCheckInRepository.deleteById(id);
    }
}
