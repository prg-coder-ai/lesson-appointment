// common/PageQuery.java  分页请求基类 抽离公共分页参数，所有列表接口复用，新增筛选条件时只需继承扩展。
@Data
public class PageQuery {
    @ApiModelProperty("当前页码，默认1")
    private Integer pageNum = 1;
    
    @ApiModelProperty("每页条数，默认10")
    private Integer pageSize = 10;
}
//扩展方式：比如预约列表筛选，直接写 ReservationQuery extends PageQuery，在里面加课程名称、状态等筛选字段。