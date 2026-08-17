
package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;

/**分页查询入参（Query）
继承通用分页基类，扩展课程专属筛选条件 */
@Data
public class UserQueryPage extends PageQuery {
    private String role;    // 精准筛选
    private String status;  // 精准筛选
    private String name;    // （模糊筛选）
    private String email;   // （模糊搜索   
    private String phone;   //  模糊筛选
    private String userId;  //  (精准筛选 ) 授课教师ID
    private String account;  // 模糊搜索  
}