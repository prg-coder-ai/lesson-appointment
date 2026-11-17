package com.classroom.service;

import com.classroom.entity.SessionRecord;
import com.classroom.mapper.SessionRecordMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

    /**
     * 取该课次某类事件的最后一次 data（讲稿「当前展示哪一份」定位用）。
     * 无记录 / 解析失败均返回 null，调用方回退到默认口径，不让脏事件影响主流程。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> lastEventData(String scheduleId, String eventType) {
        SessionRecord record = getRecord(scheduleId);
        if (record == null || record.getEventLog() == null || record.getEventLog().isBlank()) return null;
        try {
            List<Map<String, Object>> events = objectMapper.readValue(record.getEventLog(),
                    new TypeReference<List<Map<String, Object>>>() {});
            for (int i = events.size() - 1; i >= 0; i--) {
                Map<String, Object> e = events.get(i);
                if (eventType.equals(e.get("type"))) {
                    Object data = e.get("data");
                    return (data instanceof Map) ? (Map<String, Object>) data : null;
                }
            }
        } catch (Exception e) {
            log.warn("解析教学事件失败: scheduleId={}, type={}", scheduleId, eventType, e);
        }
        return null;
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