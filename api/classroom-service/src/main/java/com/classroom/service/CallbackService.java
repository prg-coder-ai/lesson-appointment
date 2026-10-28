package com.classroom.service;

import com.classroom.dto.AttendanceCallbackReq;
import com.classroom.dto.ClassroomAlertReq;
import com.classroom.dto.ReconcileReportReq;
import com.classroom.security.HmacSigner;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

/**
 * 回调预约系统（出向）：出勤回流 / 异常告警 / 对账报告。
 *
 * <p><b>签名</b>：对「将要发出去的那串 JSON」算 HMAC-SHA256，放进 {@code X-Hmac-Signature}。
 * 序列化只做一次、签名与发送复用同一个字符串——如果发送时再序列化一次，
 * 接收方按原文验签就会因字段顺序/格式差异恒失败。
 *
 * <p><b>重试</b>：首次失败后按 1 / 5 / 15 分钟退避重试，共 3 次（需求 8.3 / F7-02）。
 * 重试跑在独立调度线程上，不占用 {@code callbackExecutor} 的业务线程，也不阻塞课堂收尾。
 *
 * <p><b>死信</b>：重试耗尽后打 {@code [DLQ]} 前缀的 ERROR 日志（含完整 URL 与报文），
 * 供日志告警与人工重放检索。<b>尚未落库</b>——真正的死信表 + 运营重放按钮属 F8-05
 * 契约控制台范围，待其落地时把日志改成写表即可（此处已是唯一出口，替换点集中）。
 *
 * <p><b>局限（已知，勿误解为已解决）</b>：重试队列在内存里，进程重启即丢。
 * 出勤回流本身是幂等 upsert（booking 侧按 scheduleId+userId 覆盖），
 * 因此「丢失」的后果是「这堂课不回流」，需靠日终对账（F7-05）兜底补偿。
 */
@Slf4j
@Service
public class CallbackService {

    /** 退避重试间隔（分钟），长度即重试次数 */
    private static final int[] BACKOFF_MINUTES = {1, 5, 15};

    /** 永久失败码：重试只会重复被拒，直接进死信 */
    private static final Set<Integer> PERMANENT_FAIL_CODES = Set.of(400, 401, 403, 404);

    private final HmacSigner hmacSigner;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final TaskScheduler retryScheduler;

    @Value("${booking.api.base-url:http://localhost:8081}")
    private String bookingApiBaseUrl;

    public CallbackService(HmacSigner hmacSigner,
                           ObjectMapper objectMapper,
                           @Qualifier("callbackRetryScheduler") TaskScheduler retryScheduler) {
        this.hmacSigner = hmacSigner;
        this.objectMapper = objectMapper;
        this.retryScheduler = retryScheduler;
        // 连接/读取超时必设：默认无超时会挂住线程，回调线程池只有 8 个，很容易被拖死
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(8000);
        this.restTemplate = new RestTemplate(factory);
    }

    @Async("callbackExecutor")
    public void sendAttendanceCallback(String scheduleId, AttendanceCallbackReq payload) {
        String url = bookingApiBaseUrl + "/api/v1/classroom-callback/attendance";
        sendWithRetry(url, payload, "出勤回流");
    }

    @Async("callbackExecutor")
    public void sendAlert(String scheduleId, ClassroomAlertReq payload) {
        String url = bookingApiBaseUrl + "/api/v1/classroom-callback/alerts";
        sendWithRetry(url, payload, "异常告警");
    }

    @Async("reconcileExecutor")
    public void sendReconcileReport(ReconcileReportReq payload) {
        String url = bookingApiBaseUrl + "/api/v1/classroom-callback/reconcile";
        sendWithRetry(url, payload, "对账报告");
    }

    private void sendWithRetry(String url, Object payload, String label) {
        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            // 序列化失败重试也没用，直接按死信留痕
            log.error("[DLQ] {}报文序列化失败，无法投递: url={}", label, url, e);
            return;
        }
        attempt(url, json, label, 0);
    }

    /**
     * 单次投递尝试。
     *
     * <p><b>必须检查响应体里的 code</b>：预约系统沿用「HTTP 200 + Result.code 表达业务结果」的
     * 契约（401/403 也不改 HTTP 状态，见其 ResultHttpStatusAdvice），因此验签失败时
     * HTTP 仍是 200。只看 HTTP 状态会把「签名被拒」记成「投递成功」——回流出问题却全绿。
     *
     * <p>400/401/403/404 视为**永久失败**：重试只会重复被拒（签名错、报文字段错、排期不存在），
     * 直接进死信；其余（含 500 / 网络异常）按 1/5/15 分钟退避重试。
     *
     * @param retryIndex 已完成的重试次数（首次投递为 0）
     */
    private void attempt(String url, String json, String label, int retryIndex) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Hmac-Signature", hmacSigner.sign(json));
            ResponseEntity<String> resp = restTemplate.postForEntity(url, new HttpEntity<>(json, headers), String.class);

            Integer code = extractCode(resp.getBody());
            if (code != null && PERMANENT_FAIL_CODES.contains(code)) {
                log.error("[DLQ] {}被对端拒绝(code={})，重试无意义，直接转死信: url={}, 响应={}",
                        label, code, url, resp.getBody());
                return;
            }
            if (code != null && code != 200) {
                throw new IllegalStateException("对端返回业务失败 code=" + code + ", body=" + resp.getBody());
            }
            if (retryIndex == 0) {
                log.info("{}投递成功: url={}", label, url);
            } else {
                log.info("{}第 {} 次重试投递成功: url={}", label, retryIndex, url);
            }
        } catch (Exception e) {
            if (retryIndex >= BACKOFF_MINUTES.length) {
                log.error("[DLQ] {}重试 {} 次仍失败，转死信待人工重放: url={}, 报文={}",
                        label, BACKOFF_MINUTES.length, url, json, e);
                return;
            }
            int delayMinutes = BACKOFF_MINUTES[retryIndex];
            int nextRetry = retryIndex + 1;
            log.warn("{}投递失败，{} 分钟后第 {} 次重试: url={}, err={}",
                    label, delayMinutes, nextRetry, url, e.getMessage());
            retryScheduler.schedule(
                    () -> attempt(url, json, label, nextRetry),
                    Instant.now().plusSeconds(delayMinutes * 60L));
        }
    }

    /**
     * 从响应体里取 {@code "code"}，取不到返回 null（视为成功，避免因对端改了响应结构就永远重试）。
     */
    private Integer extractCode(String body) {
        if (body == null || body.isEmpty()) return null;
        try {
            Map<?, ?> map = objectMapper.readValue(body, Map.class);
            Object code = map.get("code");
            if (code instanceof Number n) return n.intValue();
            if (code instanceof String s) return Integer.valueOf(s);
            return null;
        } catch (Exception e) {
            log.debug("回调响应非 JSON，按成功处理: body={}", body);
            return null;
        }
    }
}
