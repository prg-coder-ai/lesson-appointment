// query/CourseQuery.java
/**分页查询入参（Query）
继承通用分页基类，扩展课程专属筛选条件 */
@Data
public class CourseQuery extends PageQuery {
    private String courseName;    // 课程名称（模糊搜索）
    private String languageType;  // 语言类型（精准筛选）
    private String difficultyLevel;//语言难度 （精准筛选）
    private Integer status;       // 状态（启用/禁用）
    private Long teacherId;       // 授课教师ID
}