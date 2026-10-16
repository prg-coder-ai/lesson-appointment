package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.dto.TeacherAvailableTimeDTO;
import com.reservation.dto.TeacherCertificateDTO;
import com.reservation.dto.TeacherProfessionalDTO;
import com.reservation.entity.TeacherAvailableTime;
import com.reservation.entity.TeacherCertificate;
import com.reservation.entity.TeacherProfessional;
import com.reservation.entity.User;
import com.reservation.mapper.TeacherAvailableTimeMapper;
import com.reservation.mapper.TeacherCertificateMapper;
import com.reservation.mapper.TeacherProfessionalMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.query.TeacherProfessionalQueryPage;
import com.reservation.vo.TeacherProfessionalDetailVO;
import com.reservation.vo.TeacherProfessionalListVO;
import com.reservation.utils.CryptoUtil;
import com.reservation.utils.TermMsg;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/**
 * 教师职业信息服务
 * 对应 notes §2.2 方法签名
 * 涵盖：添加 / 删除 / 修改 / 查询 / 分页查询
 * 写操作均包 @Transactional，主表 + 2 张子表任一步失败整体回滚
 */
@Service
@Slf4j
public class TeacherProfessionalService {

    @Autowired
    private TeacherProfessionalMapper tpMapper;
    @Autowired
    private TeacherCertificateMapper certMapper;
    @Autowired
    private TeacherAvailableTimeMapper timeMapper;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private CryptoUtil cryptoUtil;

    // ================================================================
    // 1. 添加教师职业信息（级联：主表 + 证书列表 + 时间列表）
    // ================================================================
    @Transactional
    public Result<Object> addTeacherProfessionalInfo(TeacherProfessionalDTO dto) {
        if (dto == null || dto.getTeacherId() == null || dto.getTeacherId().trim().isEmpty()) {
            return Result.fail(400, TermMsg.t("{teacher}ID不能为空"));
        }
        // 校验教师存在且 role=teacher
        User teacher = userMapper.selectById(dto.getTeacherId());
        if (teacher == null) {
            return Result.fail(404, TermMsg.t("{teacher}用户不存在"));
        }
        if (!"teacher".equals(teacher.getRole())) {
            return Result.fail(400, TermMsg.t("该用户不是{teacher}，无法添加职业信息"));
        }
        // 校验是否已有职业信息（1:1 唯一约束）
        TeacherProfessional exist = tpMapper.selectOne(
                new QueryWrapper<TeacherProfessional>().eq("teacher_id", dto.getTeacherId()));
        if (exist != null) {
            return Result.fail(400, TermMsg.t("该{teacher}已存在职业信息，请使用修改功能"));
        }

        // 1.1 插入主表
        TeacherProfessional tp = buildEntityFromDTO(dto);
        tp.setTeacherProfessionalId(UUID.randomUUID().toString());
        if (tp.getStatus() == null || tp.getStatus().isEmpty()) {
            tp.setStatus("active");
        }
        tpMapper.insert(tp);

        // 1.2 级联插入证书
        saveCertificates(dto.getTeacherId(), dto.getCertificates());

        // 1.3 级联插入可预约时间段
        saveAvailableTimes(dto.getTeacherId(), dto.getAvailableTimes());

        Map<String, String> data = new HashMap<>();
        data.put("teacherProfessionalId", tp.getTeacherProfessionalId());
        return Result.success(data, "添加成功");
    }

