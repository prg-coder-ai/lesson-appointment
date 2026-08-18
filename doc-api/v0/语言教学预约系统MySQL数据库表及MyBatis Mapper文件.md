# 语言教学预约系统MySQL数据库表及MyBatis Mapper文件

说明：数据库表设计严格对应实体类（User、CourseTemplate、Course、Schedule、Order、PayInfo）的字段定义、校验规则，添加合理主键、外键约束及索引；Mapper文件（接口+XML）对应实体类CRUD操作，匹配Service层调用的方法，确保与后端代码无缝衔接。CourseQueryParam为查询参数类，无需创建数据库表，仅在Mapper查询方法中作为参数使用。

# 一、MySQL数据库表创建语句

## 1.1 用户表（user）- 对应User实体

```sql
-- 用户表：存储学生、教师、管理员信息，对应User实体
CREATE TABLE `user` (
  `user_id` varchar(36) NOT NULL COMMENT '用户唯一标识（UUID）',
  `phone` varchar(11) NOT NULL COMMENT '手机号（11位，符合手机号格式）',
  `email` varchar(50) NOT NULL COMMENT '邮箱（符合邮箱格式）',
  `password` varchar(100) NOT NULL COMMENT '加密后的密码（BCrypt加密，长度8-20位，含字母和数字）',
  `role` varchar(10) NOT NULL COMMENT '角色（student：学生，teacher：教师，admin：管理员）',
  `learn_goal` varchar(200) DEFAULT NULL COMMENT '学生学习目标（学生专属）',
  `language_level` varchar(20) DEFAULT NULL COMMENT '学生语言水平（枚举：入门/进阶/中级/高级/精通，学生专属）',
  `name` varchar(50) DEFAULT NULL COMMENT '教师姓名（教师专属）',
  `qualification` text DEFAULT NULL COMMENT '教师资质图片（Base64编码，教师专属）',
  `language_type` varchar(20) DEFAULT NULL COMMENT '教师教授语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语，教师专属）',
  `status` varchar(10) NOT NULL COMMENT '账号状态（active：激活，inactive：待审核，frozen：冻结）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_phone` (`phone`) COMMENT '手机号唯一',
  UNIQUE KEY `uk_email` (`email`) COMMENT '邮箱唯一',
  KEY `idx_role` (`role`) COMMENT '角色索引，用于权限查询',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于账号审核、冻结查询'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表（学生、教师、管理员）';

