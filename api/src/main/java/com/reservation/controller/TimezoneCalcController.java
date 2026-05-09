package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.TzSwitchPO;
import com.reservation.entity.TzSwitchVO;
  
import com.reservation.service.TzSwitchService ;

import  com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 操作       对接接口地址      请求方式        接口说明
   
 */
@RestController
@RequestMapping("/tz")
@Validated
public class TimezoneCalcController {  
       @Autowired
    private TzSwitchService tzSwitchService;

    @Autowired
    private PermissionCheck permissionCheck; 
    /**
     * 
     */
    @PostMapping("/switch")
    @ResponseBody
    public Result<TzSwitchVO> switch_to(@Validated @RequestBody TzSwitchPO dataIn,
                                                   @RequestHeader("Authorization") String token) { 
        // 把dataIn的日期时间按照时区进行转化，同时计算星期几（中文名）与周内序号（周一为1，周日为7）
        //TzSwitchVO resultMap = new TzSwitchVO();
        try {
            TzSwitchVO  resultMap =  tzSwitchService. tzSwitchTo( dataIn) ; 
            return Result.success(resultMap, "ok");
        } catch (Exception e) {
            return Result.success(null,  "时间格式或时区错误: " + e.getMessage());
        } 
    }
 
}