    // ================================================================
    // 2. 删除教师职业信息（按 teacherProfessionalId，级联删证书+时段）
    //    注：FK ON DELETE CASCADE 只在删 user 时触发；按 teacher_professional_id
    //    删主表不会级联删子表，所以这里手动先删子表再删主表。
    // ================================================================
    @Transactional
    public Result<Object> deleteTeacherProfessionalInfo(String teacherProfessionalId) {
        if (teacherProfessionalId == null || teacherProfessionalId.trim().isEmpty()) {
            return Result.fail(400, "职业信息ID不能为空");
        }
        TeacherProfessional tp = tpMapper.selectById(teacherProfessionalId);
        if (tp == null) {
            return Result.fail(404, "职业信息不存在");
        }
        String teacherId = tp.getTeacherId();

        // 先删子表（证书 + 时间段）——这就是 teacher_professional 的级联，
        // 由本方法显式完成（规则表登记在 TEACHER_* 场景；此处是它的唯一调用方）
        certMapper.deleteByTeacherId(teacherId);
        timeMapper.deleteByTeacherId(teacherId);
        // 再删主表。cascade: none 子表已在上两行清完，主表无其它下游
        int ret = tpMapper.deleteById(teacherProfessionalId);
        log.debug("[TeacherProfessionalService] delete operation end, id=" + teacherProfessionalId + ", affected rows=" + ret);
        return Result.success(ret, "删除成功");
    }

    // ================================================================
    // 3. 修改教师职业信息（子表=先删后插，避免增量比对繁琐）
    // ================================================================
    @Transactional
    public Result<Object> updateTeacherProfessionalInfo(TeacherProfessionalDTO dto) {
        if (dto == null || dto.getTeacherProfessionalId() == null || dto.getTeacherProfessionalId().trim().isEmpty()) {
            return Result.fail(400, "职业信息ID不能为空");
        }
        TeacherProfessional exist = tpMapper.selectById(dto.getTeacherProfessionalId());
        if (exist == null) {
            return Result.fail(404, "职业信息不存在");
        }
        String teacherId = exist.getTeacherId();

        // 3.1 更新主表（teacherId 不允许改）
        TeacherProfessional tp = buildEntityFromDTO(dto);
        tp.setTeacherProfessionalId(dto.getTeacherProfessionalId());
        tp.setTeacherId(teacherId);  // 保持原教师ID不变
        tpMapper.updateById(tp);

        // 3.2 子表先删后插
        certMapper.deleteByTeacherId(teacherId);
        saveCertificates(teacherId, dto.getCertificates());

        timeMapper.deleteByTeacherId(teacherId);
        saveAvailableTimes(teacherId, dto.getAvailableTimes());

        return Result.success(1, "修改成功");
    }