```

## 1.2 课程模板表（course_template）- 对应CourseTemplate实体

```sql
-- 课程模板表：存储统一的课程模板信息，对应CourseTemplate实体
CREATE TABLE `course_template` (
  `template_id` varchar(36) NOT NULL COMMENT '模板唯一标识（UUID）',
  `language_type` varchar(20) NOT NULL COMMENT '语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语）',
  `difficulty_level` varchar(20) NOT NULL COMMENT '难度等级（枚举：入门/进阶/中级/高级）',
  `class_fee` decimal(10,2) NOT NULL COMMENT '课时费（≥0，保留2位小数）',
  `class_duration` int NOT NULL COMMENT '课程时长（≥15，15的倍数，单位：分钟）',
  `class_form` varchar(20) NOT NULL COMMENT '课程形式（枚举：一对一/小班课/大班课）',
  `description` varchar(500) NOT NULL COMMENT '课程描述（10-500字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_lang_level` (`language_type`,`difficulty_level`) COMMENT '语言类型+难度等级唯一，避免重复模板'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程模板表';

```

## 1.3 教师课程表（course）- 对应Course实体

```sql
-- 教师课程表：存储教师基于模板创建的具体课程，对应Course实体
CREATE TABLE `course` (
  `course_id` varchar(36) NOT NULL COMMENT '课程唯一标识（UUID）',
  `template_id` varchar(36) NOT NULL COMMENT '关联的课程模板ID',
  `course_name` varchar(50) NOT NULL COMMENT '课程名称（2-50字）',
  `content` varchar(1000) NOT NULL COMMENT '教学内容（10-1000字）',
  `feature` varchar(1000) NOT NULL COMMENT '课程特色（10-1000字）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`course_id`),
  KEY `fk_template_id` (`template_id`) COMMENT '关联课程模板索引',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引',
  CONSTRAINT `fk_course_template` FOREIGN KEY (`template_id`) REFERENCES `course_template` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_course_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师课程表';

```

## 1.4 课程排期表（schedule）- 对应Schedule实体

```sql
-- 课程排期表：存储教师课程的具体排期信息，对应Schedule实体
CREATE TABLE `schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '排期唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的教师课程ID',
  `start_time` datetime NOT NULL COMMENT '排期开始时间（格式：YYYY-MM-DD HH:mm:ss）',
  `end_time` datetime NOT NULL COMMENT '排期结束时间（格式：YYYY-MM-DD HH:mm:ss）',
  `is_repeat` tinyint(1) NOT NULL COMMENT '是否重复（0：不重复，1：重复）',
  `repeat_week` int DEFAULT NULL COMMENT '重复日期（1-7，对应周一至周日，is_repeat=1时必填）',
  `status` varchar(20) NOT NULL DEFAULT 'available' COMMENT '排期状态（available：可预约，unavailable：不可预约）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `idx_start_end_time` (`start_time`,`end_time`) COMMENT '时间索引，用于排期冲突校验',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于可预约排期查询',
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  -- 校验结束时间大于开始时间
  CHECK (`end_time` > `start_time`),
  -- 校验重复排期时repeat_week必填且在1-7之间
  CHECK ((`is_repeat` = 0 AND `repeat_week` IS NULL) OR (`is_repeat` = 1 AND `repeat_week` BETWEEN 1 AND 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程排期表';

```

## 1.5 预约订单表（`order`）- 对应Order实体

```sql
-- 预约订单表：存储学生课程预约及支付相关订单信息，对应Order实体
CREATE TABLE `order` (
  `order_id` varchar(36) NOT NULL COMMENT '订单唯一标识（UUID）',
  `schedule_id` varchar(36) NOT NULL COMMENT '关联的课程排期ID（对应schedule表的schedule_id）',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id，角色为student）',
  `order_amount` decimal(10,2) NOT NULL COMMENT '订单金额（对应课程课时费，保留2位小数）',
  `order_status` varchar(20) NOT NULL COMMENT '订单状态（枚举：pending_pay：待支付，paid：已支付，cancelled：已取消，completed：已完成）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '订单创建时间',
  `pay_time` datetime DEFAULT NULL COMMENT '支付时间（订单状态为paid时必填）',
  `pay_type` varchar(20) DEFAULT NULL COMMENT '支付方式（枚举：wechat：微信，alipay：支付宝，balance：余额）',
  PRIMARY KEY (`order_id`),
  KEY `fk_schedule_id` (`schedule_id`) COMMENT '关联排期索引，用于订单与排期关联查询',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引，用于学生订单查询',
  KEY `idx_order_status` (`order_status`) COMMENT '订单状态索引，用于按状态筛选订单',
  KEY `idx_create_time` (`create_time`) COMMENT '创建时间索引，用于订单时间排序查询',
  CONSTRAINT `fk_order_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `schedule` (`schedule_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  -- 校验订单金额大于0
  CHECK (`order_amount` > 0),
  -- 校验支付时间逻辑：已支付状态必须有支付时间，未支付/取消状态无支付时间
  CHECK ((`order_status` = 'paid' AND `pay_time` IS NOT NULL) OR (`order_status` != 'paid' AND `pay_time` IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预约订单表';

```

## 1.6 支付信息表（pay_info）- 对应PayInfo实体

```sql
-- 支付信息表：存储订单支付相关参数及签名，用于支付校验，对应PayInfo实体
CREATE TABLE `pay_info` (
  `id` varchar(36) NOT NULL COMMENT '支付信息唯一标识（UUID）',
  `order_id` varchar(36) NOT NULL COMMENT '关联的订单ID（对应order表的order_id）',
  `pay_type` varchar(20) NOT NULL COMMENT '支付方式（枚举：wechat：微信，alipay：支付宝，balance：余额）',
  `pay_params` varchar(500) NOT NULL COMMENT '支付参数（如微信openid、支付宝商户号等，根据支付方式不同存储对应参数）',
  `pay_sign` varchar(200) NOT NULL COMMENT '支付签名，用于校验支付请求合法性',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '支付信息创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_id` (`order_id`) COMMENT '一个订单对应一条支付信息，确保唯一性',
  KEY `idx_pay_type` (`pay_type`) COMMENT '支付方式索引，用于按支付方式筛选支付记录',
  CONSTRAINT `fk_payinfo_order` FOREIGN KEY (`order_id`) REFERENCES `order` (`order_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付信息表';

```

# 二、MyBatis Mapper文件（接口+XML）

## 2.1 UserMapper（接口+XML）- 对应User实体

### 2.1.1 UserMapper接口（UserMapper.java）

```java
package com.language.reservation.mapper;

import com.language.reservation.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * UserMapper接口，对应user表CRUD操作，匹配UserService中的方法
 */
@Mapper
public interface UserMapper {

    /**
     * 根据手机号查询用户
     * @param phone 手机号
     * @return 用户信息
     */
    User selectByPhone(@Param("phone") String phone);

    /**
     * 根据邮箱查询用户
     * @param email 邮箱
     * @return 用户信息
     */
    User selectByEmail(@Param("email") String email);

    /**
     * 根据手机号或邮箱查询用户（用于登录）
     * @param account 手机号或邮箱
     * @return 用户信息
     */
    User selectByPhoneOrEmail(@Param("account") String account);

    /**
     * 根据用户ID查询用户
     * @param userId 用户ID
     * @return 用户信息
     */
    User selectById(@Param("userId") String userId);

    /**
     * 插入用户（用于学生、教师注册）
     * @param user 用户实体
     * @return 影响行数
     */
    int insert(User user);

    /**
     * 更新用户密码（用于密码重置）
     * @param user 用户实体（含userId和新密码）
     * @return 影响行数
     */
    int updatePassword(User user);
}

```

### 2.1.2 UserMapper XML文件（UserMapper.xml）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd"><mapper namespace="com.language.reservation.mapper.UserMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="userResultMap" type="com.language.reservation.entity.User">
        <result column="user_id" property="userId"/>
        <result column="phone" property="phone"/>
        <result column="email" property="email"/>
        <result column="password" property="password"/>
        <result column="role" property="role"/>
<result column="learn_goal" property="learnGoal"/>
        <result column="language_level" property="languageLevel"/>
        <result column="name" property="name"/>
        <result column="qualification" property="qualification"/>
        <result column="language_type" property="languageType"/>
        <result column="status" property="status"/>
    </resultMap>

    <!-- 新补充：根据手机号查询用户 -->
    <select id="selectByPhone" parameterType="String" resultMap="userResultMap">
        SELECT * FROM `user` WHERE phone = #{phone}
    </select>

    <!-- 新补充：根据邮箱查询用户 -->
    <select id="selectByEmail" parameterType="String" resultMap="userResultMap">
        SELECT * FROM `user` WHERE email = #{email}
    </select>

    <!-- 新补充：根据手机号或邮箱查询用户 -->
    <select id="selectByPhoneOrEmail" parameterType="String" resultMap="userResultMap">
        SELECT * FROM `user` WHERE phone = #{account} OR email = #{account}
    </select>

    <!-- 新补充：根据用户ID查询用户 -->
    <select id="selectById" parameterType="String" resultMap="userResultMap">
        SELECT * FROM `user` WHERE user_id = #{userId}
    </select>

    <!-- 新补充：插入用户 -->
    <insert id="insert" parameterType="com.language.reservation.entity.User">
        INSERT INTO `user` (
            user_id, phone, email, password, role,
            learn_goal, language_level, name, qualification, language_type, status
        ) VALUES (
            #{userId}, #{phone}, #{email}, #{password}, #{role},
            #{learnGoal}, #{languageLevel}, #{name}, #{qualification}, #{languageType}, #{status}
        )
    </insert>

    <!-- 新补充：更新用户密码 -->
    <update id="updatePassword" parameterType="com.language.reservation.entity.User">
        UPDATE `user` SET password = #{password} WHERE user_id = #{userId}
    </update></mapper>

```

## 2.2 CourseTemplateMapper（接口+XML）- 对应CourseTemplate实体

### 2.2.1 CourseTemplateMapper接口（CourseTemplateMapper.java）

```java
package com.language.reservation.mapper;

import com.language.reservation.entity.CourseTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * CourseTemplateMapper接口，对应course_template表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface CourseTemplateMapper {

    /**
     * 根据语言类型和难度等级查询模板（校验唯一性）
     * @param languageType 语言类型
     * @param difficultyLevel 难度等级
     * @return 课程模板信息
     */
    CourseTemplate selectTemplateByLangAndLevel(@Param("languageType") String languageType, @Param("difficultyLevel") String difficultyLevel);

    /**
     * 根据模板ID查询模板
     * @param templateId 模板ID
     * @return 课程模板信息
     */
    CourseTemplate selectTemplateById(@Param("templateId") String templateId);

    /**
     * 查询课程模板列表（可按语言类型筛选）
     * @param languageType 语言类型（可为null，查询所有）
     * @return 课程模板列表
     */
    List<CourseTemplate> getTemplateList(@Param("languageType") String languageType);

    /**
     * 插入课程模板（管理员操作）
     * @param template 课程模板实体
     * @return 影响行数
     */
    int insertTemplate(CourseTemplate template);
}

```

### 2.2.2 CourseTemplateMapper XML文件（CourseTemplateMapper.xml）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.CourseTemplateMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="templateResultMap" type="com.language.reservation.entity.CourseTemplate">
        <result column="template_id" property="templateId"/>
        <result column="language_type" property="languageType"/>
        <result column="difficulty_level" property="difficultyLevel"/>
        <result column="class_fee" property="classFee"/>
        <result column="class_duration" property="classDuration"/>
        <result column="class_form" property="classForm"/>
        <result column="description" property="description"/>
    </resultMap>

    <!-- 新补充：根据语言类型和难度等级查询模板 -->
    <select id="selectTemplateByLangAndLevel" resultMap="templateResultMap">
        SELECT * FROM course_template 
        WHERE language_type = #{languageType} 
        AND difficulty_level = #{difficultyLevel}
    </select>

    <!-- 新补充：根据模板ID查询模板 -->
    <select id="selectTemplateById" parameterType="String" resultMap="templateResultMap">
        SELECT * FROM course_template WHERE template_id = #{templateId}
    </select>

    <!-- 新补充：查询课程模板列表（可按语言类型筛选） -->
    <select id="getTemplateList" parameterType="String" resultMap="templateResultMap">
        SELECT * FROM course_template
        <where>
            <if test="languageType != null and languageType != ''">
                AND language_type = #{languageType}
            </if>
        </where>
        ORDER BY create_time DESC
    </select>

    <!-- 新补充：插入课程模板 -->
<insert id="insertTemplate" parameterType="com.language.reservation.entity.CourseTemplate">
        INSERT INTO course_template (
            template_id, language_type, difficulty_level,
            class_fee, class_duration, class_form, description
        ) VALUES (
            #{templateId}, #{languageType}, #{difficultyLevel},
            #{classFee}, #{classDuration}, #{classForm}, #{description}
        )
    </insert>

</mapper>

```

## 2.3 CourseMapper（接口+XML）- 对应Course实体

### 2.3.1 CourseMapper接口（CourseMapper.java）

```java
package com.language.reservation.mapper;

import com.language.reservation.entity.Course;
import com.language.reservation.entity.CourseQueryParam;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * CourseMapper接口，对应course表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface CourseMapper {

    /**
     * 根据课程ID查询课程
     * @param courseId 课程ID
     * @return 课程信息
     */
    Course selectCourseById(@Param("courseId") String courseId);

    /**
     * 根据课程ID查询关联的教师ID（用于排期归属校验）
     * @param courseId 课程ID
     * @return 教师ID
     */
    String selectTeacherIdByCourseId(@Param("courseId") String courseId);

    /**
     * 插入教师课程
     * @param course 课程实体
     * @return 影响行数
     */
    int insertCourse(Course course);

    /**
     * 根据筛选参数查询课程列表（对应CourseQueryParam查询参数）
     * @param queryParam 课程筛选参数
     * @return 课程列表
     */
    List<Course> selectCourseByParam(@Param("queryParam") CourseQueryParam queryParam);
}

```

### 2.3.2 CourseMapper XML文件（CourseMapper.xml）

## 2.4 ScheduleMapper（接口+XML）- 对应Schedule实体

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.CourseMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="courseResultMap" type="com.language.reservation.entity.Course">
<result column="course_id" property="courseId"/>
        <result column="template_id" property="templateId"/>
        <result column="course_name" property="courseName"/>
        <result column="content" property="content"/>
        <result column="feature" property="feature"/>
        <result column="teacher_id" property="teacherId"/>
    </resultMap>

    <!-- 根据课程ID查询课程 -->
    <select id="selectCourseById" parameterType="String" resultMap="courseResultMap">
        SELECT * FROM course WHERE course_id = #{courseId}
    </select>

    <!-- 根据课程ID查询关联的教师ID -->
    <select id="selectTeacherIdByCourseId" parameterType="String" resultType="String">
        SELECT teacher_id FROM course WHERE course_id = #{courseId}
    </select>

    <!-- 插入教师课程 -->
    <insert id="insertCourse" parameterType="com.language.reservation.entity.Course">
        INSERT INTO course (
            course_id, template_id, course_name,
            content, feature, teacher_id
        ) VALUES (
            #{courseId}, #{templateId}, #{courseName},
            #{content}, #{feature}, #{teacherId}
        )
    </insert>

    <!-- 根据筛选参数查询课程列表（对应CourseQueryParam） -->
    <select id="selectCourseByParam" parameterType="com.language.reservation.entity.CourseQueryParam" resultMap="courseResultMap">
        SELECT c.* FROM course c
        LEFT JOIN `user` u ON c.teacher_id = u.user_id
        <where>
            <!-- 语言类型筛选（可选） -->
            <if test="queryParam.languageType != null and queryParam.languageType != ''">
                AND u.language_type = #{queryParam.languageType}
            </if>
            <!-- 课程形式筛选（必填） -->
            <if test="queryParam.classForm != null and queryParam.classForm != ''">
                AND (SELECT class_form FROM course_template ct WHERE ct.template_id = c.template_id) = #{queryParam.classForm}
            </if>
            <!-- 教师类型筛选（必填） -->
            <if test="queryParam.teacherType != null and queryParam.teacherType != ''">
                AND u.teacher_type = #{queryParam.teacherType}
            </if>
            <!-- 时间范围筛选（可选，根据排期时间筛选） -->
            <if test="queryParam.startTime != null and queryParam.startTime != '' and queryParam.endTime != null and queryParam.endTime != ''">
                AND EXISTS (
                    SELECT 1 FROM schedule s 
                    WHERE s.course_id = c.course_id
                    AND s.start_time BETWEEN #{queryParam.startTime} AND #{queryParam.endTime}
                )
            </if>
        </where>
        ORDER BY c.create_time DESC
    </select>
</mapper>

```

```java
package com.language.reservation.mapper;

import com.language.reservation.entity.Schedule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * ScheduleMapper接口，对应schedule表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface ScheduleMapper {

    /**
     * 根据排期ID查询排期
     * @param scheduleId 排期ID
     * @return 排期信息
     */
    Schedule selectScheduleById(@Param("scheduleId") String scheduleId);

    /**
     * 校验非重复排期的时间冲突（同一课程，同一时间段不可重复）
     * @param courseId 课程ID
     * @param startTime 开始时间
     * @param endTime 结束时间
     * @return 冲突的排期信息（无冲突则返回null）
     */
    Schedule selectScheduleByTime(@Param("courseId") String courseId, @Param("startTime") String startTime, @Param("endTime") String endTime);

    /**
     * 根据排期ID查询关联的教师ID（用于排期归属校验）
     * @param scheduleId 排期ID
     * @return 教师ID
     */
    String selectTeacherIdByScheduleId(@Param("scheduleId") String scheduleId);

    /**
     * 插入课程排期
     * @param schedule 排期实体
     * @return 影响行数
     */
    int insertSchedule(Schedule schedule);

    /**
     * 更新课程排期
     * @param schedule 排期实体（含更新的字段）
     * @return 影响行数
     */
    int updateSchedule(Schedule schedule);
}

```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.CourseMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="courseResultMap" type="com.language.reservation.entity.Course">
<result column="course_id" property="courseId"/>
        <result column="template_id" property="templateId"/>
        <result column="course_name" property="courseName"/>
        <result column="content" property="content"/>
        <result column="feature" property="feature"/>
        <result column="teacher_id" property="teacherId"/>
    </resultMap>

    <!-- 新补充：根据课程ID查询课程 -->
    <select id="selectCourseById" parameterType="String" resultMap="courseResultMap">
        SELECT * FROM course WHERE course_id = #{courseId}
    </select>

    <!-- 新补充：根据课程ID查询关联的教师ID -->
    <select id="selectTeacherIdByCourseId" parameterType="String" resultType="String">
        SELECT teacher_id FROM course WHERE course_id = #{courseId}
    </select>

    <!-- 新补充：插入教师课程 -->
    <insert id="insertCourse" parameterType="com.language.reservation.entity.Course">
        INSERT INTO course (
            course_id, template_id, course_name,
            content, feature, teacher_id
        ) VALUES (
            #{courseId}, #{templateId}, #{courseName},
            #{content}, #{feature}, #{teacherId}
        )
    </insert>

    <!-- 新补充：根据筛选参数查询课程列表（对应CourseQueryParam） -->
    <select id="selectCourseByParam" parameterType="com.language.reservation.entity.CourseQueryParam" resultMap="courseResultMap">
        SELECT c.* FROM course c
        LEFT JOIN `user` u ON c.teacher_id = u.user_id
        <where>
            <!-- 语言类型筛选（可选） -->
            <if test="queryParam.languageType != null and queryParam.languageType != ''">
                AND u.language_type = #{queryParam.languageType}
            </if>
            <!-- 课程形式筛选（必填） -->
            <if test="queryParam.classForm != null and queryParam.classForm != ''">
                AND (SELECT class_form FROM course_template ct WHERE ct.template_id = c.template_id) = #{queryParam.classForm}
            </if>
            <!-- 教师类型筛选（必填） -->
            <if test="queryParam.teacherType != null and queryParam.teacherType != ''">
                AND u.teacher_type = #{queryParam.teacherType}
            </if>
            <!-- 时间范围筛选（可选，根据排期时间筛选） -->
            <if test="queryParam.startTime != null and queryParam.startTime != '' and queryParam.endTime != null and queryParam.endTime != ''">
                AND EXISTS (
                    SELECT 1 FROM schedule s 
                    WHERE s.course_id = c.course_id
                    AND s.start_time BETWEEN #{queryParam.startTime} AND #{queryParam.endTime}
                )
            </if>
        </where>
        ORDER BY c.create_time DESC
    </select>
</mapper>

```

### 2.4.2 ScheduleMapper XML文件（ScheduleMapper.xml）

## 2.5 OrderMapper（接口+XML）- 对应Order实体

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd"><mapper namespace="com.language.reservation.mapper.ScheduleMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="scheduleResultMap" type="com.language.reservation.entity.Schedule">
        <result column="schedule_id" property="scheduleId"/>
        <result column="course_id" property="courseId"/>
        <result column="start_time" property="startTime"/><result column="end_time" property="endTime"/>
        <result column="is_repeat" property="isRepeat"/>
        <result column="repeat_week" property="repeatWeek"/>
        <result column="status" property="status"/>
    </resultMap>

    <!-- 根据排期ID查询排期 -->
    <select id="selectScheduleById" parameterType="String" resultMap="scheduleResultMap">
        SELECT * FROM schedule WHERE schedule_id = #{scheduleId}
    </select>

    <!-- 校验非重复排期的时间冲突 -->
    <select id="selectScheduleByTime" resultMap="scheduleResultMap">
        SELECT * FROM schedule 
        WHERE course_id = #{courseId}
        AND (
            -- 开始时间在已有排期时间段内
            (start_time BETWEEN #{startTime} AND #{endTime})
            -- 结束时间在已有排期时间段内
            OR (end_time BETWEEN #{startTime} AND #{endTime})
            -- 已有排期时间段包含当前排期
            OR (start_time <= #{startTime} AND end_time >= #{endTime})
        )
    </select>

    <!-- 根据排期ID查询关联的教师ID -->
    <select id="selectTeacherIdByScheduleId" parameterType="String" resultType="String">
        SELECT c.teacher_id 
        FROM schedule s
        LEFT JOIN course c ON s.course_id = c.course_id
        WHERE s.schedule_id = #{scheduleId}
    </select>

    <!-- 插入课程排期 -->
    <insert id="insertSchedule" parameterType="com.language.reservation.entity.Schedule">
        INSERT INTO schedule (
            schedule_id, course_id, start_time, end_time,
            is_repeat, repeat_week, status
        ) VALUES (
            #{scheduleId}, #{courseId}, #{startTime}, #{endTime},
            #{isRepeat}, #{repeatWeek}, #{status}
        )
    </insert>

    <!-- 更新课程排期 -->
<update id="updateSchedule" parameterType="com.language.reservation.entity.Schedule">
        UPDATE schedule 
        <set>
            <if test="startTime != null and startTime != ''">start_time = #{startTime},</if><if test="endTime != null and endTime != ''">end_time = #{endTime},</if>
            <if test="isRepeat != null">is_repeat = #{isRepeat},</if>
            <if test="repeatWeek != null">repeat_week = #{repeatWeek},</if>
            <if test="status != null and status != ''">status = #{status},</if>
        </set>
        WHERE schedule_id = #{scheduleId}
    </update>

</mapper>

```

```java
package com.language.reservation.mapper;

import com.language.reservation.entity.Order;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * OrderMapper接口，对应order表CRUD操作，匹配OrderService中的方法
 */
@Mapper
public interface OrderMapper {

    /**
     * 根据订单ID查询订单
     * @param orderId 订单ID
     * @return 订单信息
     */
    Order selectOrderById(@Param("orderId") String orderId);

    /**
     * 根据学生ID查询订单列表（用于学生查看自己的订单）
     * @param studentId 学生ID
     * @param orderStatus 订单状态（可为null，查询所有状态）
     * @return 订单列表
     */
    List<Order> selectOrderByStudentId(@Param("studentId") String studentId, @Param("orderStatus") String orderStatus);

    /**
     * 根据排期ID查询订单（校验排期是否已被预约）
     * @param scheduleId 排期ID
     * @return 订单信息（存在则说明已被预约）
     */
    Order selectOrderByScheduleId(@Param("scheduleId") String scheduleId);

    /**
     * 插入订单（用于学生预约课程）
     * @param order 订单实体
     * @return 影响行数
     */
    int insertOrder(Order order);

    /**
     * 更新订单状态（用于支付、取消订单）
     * @param order 订单实体（含orderId、orderStatus，支付时需含payTime、payType）
     * @return 影响行数
     */
    int updateOrderStatus(Order order);
}

```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd"><mapper namespace="com.language.reservation.mapper.ScheduleMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="scheduleResultMap" type="com.language.reservation.entity.Schedule">
        <result column="schedule_id" property="scheduleId"/>
        <result column="course_id" property="courseId"/>
        <result column="start_time" property="startTime"/><result column="end_time" property="endTime"/>
        <result column="is_repeat" property="isRepeat"/>
        <result column="repeat_week" property="repeatWeek"/>
        <result column="status" property="status"/>
    </resultMap>

    <!-- 新补充：根据排期ID查询排期 -->
    <select id="selectScheduleById" parameterType="String" resultMap="scheduleResultMap">
        SELECT * FROM schedule WHERE schedule_id = #{scheduleId}
    </select>

    <!-- 新补充：校验非重复排期的时间冲突 -->
    <select id="selectScheduleByTime" resultMap="scheduleResultMap">
        SELECT * FROM schedule 
        WHERE course_id = #{courseId}
        AND (
            -- 开始时间在已有排期时间段内
            (start_time BETWEEN #{startTime} AND #{endTime})
            -- 结束时间在已有排期时间段内
            OR (end_time BETWEEN #{startTime} AND #{endTime})
            -- 已有排期时间段包含当前排期
            OR (start_time <= #{startTime} AND end_time >= #{endTime})
        )
    </select>

    <!-- 新补充：根据排期ID查询关联的教师ID -->
    <select id="selectTeacherIdByScheduleId" parameterType="String" resultType="String">
        SELECT c.teacher_id 
        FROM schedule s
        LEFT JOIN course c ON s.course_id = c.course_id
        WHERE s.schedule_id = #{scheduleId}
    </select>

    <!-- 新补充：插入课程排期 -->
    <insert id="insertSchedule" parameterType="com.language.reservation.entity.Schedule">
        INSERT INTO schedule (
            schedule_id, course_id, start_time, end_time,
            is_repeat, repeat_week, status
        ) VALUES (
            #{scheduleId}, #{courseId}, #{startTime}, #{endTime},
            #{isRepeat}, #{repeatWeek}, #{status}
        )
    </insert>

    <!-- 新补充：更新课程排期 -->
<update id="updateSchedule" parameterType="com.language.reservation.entity.Schedule">
        UPDATE schedule 
        <set>
            <if test="startTime != null and startTime != ''">start_time = #{startTime},</if><if test="endTime != null and endTime != ''">end_time = #{endTime},</if>
            <if test="isRepeat != null">is_repeat = #{isRepeat},</if>
            <if test="repeatWeek != null">repeat_week = #{repeatWeek},</if>
            <if test="status != null and status != ''">status = #{status},</if>
        </set>
        WHERE schedule_id = #{scheduleId}
    </update>

</mapper>
```

### 2.5.2 OrderMapper XML文件（OrderMapper.xml）

## 2.6 PayInfoMapper（接口+XML）- 对应PayInfo实体

```java
package com.language.reservation.mapper;

import com.language.reservation.entity.PayInfo;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * PayInfoMapper接口，对应pay_info表CRUD操作，匹配PayService中的方法
 */
@Mapper
public interface PayInfoMapper {

    /**
     * 根据订单ID查询支付信息（用于支付校验）
     * @param orderId 订单ID
     * @return 支付信息
     */
    PayInfo selectPayInfoByOrderId(@Param("orderId") String orderId);

    /**
     * 插入支付信息（用于发起支付请求）
     * @param payInfo 支付信息实体
     * @return 影响行数
     */
    int insertPayInfo(PayInfo payInfo);

    /**
     * 根据订单ID更新支付信息（用于支付回调后更新参数）
     * @param payInfo 支付信息实体（含orderId、payParams、paySign）
     * @return 影响行数
     */
    int updatePayInfoByOrderId(PayInfo payInfo);
}

```

### 2.6.2 PayInfoMapper XML文件（PayInfoMapper.xml）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.OrderMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="orderResultMap" type="com.language.reservation.entity.Order">
        <result column="order_id" property="orderId"/>
        <result column="schedule_id" property="scheduleId"/>
        <result column="student_id" property="studentId"/>
<result column="order_amount" property="orderAmount"/>
        <result column="order_status" property="orderStatus"/>
        <result column="create_time" property="createTime"/>
        <result column="pay_time" property="payTime"/>
        <result column="pay_type" property="payType"/>
    </resultMap>

    <!-- 根据订单ID查询订单 -->
    <select id="selectOrderById" parameterType="String" resultMap="orderResultMap">
        SELECT * FROM `order` WHERE order_id = #{orderId}
    </select>

    <!-- 根据学生ID查询订单列表 -->
    <select id="selectOrderByStudentId" resultMap="orderResultMap">
        SELECT * FROM `order`
        <where>
            <if test="studentId != null and studentId != ''">
                AND student_id = #{studentId}
            </if>
            <if test="orderStatus != null and orderStatus != ''">
                AND order_status = #{orderStatus}
            </if>
        </where>
        ORDER BY create_time DESC
    </select>

    <!-- 根据排期ID查询订单（校验排期是否已被预约） -->
    <select id="selectOrderByScheduleId" parameterType="String" resultMap="orderResultMap">
        SELECT * FROM `order` 
        WHERE schedule_id = #{scheduleId}
        AND order_status IN ('pending_pay', 'paid', 'completed')
    </select>

    <!-- 插入订单 -->
    <insert id="insertOrder" parameterType="com.language.reservation.entity.Order">
        INSERT INTO `order` (
            order_id, schedule_id, student_id, order_amount,
            order_status, create_time, pay_time, pay_type
        ) VALUES (
            #{orderId}, #{scheduleId}, #{studentId}, #{orderAmount},
            #{orderStatus}, #{createTime}, #{payTime}, #{payType}
        )
    </insert>

   <!-- 更新订单状态 -->
    <update id="updateOrderStatus" parameterType="com.language.reservation.entity.Order">
        UPDATE `order`
        <set>
            <if test="orderStatus != null and orderStatus != ''">order_status = #{orderStatus},</if>
            <if test="payTime != null">pay_time = #{payTime},</if>
            <if test="payType != null and payType != ''">pay_type = #{payType},</if>
        </set>
        WHERE order_id = #{orderId}
    </update>

</mapper>

```

# 三、补充说明

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.OrderMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="orderResultMap" type="com.language.reservation.entity.Order">
        <result column="order_id" property="orderId"/>
        <result column="schedule_id" property="scheduleId"/>
        <result column="student_id" property="studentId"/>
<result column="order_amount" property="orderAmount"/>
        <result column="order_status" property="orderStatus"/>
        <result column="create_time" property="createTime"/>
        <result column="pay_time" property="payTime"/>
        <result column="pay_type" property="payType"/>
    </resultMap>

    <!-- 新补充：根据订单ID查询订单 -->
    <select id="selectOrderById" parameterType="String" resultMap="orderResultMap">
        SELECT * FROM `order` WHERE order_id = #{orderId}
    </select>

    <!-- 新补充：根据学生ID查询订单列表 -->
    <select id="selectOrderByStudentId" resultMap="orderResultMap">
        SELECT * FROM `order`
        <where>
            <if test="studentId != null and studentId != ''">
                AND student_id = #{studentId}
            </if>
            <if test="orderStatus != null and orderStatus != ''">
                AND order_status = #{orderStatus}
            </if>
        </where>
        ORDER BY create_time DESC
    </select>

    <!-- 新补充：根据排期ID查询订单（校验排期是否已被预约） -->
    <select id="selectOrderByScheduleId" parameterType="String" resultMap="orderResultMap">
        SELECT * FROM `order` 
        WHERE schedule_id = #{scheduleId}
        AND order_status IN ('pending_pay', 'paid', 'completed')
    </select>

    <!-- 新补充：插入订单 -->
    <insert id="insertOrder" parameterType="com.language.reservation.entity.Order">
        INSERT INTO `order` (
            order_id, schedule_id, student_id, order_amount,
            order_status, create_time, pay_time, pay_type
        ) VALUES (
            #{orderId}, #{scheduleId}, #{studentId}, #{orderAmount},
            #{orderStatus}, #{createTime}, #{payTime}, #{payType}
        )
    </insert>

   <!-- 新补充：更新订单状态 -->
    <update id="updateOrderStatus" parameterType="com.language.reservation.entity.Order">
        UPDATE `order`
        <set>
            <if test="orderStatus != null and orderStatus != ''">order_status = #{orderStatus},</if>
            <if test="payTime != null">pay_time = #{payTime},</if>
            <if test="payType != null and payType != ''">pay_type = #{payType},</if>
        </set>
        WHERE order_id = #{orderId}
    </update>

</mapper>

```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.PayInfoMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="payInfoResultMap" type="com.language.reservation.entity.PayInfo">
        <result column="order_id" property="orderId"/>
        <result column="pay_type" property="payType"/>
        <result column="pay_params" property="payParams"/>
        <result column="pay_sign" property="paySign"/>
    </resultMap>

    <!-- 根据订单ID查询支付信息 -->
    <select id="selectPayInfoByOrderId" parameterType="String" resultMap="payInfoResultMap">
        SELECT order_id, pay_type, pay_params, pay_sign 
        FROM pay_info 
        WHERE order_id = #{orderId}
    </select>

    <!-- 插入支付信息 -->
    <insert id="insertPayInfo" parameterType="com.language.reservation.entity.PayInfo">
        INSERT INTO pay_info (
            id, order_id, pay_type, pay_params, pay_sign, create_time
        ) VALUES (
            REPLACE(UUID(), '-', ''), #{orderId}, #{payType}, #{payParams}, #{paySign}, CURRENT_TIMESTAMP()
        )
    </insert>

    <!-- 根据订单ID更新支付信息 -->
   <update id="updatePayInfoByOrderId" parameterType="com.language.reservation.entity.PayInfo">
        UPDATE pay_info
        <set>
           <if test="payParams != null and payParams != ''">pay_params = #{payParams},</if>
            <if test="paySign != null and paySign != ''">pay_sign = #{paySign},</if>
        </set>
        WHERE order_id = #{orderId}
    </update>

</mapper>

```

- 时间字段（create_time、update_time）设置默认值，自动记录数据创建和更新时间，无需后端代码额外处理；支付时间（pay_time）根据订单状态做了逻辑校验，确保数据合法性。

- 排期表、订单表均添加CHECK约束，确保时间逻辑、状态逻辑合法，减少后端代码校验压力；支付信息表添加唯一键约束，确保一个订单对应一条支付记录。

- 新增的Order和PayInfo相关表及Mapper，与原有表、Mapper格式保持一致，关联关系清晰，支持预约、支付全流程业务需求。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.language.reservation.mapper.PayInfoMapper">

    <!-- 通用结果集映射 -->
    <resultMap id="payInfoResultMap" type="com.language.reservation.entity.PayInfo">
        <result column="order_id" property="orderId"/>
        <result column="pay_type" property="payType"/>
        <result column="pay_params" property="payParams"/>
        <result column="pay_sign" property="paySign"/>
    </resultMap>

    <!-- 新补充：根据订单ID查询支付信息 -->
    <select id="selectPayInfoByOrderId" parameterType="String" resultMap="payInfoResultMap">
        SELECT order_id, pay_type, pay_params, pay_sign 
        FROM pay_info 
        WHERE order_id = #{orderId}
    </select>

    <!-- 新补充：插入支付信息 -->
    <insert id="insertPayInfo" parameterType="com.language.reservation.entity.PayInfo">
        INSERT INTO pay_info (
            id, order_id, pay_type, pay_params, pay_sign, create_time
        ) VALUES (
            REPLACE(UUID(), '-', ''), #{orderId}, #{payType}, #{payParams}, #{paySign}, CURRENT_TIMESTAMP()
        )
    </insert>

    <!-- 新补充：根据订单ID更新支付信息 -->
   <update id="updatePayInfoByOrderId" parameterType="com.language.reservation.entity.PayInfo">
        UPDATE pay_info
        <set>
           <if test="payParams != null and payParams != ''">pay_params = #{payParams},</if>
            <if test="paySign != null and paySign != ''">pay_sign = #{paySign},</if>
        </set>
        WHERE order_id = #{orderId}
    </update>

</mapper>

```
> （注：文档部分内容可能由 AI 生成）