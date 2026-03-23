package src.main.java.com.reservation.exception;

/**
 * 资源不存在异常（如课程/排期/模板不存在时抛出）
 * 继承RuntimeException，无需手动捕获，由全局异常处理器处理
 */
public class ResourceNotFoundException extends RuntimeException {

    // 无参构造
    public ResourceNotFoundException() {
        super();
    }

    // 带错误消息的构造（核心使用）
    public ResourceNotFoundException(String message) {
        super(message);
    }

    // 带消息+异常原因的构造（便于排查根因）
    public ResourceNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
} 