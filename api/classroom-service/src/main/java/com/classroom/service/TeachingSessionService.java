package com.classroom.service;

import com.classroom.entity.SessionRecord;
import com.classroom.mapper.SessionRecordMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 教学环节事件流水。
 */
@Slf4j
@Service
public class TeachingSessionService {

    private final SessionRecordMapper sessionRecordMapper;
    private final ObjectMapper objectMapper;

    public TeachingSessionService(SessionRecordMapper sessionRecordMapper, ObjectMapper objectMapper) {
        this.sessionRecordMapper = sessionRecordMapper;
        this.objectMapper = objectMapper;
    }

    public void appendEvent(String scheduleId, String eventType, Object data) {
        SessionRecord record = sessionRecordMapper.selectById(scheduleId);
        if (record == null) {
            record = new SessionRecord();
            record.setScheduleId(scheduleId);
            record.setEventLog("[]");
            sessionRecordMapper.insert(record);
        }
        try {
            List<Object> events = objectMapper.readValue(record.getEventLog() == null ? "[]" : record.getEventLog(), List.class);
            events.add(java.util.Map.of("type", eventType, "ts", System.currentTimeMillis(), "data", data));
            record.setEventLog(objectMapper.writeValueAsString(events));
            sessionRecordMapper.updateById(record);
        } catch (JsonProcessingException e) {
            log.error("追加教学事件失败: scheduleId={}", scheduleId, e);
        }
    }

    public SessionRecord getRecord(String scheduleId) {
        return sessionRecordMapper.selectById(scheduleId);
    }

    public void saveWhiteboardSnapshot(String scheduleId, String snapshot) {
        SessionRecord record = sessionRecordMapper.selectById(scheduleId);
        if (record == null) {
            record = new SessionRecord();
            record.setScheduleId(scheduleId);
            record.setWhiteboardSnapshot(snapshot);
            sessionRecordMapper.insert(record);
        } else {
            record.setWhiteboardSnapshot(snapshot);
            sessionRecordMapper.updateById(record);
        }
    }
}