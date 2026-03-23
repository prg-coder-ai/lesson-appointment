package com.lessonappointment.service;

import com.lessonappointment.entity.Booking;
import com.lessonappointment.repository.BookingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class BookingService {

    private final BookingRepository bookingRepository;

    public List<Booking> findAll() {
        return bookingRepository.findAll();
    }

    public Optional<Booking> findById(String id) {
        return bookingRepository.findById(id);
    }

    public List<Booking> findByStudentId(String studentId) {
        return bookingRepository.findByStudentId(studentId);
    }

    public List<Booking> findByScheduleId(String scheduleId) {
        return bookingRepository.findByScheduleId(scheduleId);
    }

    public List<Booking> findByStatus(String status) {
        return bookingRepository.findByStatus(status);
    }

    @Transactional
    public Booking create(Booking booking) {
        return bookingRepository.save(booking);
    }

    @Transactional
    public Booking update(String id, Booking booking) {
        Booking existing = bookingRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Booking not found: " + id));
        booking.setBookingId(id);
        booking.setCreateTime(existing.getCreateTime());
        return bookingRepository.save(booking);
    }

    @Transactional
    public void delete(String id) {
        if (!bookingRepository.existsById(id)) {
            throw new RuntimeException("Booking not found: " + id);
        }
        bookingRepository.deleteById(id);
    }
}
