package com.reservation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.common.ErrorCodes;
import com.reservation.exception.ConflictException;
import com.reservation.vo.RefundHintVO;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 时间态方案 B1 的两条契约钉子（2026-10-11）：
 *
 * <ol>
 *   <li>退费档位快照 JSON 可无损回环——申请提交时写入、审核时读出的档位必须一致；</li>
 *   <li>{@code ConflictException} 在 ErrorCodes 映射为 409（与 GlobalExceptionHandler 对齐，
 *       守卫④要求两表不分叉）。</li>
 * </ol>
 */
class RefundSnapshotJsonTest {

    @Test
    void snapshotJsonRoundTripPreservesVerdict() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        RefundHintVO hint = new RefundHintVO();
        hint.setLevel("free");
        hint.setLevelText("免责（全额退）");
        hint.setRefundPercent(100);
        hint.setMinutesAhead(4320L);
        hint.setAheadText("3 天");
        hint.setLessonTime("2026-10-15 10:00");
        hint.setAppointmentId(42);
        hint.setBookingId("bk-001");
        hint.setMessage("依退改规则：可免责退改（退 100%）。");

        RefundRuleService.RefundSnapshot snap = new RefundRuleService.RefundSnapshot();
        snap.snapshotAt = "2026-10-12 10:00:00";
        snap.hint = hint;

        String json = mapper.writeValueAsString(snap);
        RefundRuleService.RefundSnapshot back =
                mapper.readValue(json, RefundRuleService.RefundSnapshot.class);

        assertEquals("2026-10-12 10:00:00", back.snapshotAt);
        assertEquals("free", back.hint.getLevel());
        assertEquals(100, back.hint.getRefundPercent());
        assertEquals(4320L, back.hint.getMinutesAhead());
        assertEquals(42, back.hint.getAppointmentId());
        assertEquals("bk-001", back.hint.getBookingId());
    }

    @Test
    void conflictExceptionMapsTo409() {
        assertEquals(409, ErrorCodes.from(new ConflictException("课程已开始，无法取消预订")));
    }
}
