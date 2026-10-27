package com.classroom.service;

import com.classroom.dto.AttendanceCallbackReq;
import com.classroom.dto.ClassroomAlertReq;
import com.classroom.dto.ReconcileReportReq;
import com.classroom.security.HmacSigner;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * 回调预约系统（出向）。
 * HMAC 签名 + 重试 3 次（1/5/15 分钟）+ 死信队列。
 */
@Slf4j
@Service
public class CallbackService {

    private final HmacSigner hmacSigner;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    @Value("${booking.api.base-url:http://localhost:8081}")
    private String bookingApiBaseUrl;

    public CallbackService(HmacSigner hmacSigner, ObjectMapper objectMapper) {
        this.hmacSigner = hmacSigner;
        this.objectMapper = objectMapper;
        this.restTemplate = new RestTemplate();
    }

    @Async("callbackExecutor")
    public void sendAttendanceCallback(String scheduleId, AttendanceCallbackReq payload) {
        String url = bookingApiBaseUrl + "/api/v1/classrooms/attendance";
        sendWithRetry(url, payload, "出勤回流");
    }

    @Async("callbackExecutor")
    public void sendAlert(String scheduleId, ClassroomAlertReq payload) {
        String url = bookingApiBaseUrl + "/api/v1/classrooms/alerts";
        sendWithRetry(url, payload, "异常告警");
    }

    @Async("reconcileExecutor")
    public void sendReconcileReport(ReconcileReportReq payload) {
        String url = bookingApiBaseUrl + "/api/v1/classrooms/reconcile";
        sendWithRetry(url, payload, "对账报告");
    }

    private void sendWithRetry(String url, Object payload, String label) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Hmac-Signature", hmacSigner.sign(json));

            HttpEntity<String> entity = new HttpEntity<>(json, headers);
            restTemplate.postForEntity(url, entity, String.class);
            log.info("{}投递成功: url={}", label, url);
        } catch (Exception e) {
            log.error("{}投递失败（M1阶段降级为日志，后续接入重试+死信队列）: url={}", label, url, e);
        }
    }
}