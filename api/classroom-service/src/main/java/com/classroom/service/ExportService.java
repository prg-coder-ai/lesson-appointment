package com.classroom.service;

import com.classroom.mapper.ReportMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 运营数据导出（F8-04）：出勤明细 / 录制清单。
 *
 * <p>直接流式写 CSV 而不是先落对象存储再给链接：导出是运营的自助动作，
 * 几十万行也就几十 MB，同步流出去最快；真要异步大导出再走对象存储那套（已具备分片能力）。
 *
 * <p><b>UTF-8 BOM 必须写</b>：不写的话 Excel 打开中文全是乱码，
 * 运营会认为「导出的表是坏的」。
 */
@Slf4j
@Service
public class ExportService {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ReportMapper reportMapper;

    public ExportService(ReportMapper reportMapper) {
        this.reportMapper = reportMapper;
    }

    /**
     * @param type attendance | recordings
     */
    public void writeCsv(String type, LocalDateTime from, LocalDateTime to, Long tenantId, OutputStream out) {
        try {
            out.write(0xEF);
            out.write(0xBB);
            out.write(0xBF);
            Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
            if ("attendance".equalsIgnoreCase(type)) {
                writeAttendance(w, from, to, tenantId);
            } else if ("recordings".equalsIgnoreCase(type)) {
                writeRecordings(w, from, to);
            } else {
                throw new IllegalArgumentException("不支持的导出类型: " + type + "（仅 attendance/recordings）");
            }
            w.flush();
            log.info("导出完成: type={}, {} ~ {}, tenantId={}", type, from, to, tenantId);
        } catch (IOException e) {
            throw new UncheckedIOException("导出失败", e);
        }
    }

    private void writeAttendance(Writer w, LocalDateTime from, LocalDateTime to, Long tenantId) throws IOException {
        writeRow(w, "课次ID", "课程", "教师", "上课时间", "课堂状态",
                "学员ID", "出勤状态", "签到时间", "离场时间", "有效时长(分钟)", "迟到", "补签", "补签原因", "补签人");
        List<Map<String, Object>> rows = reportMapper.selectAttendanceRows(from, to, tenantId);
        for (Map<String, Object> r : rows) {
            writeRow(w,
                    str(r.get("scheduleId")), str(r.get("courseName")), str(r.get("teacherName")),
                    ts(r.get("startTime")), str(r.get("status")),
                    str(r.get("userId")), str(r.get("attendanceStatus")),
                    ts(r.get("checkInAt")), ts(r.get("checkOutAt")),
                    str(r.get("effectiveMinutes")), boolCn(r.get("late")),
                    boolCn(r.get("manualAdjust")), str(r.get("adjustReason")), str(r.get("adjustBy")));
        }
        log.info("导出出勤明细 {} 行", rows.size());
    }

    private void writeRecordings(Writer w, LocalDateTime from, LocalDateTime to) throws IOException {
        writeRow(w, "录制ID", "课次ID", "课程", "开始时间", "结束时间", "状态", "保留天数", "到期时间", "对象Key");
        List<Map<String, Object>> rows = reportMapper.selectRecordingRows(from, to);
        for (Map<String, Object> r : rows) {
            writeRow(w,
                    str(r.get("recordingId")), str(r.get("scheduleId")), str(r.get("courseName")),
                    ts(r.get("startTime")), ts(r.get("endTime")), str(r.get("status")),
                    str(r.get("retentionDays")), ts(r.get("expireAt")), str(r.get("ossKey")));
        }
        log.info("导出录制清单 {} 行", rows.size());
    }

    private void writeRow(Writer w, String... cells) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(escape(cells[i]));
        }
        sb.append("\r\n");
        w.write(sb.toString());
    }

    /** CSV 转义：含逗号/引号/换行时整体加引号，内部引号双写 */
    private String escape(String s) {
        if (s == null) return "";
        boolean needQuote = s.indexOf(',') >= 0 || s.indexOf('"') >= 0
                || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0;
        if (!needQuote) return s;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private String ts(Object o) {
        if (o == null) return "";
        if (o instanceof LocalDateTime ldt) return ldt.format(TS);
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().format(TS);
        return String.valueOf(o);
    }

    private String boolCn(Object o) {
        if (o == null) return "否";
        if (o instanceof Boolean b) return b ? "是" : "否";
        if (o instanceof Number n) return n.intValue() != 0 ? "是" : "否";
        return String.valueOf(o);
    }
}
