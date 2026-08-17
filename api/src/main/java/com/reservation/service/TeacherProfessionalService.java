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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 教师职业信息服务
 * 对应 notes §2.2 方法签名
 * 涵盖：添加 / 删除 / 修改 / 查询 / 分页查询
 * 写操作均包 @Transactional，主表 + 2 张子表任一步失败整体回滚
 */
@Service
public class TeacherProfessionalService {

    @Autowired
    private TeacherProfessionalMapper tpMapper;
    @Autowired
    private TeacherCertificateMapper certMapper;
    @Autowired
    private TeacherAvailableTimeMapper timeMapper;
    @Autowired
    private UserMapper userMapper;

    // ================================================================
    // 1. 添加教师职业信息（级联：主表 + 证书列表 + 时间列表）
    // ================================================================
    @Transactional
    public Result<Object> addTeacherProfessionalInfo(TeacherProfessionalDTO dto) {
        if (dto == null || dto.getTeacherId() == null || dto.getTeacherId().trim().isEmpty()) {
            return Result.fail(400, "教师ID不能为空");
        }
        // 校验教师存在且 role=teacher
        User teacher = userMapper.selectById(dto.getTeacherId());
        if (teacher == null) {
            return Result.fail(404, "教师用户不存在");
        }
        if (!"teacher".equals(teacher.getRole())) {
            return Result.fail(400, "该用户不是教师，无法添加职业信息");
        }
        // 校验是否已有职业信息（1:1 唯一约束）
        TeacherProfessional exist = tpMapper.selectOne(
                new QueryWrapper<TeacherProfessional>().eq("teacher_id", dto.getTeacherId()));
        if (exist != null) {
            return Result.fail(400, "该教师已存在职业信息，请使用修改功能");
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

        // 先删子表（证书 + 时间段）
        certMapper.deleteByTeacherId(teacherId);
        timeMapper.deleteByTeacherId(teacherId);
        // 再删主表
        int ret = tpMapper.deleteById(teacherProfessionalId);
        System.out.println("[TeacherProfessionalService] delete operation end, id=" + teacherProfessionalId + ", affected rows=" + ret);
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
        TeacherProfessional tp = null;
        if (teacherProfessionalId != null && !teacherProfessionalId.trim().isEmpty()) {
            tp = tpMapper.selectById(teacherProfessionalId);
        } else if (teacherId != null && !teacherId.trim().isEmpty()) {
            tp = tpMapper.selectOne(
                    new QueryWrapper<TeacherProfessional>().eq("teacher_id", teacherId));
        }
        if (tp == null) {
            return Result.fail(404, "职业信息不存在");
        }

        TeacherProfessionalDetailVO vo = new TeacherProfessionalDetailVO();
        vo.setProfessional(tp);
        vo.setCertificates(certMapper.listByTeacherId(tp.getTeacherId()));
        vo.setAvailableTimes(timeMapper.listByTeacherId(tp.getTeacherId()));

        // 冗余 user 字段
        User teacher = userMapper.selectById(tp.getTeacherId());
        if (teacher != null) {
            vo.setName(teacher.getName());
            vo.setAccount(teacher.getAccount());
            vo.setPhone(teacher.getPhone());
            vo.setEmail(teacher.getEmail());
            vo.setUserStatus(teacher.getStatus());
        }
      //  System.out.println("queryTeacherProfessionalInfo: " + vo);
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
        int sortNo = 0;
        for (TeacherCertificateDTO c : certs) {
            TeacherCertificate cert = new TeacherCertificate();
            cert.setCertificateId(UUID.randomUUID().toString());
            cert.setTeacherId(teacherId);
            cert.setCertName(c.getCertName());
            cert.setCertUrl(c.getCertUrl());
            cert.setCertBase64(c.getCertBase64());
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
            tat.setTimeType(t.getTimeType() == null ? "weekly" : t.getTimeType());
            tat.setDayOfWeek(t.getDayOfWeek());
            tat.setSpecificDate(t.getSpecificDate());
            tat.setStartTime(t.getStartTime());
            tat.setEndTime(t.getEndTime());
            tat.setStatus(t.getStatus() == null ? "active" : t.getStatus());
            timeMapper.insert(tat);
        }
    }
}
