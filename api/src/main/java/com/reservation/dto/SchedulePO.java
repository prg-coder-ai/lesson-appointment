package com.reservation.entity;

import lombok.Data;
import java.time.LocalDateTime;
//PO（存库，UTC 时间）
@Data
public class SchedulePO {
    private String id;
    private String courseId;
    private LocalDateTime scheduleUtc;  // 存 UTC
    private String timeZone;            // 记录用户时区
}