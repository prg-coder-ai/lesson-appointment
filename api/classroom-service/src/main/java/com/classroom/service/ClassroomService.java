package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.common.ErrorCodes;
import com.classroom.entity.Classroom;
import com.classroom.exception.ClassroomBizException;
import com.classroom.mapper.ClassroomMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 课堂生命周期管理（状态机）。
 * 状态流转：SCHEDULED → READY → LIVE → CLOSED / CANCELLED
 *
 * <p>「下课」不只是改状态：{@link #endClass} 会委托
 * {@link ClassroomClosingService} 做出勤收尾与课时回流——收尾链路挂在这里，
 * 自动下课（定时器）与教师手动下课走的是同一个入口，不会出现两条口径。
 */
@Slf4j
@Service
public class ClassroomService {

    private final ClassroomMapper classroomMapper;
    private final ClassroomClosingService closingService;
    private final MediaService mediaService;

    public ClassroomService(ClassroomMapper classroomMapper,
                            ClassroomClosingService closingService,
                            MediaService mediaService) {
        this.classroomMapper = classroomMapper;
        this.closingService = closingService;
        this.mediaService = mediaService;
    }

    public Classroom getById(String scheduleId) {
        Classroom c = classroomMapper.selectById(scheduleId);
        if (c == null) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_NOT_FOUND, "课堂不存在：" + scheduleId);
        }
        return c;
    }

    public void create(Classroom classroom) {
        classroomMapper.insert(classroom);
        log.info("课堂创建: scheduleId={}, courseId={}", classroom.getScheduleId(), classroom.getCourseId());
    }

    public void update(Classroom classroom) {
        classroomMapper.updateById(classroom);
        log.info("课堂更新: scheduleId={}, version={}", classroom.getScheduleId(), classroom.getVersion());
    }

    public void cancel(String scheduleId) {
        Classroom c = getById(scheduleId);
        if ("LIVE".equals(c.getStatus())) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_STATUS_CONFLICT,
                    "直播中的课堂不可取消");
        }
        transitionStatus(scheduleId, c.getStatus(), "CANCELLED");
        log.info("课堂取消: scheduleId={}", scheduleId);
    }

    public void transitionStatus(String scheduleId, String fromStatus, String toStatus) {
        int affected = classroomMapper.updateStatus(scheduleId, fromStatus, toStatus);
        if (affected == 0) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_STATUS_CONFLICT,
                    "状态冲突：当前状态非 " + fromStatus);
        }
        log.info("课堂状态流转: {} {} → {}", scheduleId, fromStatus, toStatus);
    }

    /**
     * 就绪提醒扫描调用：把仍停留在 SCHEDULED 的课堂翻成 READY（学生可进入、自动开课可接管）。
     *
     * <p>非 SCHEDULED（已被人工/自动开课动过的）返回 {@code false} 不重复翻、不报错，
     * 让扫描器每轮都能幂等重跑；仅在真正翻成功时返回 {@code true}（扫描器据此决定要不要发提醒）。
     */
    public boolean markReady(String scheduleId) {
        Classroom c = classroomMapper.selectById(scheduleId);
        if (c == null || !"SCHEDULED".equals(c.getStatus())) {
            return false;
        }
        int affected = classroomMapper.updateStatus(scheduleId, "SCHEDULED", "READY");
        if (affected > 0) {
            log.info("课堂就绪: scheduleId={}", scheduleId);
            return true;
        }
        return false;
    }

    /** 就绪提醒扫描：SCHEDULED 且上课时间落在「现在 ~ 现在+minutes」窗口内的课堂 */
    public List<Classroom> findReadyToRemind(int minutes) {
        return classroomMapper.listReadyToRemind(minutes);
    }

    /** 自动开课扫描：SCHEDULED/READY、已到开课时间、且未过结束时间的课堂 */
    public List<Classroom> findDueToStart() {
        return classroomMapper.listDueToStart();
    }

    /** 自动下课扫描：仍 LIVE、且计划结束时间已过去 grace 分钟的课堂 */
    public List<Classroom> findOverdueLive(int graceMinutes) {
        return classroomMapper.listOverdueLive(graceMinutes);
    }

    public void startClass(String scheduleId) {
        Classroom c = getById(scheduleId);
        if (!"READY".equals(c.getStatus()) && !"SCHEDULED".equals(c.getStatus())) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_STATUS_CONFLICT,
                    "当前状态不可开课：" + c.getStatus());
        }
        transitionStatus(scheduleId, c.getStatus(), "LIVE");
        Classroom update = new Classroom();
        update.setScheduleId(scheduleId);
        update.setActualStart(LocalDateTime.now());
        classroomMapper.updateById(update);
        // 媒体房间随开课就绪：SFU 下这是真正建房，mesh 下只是把房间号算出来给前端。
        // 失败不影响开课（课堂能进、只是走降级链路），故只记日志。
        try {
            mediaService.createRoom(scheduleId);
        } catch (Exception e) {
            log.error("开课时媒体房间创建失败（不影响开课）: scheduleId={}", scheduleId, e);
        }
    }

    public void endClass(String scheduleId) {
        Classroom c = getById(scheduleId);
        if (!"LIVE".equals(c.getStatus())) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_STATUS_CONFLICT,
                    "当前状态不可下课：" + c.getStatus());
        }
        LocalDateTime closeAt = LocalDateTime.now();
        transitionStatus(scheduleId, c.getStatus(), "CLOSED");
        Classroom update = new Classroom();
        update.setScheduleId(scheduleId);
        update.setActualEnd(closeAt);
        classroomMapper.updateById(update);
        // 先释放媒体房间再收尾：房间资源（SFU 扇出、云录制）是按时间计费的，
        // 不能等出勤收尾那串 DB 操作跑完才放。
        mediaService.destroyRoom(scheduleId);
        // 出勤收尾 + 课时回流：失败只记 ERROR 不回滚（状态已 CLOSED、人已离开），可人工补跑
        closingService.closeAfterEnd(scheduleId, closeAt);
    }

    public List<Classroom> listByStatus(String status, Long tenantId) {
        LambdaQueryWrapper<Classroom> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Classroom::getStatus, status);
        if (tenantId != null && tenantId >= 0) {
            wrapper.eq(Classroom::getTenantId, tenantId);
        }
        wrapper.orderByAsc(Classroom::getStartTime);
        return classroomMapper.selectList(wrapper);
    }
}