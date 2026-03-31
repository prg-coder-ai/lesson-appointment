<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>设备安装管理</title>
    <#include "../shared/cssFile.ftl" />
</head>
<body class="nav-md">
<div class="container body">
    <div class="main_container">
        <#include "../shared/topBar.ftl" />
        <#include "../shared/leftMenu.ftl" />
        <div class="right_col" role="main">
            <div id="content">
                <div id="content-header">
                    <div id="breadcrumb"><a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i>
                        Home</a> <a class="current" href="#">设备安装管理</a></div>
                </div>
                <hr/>
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div>
                            <div class="form-group">
                                <label>查询：</label>
                                <input type="text" style="width:100px;" class="form-control" name="searchPositionID"
                                       placeholder="测温点编号">　
                            </div>
                            <div class="form-group">
                                <input type="text" style="width:100px;" class="form-control" name="searchstationCode"
                                       placeholder="设备编号">　
                            </div>
                            <div class="form-group">
                                <select id="searchCompanyID" name="searchCompanyID" class="form-control">
                                    <option value="-1">--请选择公司--</option>
                                </select>　
                            </div>
                            <div class="form-group">
                                <select id="searchStationID" name="searchStationID" class="form-control">
                                    <option value="-1">--请选择换热站--</option>
                                </select>　
                            </div>
                            <div class="form-group">
                                <select id="searchCommunityID" name="searchCommunityID" class="form-control">
                                    <option value="-1">--请选择小区--</option>
                                </select>　
                            </div>
                            <div class="form-group">
                                <select id="searchBuildingID" name="searchBuildingID" class="form-control">
                                    <option value="-1">--请选择楼号--</option>
                                </select>　
                            </div>
                           <#-- <div class="form-group">
                                <select id="searchRoomID" name="searchRoomID" class="form-control">
                                    <option value="-1">--请选择安装位置--</option>
                                </select>　
                            </div>-->
                        </div>
                        <div>
                            <div class="form-group">
                                <input type="text" style="width:120px;" class="form-control" name="searchStationName"
                                       placeholder="换热站名称">　
                            </div>
                            <div class="form-group">
                                <input type="text" style="width:120px;" class="form-control" name="searchCommunityName"
                                       placeholder="小区名称">　
                            </div>
                            <div class="form-group">
                                <input type="text" style="width:120px;" class="form-control" name="searchExactPosition"
                                       placeholder="安装位置">　
                            </div>
                            <div class="form-group">
                                <input type="text" style="width:100px;" class="form-control" name="searchCustomerName"
                                       placeholder="住户姓名">　
                            </div>
                            <div class="form-group">
                                <input type="text" style="width:100px;" class="form-control" name="searchPhoneNumber"
                                       placeholder="住户电话">　
                            </div>
                            <button id="search" type="button" class="btn btn-primary" style="margin-left: 50px;">
                                <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                            </button>
                        </div>
                    </form>
                    <div id="maingrid" class="defineGrid" style="margin:0; padding:0"></div>

                    <!--html代码区域-->
                    <div class="modal fade" id="CreateModal" tabindex="-1" role="dialog" aria-labelledby="设备安装"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:600px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="myModalLabel">设备安装</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body" style="padding-left: 30px;">
                                        <input type="hidden" name="id" value="0"/>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>设备编号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="stationCode" required maxlength="20"
                                                   placeholder="设备编号"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>设备芯片号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="equipmentChipID" maxlength="20"
                                                   placeholder="设备芯片号"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>通讯卡号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="communicationCard" maxlength="20"
                                                   placeholder="通讯卡号"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>设备的手机卡号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="equipmentPhone" maxlength="20"
                                                   placeholder="设备的手机卡号"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>测温点编号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control"
                                                   type="text" name="positionID" required maxlength="20"
                                                   placeholder="测温点编号"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属公司<span class="required">  </span></label>
                                            <select id="companyID" name="companyID" class="form-control">
                                                <option value="-1">--请选择所属公司--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属换热站<span class="required">  </span></label>
                                            <select id="stationID" name="stationID" class="form-control">
                                                <option value="-1">--请选择换热站--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所在小区<span class="required">  </span></label>
                                            <select id="communityID" name="communityID" class="form-control">
                                                <option value="-1">--请选择小区--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>楼号<span class="required">  </span></label>
                                            <select id="buildingID" name="buildingID" class="form-control">
                                                <option value="-1">--请选择楼号--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>安装位置<span class="required">  </span></label>
                                            <select id="roomID" name="roomID" class="form-control">
                                                <option value="-1">--请选择安装位置--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>安装状态<span class="required">  </span></label>
                                            <select class="form-control" name="installed">
                                                <option value="1">已完成</option>
                                                <option value="2">安装中</option>
                                                <option value="0">未完成</option>
                                            </select>
                                        </div>

                                      <#--  <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>状态<span class="required">  </span></label>
                                            <select class="form-control" name="status">
                                                <option value="1">正常</option>
                                                <option value="2">停用</option>
                                                <option value="3">已删除</option>
                                            </select>
                                        </div>-->

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>备注<span class="required">  </span></label>
                                            <textarea name="remark" style="width:230px; display: inline; height: 50px"
                                                      maxlength="200"
                                                      class="maxlength-handler form-control edited"></textarea>
                                        </div>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default cancel" data-dismiss="modal">取消
                                        </button>
                                        <button type="button" class="btn btn-primary blue submit"><i
                                                class="fa fa-save"></i> <span>保存</span></button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                <#--信号强度列表-->
                    <div class="modal fade" id="LevelModal" tabindex="-1" role="dialog" aria-labelledby="信号强度列表"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:660px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="levelModalTitle">设备近24小时内数据</h4>
                                </div>
                                <div class="modal-body" style="padding: 10px;">
                                    <div id="levelGrid" style="margin:0; padding:0"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                <#--设备信息-->
                    <div class="modal fade" id="DeviceModal" tabindex="-1" role="dialog" aria-labelledby="设备信息"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:450px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="deviceModalTitle">设备信息</h4>
                                </div>
                                <div class="modal-body" style="padding: 10px;">
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>设备编号</label>
                                        <span id="stationCode"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>最新室内温度</label>
                                        <span id="temp1"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>最新设备温度</label>
                                        <span id="temp2"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>最新信号强度</label>
                                        <span id="level"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>最新采集时间</label>
                                        <span id="collectTime"></span>
                                    </div>
                                  <#--  <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>设备芯片号</label>
                                        <span id="equipmentChipID"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>通讯卡号</label>
                                        <span id="communicationCard"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>设备的手机卡号</label>
                                        <span id="equipmentPhone"></span>
                                    </div>-->
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>环境初始温度</label>
                                        <span id="deviceInitialTemp"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>校正参数1</label>
                                        <span id="parameter1"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>校正参数2</label>
                                        <span id="parameter2"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>上报间隔(分钟）</label>
                                        <span id="interlave"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>设备固件版本号</label>
                                        <span id="firmwareVersion"></span>
                                    </div>
                                    <div class="form-group form-md-line-input form-md-floating-label">
                                        <label>安装时间</label>
                                        <span id="createTime"></span>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>

                <#--发送控制命令-->
                    <div class="modal fade" id="CommandModal" tabindex="-1" role="dialog" aria-labelledby="控制命令"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:550px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title">控制命令</h4>
                                </div>
                                <form name="commandForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body" style="padding: 10px;">
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>设备编号</label>
                                            <input type="text" style="width:200px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   id="c_stationCode" readonly="readonly"/>
                                        <#--<span id="c_stationCode"></span>-->
                                            <input type="hidden" id="rangeType" name="rangeType" value="1">
                                            <input type="hidden" id="rangeObjectID" name="rangeObjectID">
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>控制代码</label>
                                            <select id="remoteCode" name="remoteCode" class="form-control"
                                                    style="width:200px; display: inline;">
                                            </select>
                                            <input type="hidden" id="c_name" name="name" value=""/>
                                            <input type="hidden" id="c_deviceColumn" name="deviceColumn" value=""/>
                                            <input type="hidden" id="status" name="status" value="1"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>参数值<span class="required">  </span></label>
                                            <input style="width:200px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" id="note" name="note" value="" required maxlength="10"/>
                                        </div>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default" data-dismiss="modal">取消</button>
                                        <button type="button" class="btn btn-primary blue submit"
                                                onclick="sendCommand();"><i
                                                class="fa fa-send"></i> <span>发送</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
        <#include "../shared/footer.ftl" />
    </div>
</div>
<#include "../shared/footerScript.ftl" />
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
<script src="/js/bussiness/deviceInstallManage.js" type="text/javascript"></script>
</body>
</html>
