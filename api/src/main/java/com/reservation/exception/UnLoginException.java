package com.reservation.exception;
 
public class UnLoginException extends RuntimeException {
   private static final long serialVersionUID = 1L;
    // 无参构造
    public UnLoginException() {
        super();
    }

    // 带错误消息的构造（核心使用）
    public UnLoginException(String message) {
        super(message);
    }

    // 带消息+异常原因的构造（便于排查根因）
    public UnLoginException(String message, Throwable cause) {
        super(message, cause);
    }
    // 解析原因：
    // 警告：serializable class com.reservation.exception.UnLoginException has no definition of serialVersionUID
    // 原因分析：UnLoginException继承了RuntimeException，而RuntimeException实现了java.io.Serializable接口。
    // Java 序列化建议每个serializable类显式声明 serialVersionUID 字段，不声明时编译器会给出警告。
    // 虽然不声明不会影响运行，但加上可以避免反序列化警告和潜在的版本兼容性问题。
    //private static final long serialVersionUID = 1L;
}