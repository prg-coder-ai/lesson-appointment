package src.main.java.com.reservation.common;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class AtLeastOneNotBlankValidator implements ConstraintValidator<AtLeastOneNotBlank, Object> {

    private String firstField;
    private String secondField;

    @Override
    public void initialize(AtLeastOneNotBlank constraintAnnotation) {
        this.firstField = constraintAnnotation.firstField();
        this.secondField = constraintAnnotation.secondField();
    }

    @Override
    public boolean isValid(Object obj, ConstraintValidatorContext context) {
        try {
            // 获取两个字段的值
            String firstValue = getFieldValue(obj, firstField);
            String secondValue = getFieldValue(obj, secondField);

            // 至少一个不为空串且不为null
            return (firstValue != null && !firstValue.trim().isEmpty())
                    || (secondValue != null && !secondValue.trim().isEmpty());

        } catch (Exception e) {
            return false;
        }
    }

    // 反射获取字段值
    private String getFieldValue(Object obj, String fieldName) throws Exception {
        java.lang.reflect.Field field = obj.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return (String) field.get(obj);
    }
}