    // ================================================================
    // 4. 查询单条（按 teacherProfessionalId 或 teacherId 查出主+子明细）
    // ================================================================
    public Result<TeacherProfessionalDetailVO> queryTeacherProfessionalInfo(String teacherProfessionalId, String teacherId) {
        long t0 = System.currentTimeMillis();
        TeacherProfessional tp = null;
        if (teacherProfessionalId != null && !teacherProfessionalId.trim().isEmpty()) {
            tp = tpMapper.selectById(teacherProfessionalId);
        } else if (teacherId != null && !teacherId.trim().isEmpty()) {
            // selectOne 防御：物理上 teacher_professional 有 uk_teacher_id 唯一索引，
            // 但历史脏数据/手工 SQL 可能留下重复行，selectOne 会抛 TooManyResultsException。
            // 用 last("LIMIT 1") 兜底，同时 log.warn 提醒清理脏数据。
            Long cnt = tpMapper.selectCount(
                    new QueryWrapper<TeacherProfessional>().eq("teacher_id", teacherId));
            if (cnt != null && cnt > 1) {
                log.warn("[TeacherProfessional] 教师 {} 存在 {} 条职业信息脏数据，兜底取最新一条，请清理", teacherId, cnt);
            }
            tp = tpMapper.selectOne(
                    new QueryWrapper<TeacherProfessional>().eq("teacher_id", teacherId).last("LIMIT 1"));
        }
        long t1 = System.currentTimeMillis();

        if (tp == null) {
            log.info("[TeacherProfessional] 查询不存在: teacherProfessionalId={}, teacherId={}, 耗时={}ms",
                    teacherProfessionalId, teacherId, t1 - t0);
            return Result.fail(404, "职业信息不存在");
        }

        TeacherProfessionalDetailVO vo = new TeacherProfessionalDetailVO();
        vo.setProfessional(tp);

        List<com.reservation.entity.TeacherCertificate> certs = certMapper.listByTeacherId(tp.getTeacherId());
        long t2 = System.currentTimeMillis();
        List<com.reservation.entity.TeacherAvailableTime> times = timeMapper.listByTeacherId(tp.getTeacherId());
        long t3 = System.currentTimeMillis();

        vo.setCertificates(certs);
        vo.setAvailableTimes(times);

        // 冗余 user 字段（name/phone/email 入库时经 cryptoUtil.encryptWithIndex 加密，
        // 查询必须解密，否则前端看到 AES 密文而非可读字符串；与 UserService.decryptUserFields 一致）
        User teacher = userMapper.selectById(tp.getTeacherId());
        long t4 = System.currentTimeMillis();
        if (teacher != null) {
            try {
                teacher.setName(cryptoUtil.decrypt(teacher.getName()));
                teacher.setPhone(cryptoUtil.decrypt(teacher.getPhone()));
                teacher.setEmail(cryptoUtil.decrypt(teacher.getEmail()));
            } catch (Exception ex) {
                // 解密失败不应整接口挂：某个字段被二次加密或历史空值时，继续返回剩余字段
                log.warn("[TeacherProfessional] teacher {} 字段解密异常：{}", tp.getTeacherId(), ex.getMessage());
            }
            vo.setName(teacher.getName());
            vo.setAccount(teacher.getAccount());
            vo.setPhone(teacher.getPhone());
            vo.setEmail(teacher.getEmail());
            vo.setUserStatus(teacher.getStatus());
        }
        long t5 = System.currentTimeMillis();

        long total = t5 - t0;
        // 总耗时 > 300ms 才打 WARN（正常查询应在 50ms 内），避免刷屏
        if (total > 300) {
            log.warn("[TeacherProfessional] query 慢查询 teacherId={}, 总耗时={}ms | 主表={}ms 证书({})={}ms 时段({})={}ms user={}ms 解密={}ms",
                    tp.getTeacherId(), total,
                    (t1 - t0), certs.size(), (t2 - t1),
                    times.size(), (t3 - t2), (t4 - t3), (t5 - t4));
        } else {
            log.debug("[TeacherProfessional] query teacherId={}, 总耗时={}ms 证书={} 时段={}",
                    tp.getTeacherId(), total, certs.size(), times.size());
        }
        return Result.success(vo, "查询成功");
    }

    // ================================================================
    // 5. 分页查询（联表 user 取 name/account/phone/email）
    // ================================================================
    public Result<PageResult<TeacherProfessionalListVO>> listByPage(TeacherProfessionalQueryPage query) {
        if (query.getPageNum() == null || query.getPageNum() < 1) query.setPageNum(1);
        if (query.getPageSize() == null || query.getPageSize() < 1) query.setPageSize(10);

        List<TeacherProfessionalListVO> rows = tpMapper.listByConditionPage(query);
        int total = tpMapper.selectCountByCondition(query);
        int totalPages = (total + query.getPageSize() - 1) / query.getPageSize();

        PageResult<TeacherProfessionalListVO> page = new PageResult<>(
                rows, (long) total, query.getPageNum(), query.getPageSize(), totalPages);
        return Result.success(page, "查询成功");
    }

    // ================================================================
    // 私有辅助方法
    // ================================================================

