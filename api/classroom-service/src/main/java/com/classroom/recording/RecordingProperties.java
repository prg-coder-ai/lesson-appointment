package com.classroom.recording;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 录制配置（{@code classroom.recording.*}）。
 */
@Data
@Component
@ConfigurationProperties(prefix = "classroom.recording")
public class RecordingProperties {

    /**
     * client（默认，教师端本地录制后上传）| cloud（媒体服务器侧云录制）。
     *
     * <p>{@code cloud} 需要厂商云录制 REST 与回调验签，本仓库尚未内置任何厂商实现；
     * 配了 cloud 但没有实现时，{@link RecordingBackendRegistry} 会明确降级为 client 并打 WARN，
     * 而不是让「下课了却找不到录制文件」成为线上谜案。
     */
    private String mode = "client";

    /** 录制保留天数（F6-05：90 天） */
    private int retentionDays = 90;

    /** 单次录制上传上限（字节），默认 2GB —— 一节 90 分钟的 720p 约 400~800MB */
    private long maxUploadBytes = 2L * 1024 * 1024 * 1024;
}
