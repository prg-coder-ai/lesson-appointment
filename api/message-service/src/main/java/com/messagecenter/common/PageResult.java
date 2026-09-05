package com.messagecenter.common;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/** 分页返回结果 */
@Data
@AllArgsConstructor
public class PageResult<T> {
    private List<T> rows;
    private Long total;
    private Integer pageNum;
    private Integer pageSize;
    private Integer totalPages;

    public static <T> PageResult<T> of(IPage<T> page) {
        return new PageResult<>(page.getRecords(), page.getTotal(),
                (int) page.getCurrent(), (int) page.getSize(), (int) page.getPages());
    }
    public static <T> PageResult<T> of(List<T> rows, long total, int pageNum, int pageSize) {
        int totalPages = pageSize <= 0 ? 0 : (int) Math.ceil((double) total / pageSize);
        return new PageResult<>(rows, total, pageNum, pageSize, totalPages);
    }
}
