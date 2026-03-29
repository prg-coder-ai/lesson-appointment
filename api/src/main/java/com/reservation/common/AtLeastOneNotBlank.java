package com.reservation.common;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
/**
 * 校验两个字段至少一个不为空
 */
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AtLeastOneNotBlankValidator.class)
public @interface AtLeastOneNotBlank {

    String message() default "手机号和邮箱不能都为空，至少填写一个";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    // 要校验的两个字段名
    String firstField();
    String secondField();
}


