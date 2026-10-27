package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.Recording;
import com.classroom.service.RecordingService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：录制回放（F6）。
 */
@RestController
@RequestMapping("/api/v1/recordings")
public class RecordingController {

    private final RecordingService recordingService;

    public RecordingController(RecordingService recordingService) {
        this.recordingService = recordingService;
    }

    @GetMapping("/{scheduleId}")
    public Result<List<Recording>> list(@PathVariable String scheduleId) {
        return Result.ok(recordingService.listBySchedule(scheduleId));
    }

    @GetMapping("/{scheduleId}/playback")
    public Result<String> playback(@PathVariable String scheduleId) {
        String url = recordingService.getPlaybackUrl(scheduleId);
        if (url == null) {
            return Result.fail(409, "录制尚未就绪");
        }
        return Result.ok(url);
    }
}