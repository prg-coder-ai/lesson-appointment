package com.ih.api.model

import java.util.*
/*CREATE TABLE `rtuStation`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stationid` int(11) DEFAULT NULL COMMENT 'point to heatexchangeStation的id',
  `stationCode` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `number` int(11) DEFAULT NULL,
  `dataValid` int(11) DEFAULT NULL,
  `ModifyDate` datetime(6) DEFAULT NULL,
  `Mem` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 9122 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;*/
/* 换热站--从heatexchangeStation和heatexchangeUnit中抽取， */
data class rtustation(var id: Int = -1,
                        var stationID:Int = -1, //关联的heatexchangeStation ID
                        var stationCode:String = "",//注册码
                        var stationName:String = "",//换热站名称
                        var number:Int = 1,  // 机组个数
                        var dataValid: Int = 1,//是否有效
                        var modifyDate: Date = Date(),
                        var mem:String = ""
)

