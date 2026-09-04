package com.reservation.audit;

import java.lang.annotation.*;

/**
 * 审计日志注解，标注需要记录业务操作的方法
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Audit {
    /** 操作类型 */
    AuditAction action();

    /** 资源类型 */
    String resourceType() default "";

    /** 资源ID的参数名（取自方法参数名，如 "courseId" 或 "dto.courseId"） */
    String resourceId() default "";

    /** 资源名称的参数名 */
    String resourceName() default "";

    /** 是否记录请求参数（默认 true） */
    boolean logParams() default true;
}
