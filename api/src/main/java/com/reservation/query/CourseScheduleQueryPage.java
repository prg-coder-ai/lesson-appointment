package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;

@Data
public class CourseScheduleQueryPage extends PageQuery {
    private String scheduleName;
    private String courseName;
    private String status;
}