    /** DTO → 主表实体（不含 teacherProfessionalId，由调用方设置） */
    private TeacherProfessional buildEntityFromDTO(TeacherProfessionalDTO dto) {
        TeacherProfessional tp = new TeacherProfessional();
        tp.setTeacherId(dto.getTeacherId());
        tp.setSubject(dto.getSubject());
        tp.setPersonalPhotoUrl(dto.getPersonalPhotoUrl());
        tp.setPersonalPhotoBase64(dto.getPersonalPhotoBase64());
        tp.setBioText(dto.getBioText());
        tp.setBioUrl(dto.getBioUrl());
        tp.setAvailabilityRule(dto.getAvailabilityRule());
        tp.setMinBookingHours(dto.getMinBookingHours() == null ? 4 : dto.getMinBookingHours());
        tp.setWeeklyAvailableHours(dto.getWeeklyAvailableHours() == null ? 20 : dto.getWeeklyAvailableHours());
        tp.setCertificateText(dto.getCertificateText());
        tp.setStatus(dto.getStatus());
        return tp;
    }

    /** 批量插入证书（子表） */
    private void saveCertificates(String teacherId, List<TeacherCertificateDTO> certs) {
        if (certs == null || certs.isEmpty()) return;

        // 先查旧证书的 certId → certBase64 映射，用于 merge 未上传新图时保留原图
        // （Entity 的 certBase64 已加 @TableField(select=false)，BaseMapper.selectById 拿不到，
        //  这里直接写显式 SQL 只查这一列）。
        java.util.Map<String, String> oldBase64Map = new java.util.HashMap<>();
        try {
            List<com.reservation.entity.TeacherCertificate> oldCerts =
                    certMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.reservation.entity.TeacherCertificate>()
                            .eq("teacher_id", teacherId)
                            .select("certificate_id", "cert_base64"));
            if (oldCerts != null) {
                for (com.reservation.entity.TeacherCertificate oc : oldCerts) {
                    if (oc.getCertificateId() != null && oc.getCertBase64() != null && !oc.getCertBase64().isEmpty()) {
                        oldBase64Map.put(oc.getCertificateId(), oc.getCertBase64());
                    }
                }
            }
        } catch (Exception ignore) { /* 查询失败降级：不 merge，允许 base64 置空 */ }

        int sortNo = 0;
        for (TeacherCertificateDTO c : certs) {
            TeacherCertificate cert = new TeacherCertificate();
            cert.setCertificateId(UUID.randomUUID().toString());
            cert.setTeacherId(teacherId);
            cert.setCertName(c.getCertName());
            cert.setCertUrl(c.getCertUrl());
            // merge 逻辑：前端没上传新图（certBase64 为 null/空串），但传了 certificateId（表示编辑已有证书），
            // 用旧 base64 回填；否则用新值。
            String incoming = c.getCertBase64();
            if ((incoming == null || incoming.isEmpty()) && c.getCertificateId() != null) {
                incoming = oldBase64Map.get(c.getCertificateId());
            }
            cert.setCertBase64(incoming);
            cert.setSortNo(c.getSortNo() == null ? sortNo : c.getSortNo());
            sortNo++;
            certMapper.insert(cert);
        }
    }

    /** 批量插入可预约时间段（子表） */
    private void saveAvailableTimes(String teacherId, List<TeacherAvailableTimeDTO> times) {
        if (times == null || times.isEmpty()) return;
        for (TeacherAvailableTimeDTO t : times) {
            TeacherAvailableTime tat = new TeacherAvailableTime();
            tat.setAvailableId(UUID.randomUUID().toString());
            tat.setTeacherId(teacherId);
            tat.setRepeatType(t.getRepeatType() == null ? "none" : t.getRepeatType());
            tat.setRepeatInterval(t.getRepeatInterval() == null ? 1 : t.getRepeatInterval());
            tat.setRepeatDays(t.getRepeatDays());
            tat.setStartDate(t.getStartDate());
            tat.setEndDate(t.getEndDate());
            tat.setStartTime(t.getStartTime());
            tat.setEndTime(t.getEndTime());
            tat.setStatus(t.getStatus() == null ? "active" : t.getStatus());
            tat.setScheduleId(t.getScheduleId() == null ? "" : t.getScheduleId());
            tat.setOptioned(t.getOptioned() == null ? 0 : t.getOptioned());
            timeMapper.insert(tat);
        }
    }
}
