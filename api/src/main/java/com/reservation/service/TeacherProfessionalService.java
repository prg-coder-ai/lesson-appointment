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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
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

    /** 上传文件根目录（磁盘绝对路径）。默认落在用户主目录下的 teacher-uploads。 */
    @Value("${teacher.upload.path:${user.home}/teacher-uploads}")
    private String uploadBaseDir;

    /** 单张上传图片业务上限（字节，默认 5MB）。容器上限放宽到 20MB，超限由本方法返回 413 友好提示。 */
    @Value("${teacher.upload.max-size:5242880}")
    private long uploadMaxBytes;

    /**
     * 已上传图片的对外访问 URL 前缀（与 Controller 的 GET /file/** 伺服端点对应）。
     * 返回给前端的 fileUrl = 本前缀 + "/" + ymd + "/" + uuid.ext
     */
    private static final String FILE_URL_PREFIX = "/api/v1/teacher/professional/file";

    /** 允许上传的图片扩展名白名单（防任意文件上传） */
    private static final List<String> ALLOWED_EXT = List.of("jpg", "jpeg", "png", "gif", "webp");

    /**
     * 单张图片 base64 解码后体积上限（5MB）。
     * 说明：DB 列 personal_photo_base64 / cert_base64 是 mediumtext（16MB），列本身能装下；
     * 真正卡点有两个 —— ① MySQL max_allowed_packet（若 < base64 长度，INSERT 直接失败、
     * 表现为"保存无报错但图片丢了或不存储"）；② 单次请求体过大。
     * 前端 compressImage 已把输出压到 300/500KB，正常不会触顶；这里是服务端兜底，
     * 超过即明确拒绝（413），避免把超限数据写进 DB 后引发难以排查的"不存储"问题。
     */
    private static final long MAX_IMAGE_BASE64_BYTES = 5L * 1024 * 1024;

    /** 校验 base64 图片解码后体积；合规返回 null，超限返回中文错误（不抛异常） */
    private String checkImageBase64(String b64, String fieldLabel) {
        if (b64 == null || b64.isEmpty()) return null;
        int comma = b64.indexOf(',');
        String pure = comma >= 0 ? b64.substring(comma + 1) : b64;
        long decoded = (long) (pure.length() * 3) / 4; // base64 解码后字节 ≈ 长度 * 3 / 4
        if (decoded > MAX_IMAGE_BASE64_BYTES) {
            return fieldLabel + "图片过大（约 " + (decoded / 1024 / 1024)
                    + "MB），请压缩后上传，或改用图片URL（上限 5MB）";
        }
        return null;
    }

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
        // 图片体积校验（base64 上限 5MB），超限直接拒绝，避免写入后引发"不存储/不显示"
        String photoErr = checkImageBase64(dto.getPersonalPhotoBase64(), TermMsg.t("个人照片"));
        if (photoErr != null) return Result.fail(413, photoErr);
        if (dto.getCertificates() != null) {
            for (TeacherCertificateDTO c : dto.getCertificates()) {
                String certErr = checkImageBase64(c.getCertBase64(), "证书「" + (c.getCertName() == null ? "" : c.getCertName()) + "」");
                if (certErr != null) return Result.fail(413, certErr);
            }
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
        saveCertificates(dto.getTeacherId(), dto.getCertificates(), null);

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

        // 图片体积校验（base64 上限 5MB）
        String photoErr = checkImageBase64(dto.getPersonalPhotoBase64(), "个人照片");
        if (photoErr != null) return Result.fail(413, photoErr);
        if (dto.getCertificates() != null) {
            for (TeacherCertificateDTO c : dto.getCertificates()) {
                String certErr = checkImageBase64(c.getCertBase64(), "证书「" + (c.getCertName() == null ? "" : c.getCertName()) + "」");
                if (certErr != null) return Result.fail(413, certErr);
            }
        }

        // 3.1 更新主表（teacherId 不允许改）
        //     照片字段语义（URL 与 base64 二选一优先，且两者不得"旧 URL + 新 base64"并存导致显示错位）：
        //       · 传了 URL（新或旧）→ URL 为准；若本次未带 base64，则清空旧 base64（避免新旧并存）。
        //       · 仅传 base64（本地压缩兜底上传失败）→ 清空旧 URL，让新 base64 生效。
        //       · 两者皆空 → 保留库里原值（兼容"编辑其它字段不丢图"）。
        //     历史"留空保留旧值"逻辑已收拢进上面的分支，避免编辑时旧 URL 盖住新上传的 base64。
        TeacherProfessional tp = buildEntityFromDTO(dto);
        tp.setTeacherProfessionalId(dto.getTeacherProfessionalId());
        tp.setTeacherId(teacherId);  // 保持原教师ID不变
        String inUrl = dto.getPersonalPhotoUrl();
        String inB64 = dto.getPersonalPhotoBase64();
        boolean hasUrl = inUrl != null && !inUrl.isEmpty();
        boolean hasB64 = inB64 != null && !inB64.isEmpty();
        if (hasUrl) {
            tp.setPersonalPhotoUrl(inUrl);
            tp.setPersonalPhotoBase64(hasB64 ? inB64 : "");
        } else if (hasB64) {
            tp.setPersonalPhotoUrl("");
            tp.setPersonalPhotoBase64(inB64);
        } else {
            tp.setPersonalPhotoUrl(exist.getPersonalPhotoUrl());
            tp.setPersonalPhotoBase64(exist.getPersonalPhotoBase64());
        }
        tpMapper.updateById(tp);

        // 3.2 子表先删后插
        //     关键修复：旧证书的 base64 映射必须在 deleteByTeacherId **之前**抓取，
        //     否则旧行已被删、映射恒空 → 编辑时未上传新图的证书图片整体丢失。
        //     （前端会回传 base64 做主保底，这里再按 certificateId 做一次 merge 兜底。）
        Map<String, String> oldCertBase64Map = new HashMap<>();
        try {
            List<TeacherCertificate> oldCerts = certMapper.selectList(
                    new QueryWrapper<TeacherCertificate>().eq("teacher_id", teacherId)
                            .select("certificate_id", "cert_base64"));
            if (oldCerts != null) {
                for (TeacherCertificate oc : oldCerts) {
                    if (oc.getCertificateId() != null && oc.getCertBase64() != null && !oc.getCertBase64().isEmpty()) {
                        oldCertBase64Map.put(oc.getCertificateId(), oc.getCertBase64());
                    }
                }
            }
        } catch (Exception ignore) { /* 查询失败降级：不 merge，允许 base64 置空 */ }
        certMapper.deleteByTeacherId(teacherId);
        saveCertificates(teacherId, dto.getCertificates(), oldCertBase64Map);

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

    /** 批量插入证书（子表）
     * @param oldBase64Map 调用方在 deleteByTeacherId **之前**抓取的「certificateId → certBase64」旧映射，
     *                     用于 merge 编辑时未上传新图的证书；新增（null）则不 merge。 */
    private void saveCertificates(String teacherId, List<TeacherCertificateDTO> certs,
                                  Map<String, String> oldBase64Map) {
        if (certs == null || certs.isEmpty()) return;
        if (oldBase64Map == null) oldBase64Map = new HashMap<>();

        int sortNo = 0;
        for (TeacherCertificateDTO c : certs) {
            TeacherCertificate cert = new TeacherCertificate();
            // 保留原有 certificateId（编辑时前端回传），使 delete→insert 后仍可按 id 关联、且 merge 可命中；
            // 新增（无 id）则生成新 UUID。
            cert.setCertificateId(c.getCertificateId() != null && !c.getCertificateId().isEmpty()
                    ? c.getCertificateId() : UUID.randomUUID().toString());
            cert.setTeacherId(teacherId);
            cert.setCertName(c.getCertName());
            cert.setCertUrl(c.getCertUrl());
            // merge 逻辑：前端没上传新图（certBase64 为 null/空串），但传了 certificateId（表示编辑已有证书），
            // 用旧 base64 回填；否则用新值。
            String incoming = c.getCertBase64();
            // merge 旧 base64 的条件收紧为"URL 与 base64 都为空 + 有原 certificateId"，
            // 避免 URL 模式上传后，因 base64 为空而把旧 base64 又 merge 回来（新旧并存、显示错位）。
            // 正常编辑时 renderCertRow 会回传旧 URL 与旧 base64（皆非空），不会触发本分支。
            if ((incoming == null || incoming.isEmpty())
                    && (c.getCertUrl() == null || c.getCertUrl().isEmpty())
                    && c.getCertificateId() != null) {
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

    // ================================================================
    // 6. 上传教师图片（头像 photo / 证书 cert），落盘并返回可访问 URL
    //    设计要点（对应 notes §2.2 与用户"统一 URL 上传"诉求）：
    //    · 前端 compressImage 已压到 300/500KB，正常远小于 5MB；这里服务端再限 5MB 兜底。
    //    · 返回的是短 URL（/api/v1/teacher/professional/file/...），DB 只存短串，
    //      彻底绕开"base64 写入触发 max_allowed_packet 超限→图片丢失"的坑。
    //    · 文件以 {ymd}/{uuid}.ext 组织，uuid 命名天然防覆盖、防目录穿越。
    // ================================================================
    public Result<Map<String, String>> uploadImage(MultipartFile file, String fileType, String teacherId) {
        if (file == null || file.isEmpty()) {
            return Result.fail(400, "上传文件为空");
        }
        if (!"photo".equals(fileType) && !"cert".equals(fileType)) {
            return Result.fail(400, "fileType 必须为 photo（头像）或 cert（证书）");
        }
        // 体积校验：业务上限 5MB，超限明确拒绝（413），避免把大文件写进磁盘/CDN 引发下游问题。
        // 容器层已放至 20MB，所以 5~20MB 区间能在此处拿到友好提示而非裸 500。
        if (file.getSize() > uploadMaxBytes) {
            return Result.fail(413, "图片过大（约 " + (file.getSize() / 1024 / 1024)
                    + "MB），请压缩后上传（上限 5MB）");
        }
        // 扩展名校验（仅图片，防任意文件上传）
        String original = file.getOriginalFilename();
        String ext = (original != null && original.contains("."))
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!ALLOWED_EXT.contains(ext)) {
            return Result.fail(400, "仅支持图片格式：jpg / jpeg / png / gif / webp");
        }
        // 等保 P1-2：MIME 类型二次校验 —— 防扩展名伪装攻击。
        // 攻击者把 shell.php 改名为 shell.jpg，扩展名通过但 getContentType() 仍可能返回
        // application/x-php；必须在此拦截。
        String contentType = file.getContentType();
        final java.util.Set<String> ALLOWED_MIME = java.util.Set.of(
                "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp");
        if (contentType == null || !contentType.toLowerCase().startsWith("image/")
                || !ALLOWED_MIME.contains(contentType.toLowerCase())) {
            log.warn("[TeacherProfessional] MIME 类型异常 original={}, content-type={}",
                    original, contentType);
            return Result.fail(400, "文件 MIME 类型非法（仅支持 image/jpeg / png / gif / webp）");
        }
        try {
            Path base = Paths.get(uploadBaseDir).toAbsolutePath().normalize();
            Files.createDirectories(base);
            String ymd = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM"));
            Path dir = base.resolve(ymd);
            Files.createDirectories(dir);
            String uuid = UUID.randomUUID().toString().replace("-", "");
            String fileName = uuid + "." + ext;
            Path target = dir.resolve(fileName);
            file.transferTo(target.toFile());

            String fileUrl = FILE_URL_PREFIX + "/" + ymd + "/" + fileName;
            Map<String, String> data = new HashMap<>();
            data.put("fileUrl", fileUrl);
            data.put("fileName", fileName);
            log.info("[TeacherProfessional] 上传图片成功 fileType={}, teacherId={}, fileUrl={}, size={}B",
                    fileType, teacherId, fileUrl, file.getSize());
            return Result.success(data, "上传成功");
        } catch (Exception e) {
            log.error("[TeacherProfessional] 上传图片失败：{}", e.getMessage(), e);
            return Result.fail(500, "上传失败：" + e.getMessage());
        }
    }

    /**
     * 解析并校验对外访问的相对路径，返回磁盘文件；用于 GET /file/** 伺服。
     *
     * <p>安全约束（防目录穿越）：相对路径必须落在 uploadBaseDir 之内，
     * 任何 {@code ..} 上溯都会被规范化后判定为越界并抛异常。
     *
     * @param relativePath 形如 {@code 2026/10/uuid.jpg}（即 URL 去掉 FILE_URL_PREFIX 后的部分）
     * @return 命中的文件；不存在/非文件返回 null；越界抛 IllegalArgumentException
     */
    public File resolveUploadFile(String relativePath) {
        if (relativePath == null || relativePath.isEmpty()) return null;
        Path base = Paths.get(uploadBaseDir).toAbsolutePath().normalize();
        Path resolved = base.resolve(relativePath).normalize();
        if (!resolved.startsWith(base)) {
            throw new IllegalArgumentException("非法文件路径");
        }
        File f = resolved.toFile();
        if (!f.exists() || !f.isFile()) return null;
        return f;
    }
}
