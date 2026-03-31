<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>换热站远程管理系统</title>
    <link rel="stylesheet" href="http://cache.amap.com/lbs/static/main1119.css"/>
    <#include "shared/cssFile.ftl" />
    <style type="text/css">
        table{ border-left: 1px solid #0A0A0A; border-top: 1px solid #0A0A0A;}
        table td{ border-right: 1px solid #0A0A0A; border-bottom: 1px solid #0A0A0A;}
        .tab_warning { width: 100%;}
        .tab_warning table{ width: 100%; }
        .tab_warning table td{ height: 28px; line-height: 28px; text-align:center;}
        .redWarning { color: #FF0000; }
        .tab_data1{ width: 49%; float: left;}
        .tab_data1 table{ width: 100%;}
        .tab_data1 table td{ height: 47px; line-height: 47px; font-size: 16px; text-align: center;}
        .tab_data2{ width: 49%; float: left; margin-left: 2%;}
        .tab_data2 table{ width: 100%;}
        .tab_data2 table td{ height: 28px; line-height: 28px; font-size: 14px; text-align: center;}
        html,body{width:100%;height:100%;}
        .button-group{ top:10px;bottom:auto;left:0;right:auto;  }
        #container{height:100%;}
        .custom-content-marker div {background:url(/img/mark-bs.png) 0 0 no-repeat;width:38px;height:63px;color:#fff;padding-top:10px;}
        .circle-content-marker {background-color:#0000ff;border-radius:30px;opacity: 0.85;border:solid 2px #fff;}
        .circle-content-marker div {color:#fff;padding:4px 5px;min-width:50px;text-algin:center;}
        #companyChars {width:100%;opacity: 0.75;height:200px;position: absolute;bottom:0px;z-index: -1;background-color:#fff;}
        #companyChars .pie{width:100%;height:200px;float:left;}
        #companyChars .line {width:20%;height:220px;float:left;margin-top:20px}
        .close {width:30px;height:30px;position: absolute;right:0;top:0;text-align: center;padding-top:2px;z-index: 20000;}
        #rightToolAlarm {position: absolute;right:0;width:14.5%;top:0;opacity: 0.75;display: none;}
        #rightToolPercent {position: absolute;right:0;width:16.5%;bottom:0;opacity: 0.7;z-index: -1;}
        #rightToolPercent #allCompanyChart{width:100%;height:240px;}
        #rightToolPercent #allCompanyLine{width:100%;height:220px;margin-top:20px;}
        .glyphicon{margin-right:4px !important;/*override*/}
        .panel ul{padding:0px;margin:0px;list-style:none;}
        .alarm-item{padding:4px 4px;margin:0px;border-bottom:1px dotted #555;}
        #rightToolAlarm  #highAlarmContainer .col-md-12,#rightToolAlarm  #lowAlarmContainer .col-md-12 {padding:0 !important;}
       /* #rightToolAlarm  #lowAlarmContainer {height:220px;}*/
        ul.ulHeader li.alarm-item-header {border-bottom:dotted 1px #ccc;}
        ul.alarmList li {border-bottom:none;}
        ul.alarmList li.alarm-item a,ul.ulHeader li.alarm-item-header span:nth-child(1) {display:inline-block; width: 60%;overflow: hidden;white-space: nowrap;text-overflow: ellipsis;}
        ul.alarmList li.alarm-item span:nth-child(2),ul.ulHeader li.alarm-item-header span:nth-child(2) {display:inline-block; width: 40%;overflow: hidden;white-space: nowrap;
            text-align: center;}
        ul.alarmList li.alarm-item span:nth-child(3),ul.ulHeader li.alarm-item-header span:nth-child(3) {display:inline-block; width: 20%;overflow: hidden;white-space: nowrap;
            text-align: right;}
        ul.ulHeader li.alarm-item-header span { color:#000;}
        .panel{margin-bottom:8px;}
        .panel-body { padding: 10px 0px 0px 10px !important;}
        #realTimeInfo {position:absolute;top:0;right:20%;width:13%;background-color:#fff;height:40px;display:none;}
        #realTimeInfo li a{text-align: center;width:50%;line-height:37px;}
        #realTimeInfo li span:nth-child(2) {font-size:20px;width:40%;line-height:40px;}
        #realTimeTempClose {line-height:37px;}
        .panel-heading {padding:5px 15px !important;}
        .amap-toolbar {top:50px !important;}
        .alarm-item a {color:#333;}
        .alarm-item a:hover {color:#000;}
    </style>

    <script type="text/javascript" src="http://api.map.baidu.com/api?v=2.0&ak=6QD6MAZ8r4xtF4iSGVpzzDQIEUcRWnYm"></script>
    <script type="text/javascript" src="/js/Heatmap.js"></script>
    <!-- script type="text/javascript" src="/js/bussiness/temps.js"></script  -->
    <script type="text/javascript" src="http://api.map.baidu.com/library/TextIconOverlay/1.2/src/TextIconOverlay_min.js"></script>
    <script type="text/javascript" src="http://api.map.baidu.com/library/MarkerClusterer/1.2/src/MarkerClusterer_min.js"></script>
</head>
<body class="nav-sm">
        <div id="container" style="width:100%;"></div>
         <div style="position:absolute;left:20px;top:0;z-index: 9999;">

             <div class="btn-group btn-group-sm" style="float:left;">
             <button onclick="showBaseManage()" style="" class="btn btn-info "><span class="glyphicon glyphicon-list"></span>基础数据管理</button>
           <#--  <button onclick="toggleParentCompanyChart()" class="btn btn-success"><span class="glyphicon glyphicon-th"></span>统计</button>-->
           <!--  <button onclick="toggleCompanyChart()" class="btn btn-success"><span class="glyphicon glyphicon-th-large"></span>温度百分比统计</button>  -->
            <!-- <button onclick="showHighAlarmTemp()" class="btn btn-danger"><span class="glyphicon glyphicon-bell"></span>高限报警</button>  -->
            <!--  <button onclick="showLowAlarmTemp()" class="btn btn-primary"><span class="glyphicon glyphicon-bell"></span>低限报警</button>  -->
             <button onclick="showLastTemp()" class="btn btn-info"><span class="glyphicon glyphicon-pushpin"></span>最新数据</button>
             <button onclick="resetStatus()" style="" class="btn btn-info"><span class="glyphicon glyphicon-arrow-right"></span>返回</button>

             </div>

             <div class="input-group" style="float:left;width:150px;margin-left:20px;" id="searchContainer">
                 <input type="text" class="form-control" name="searchInput" placeholder="请输入地址">
                 <span class="input-group-btn">
						<button class="btn btn-default" type="button" style="line-height:16px;"  onclick="searchAddress()">
							Go!
						</button>
					</span>
             </div>

             <div style="float:right;background-color:#fff;margin:7px;padding:2px;">缩放级别：<span id="spnZoomGrade">13</span></div>
             <span id="oprationTip"></span>
         </div>

        <div  id="companyChars">
            <div id="companiesClose" class="close" title="关闭"> x </div>
            <div id="companyPie" class="pie"></div>
        </div>
        <div id="rightToolAlarm">
            <div id="highAlarmContainer">
                <div class="col-md-12">
                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <span class="glyphicon glyphicon-stats"  style="color:red;"></span><b style="color:red;">参数报警</b><div id="alarmHighClose" class="close"  title="关闭"> x </div></div>
                        <div class="panel-body">
                            <div class="row">
                                <div class="col-xs-12">
                                    <ul class="ulHeader">
                                        <li class="alarm-item-header"><span>机组</span><span>参数</span></li>
                                    </ul>
                                    <ul id="highUI" class="alarmList">
                                        <li class="alarm-item"><a></a><span></span><span></span></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="lowAlarmContainer">
                <div class="col-md-12">
                    <div class="panel panel-default">
                        <div class="panel-heading">
                            <span class="glyphicon glyphicon-stats" style="color:blue;"></span><b style="color:blue;">低限报警</b><div id="alarmLowClose" class="close" title="关闭"> x </div></div>
                        <div class="panel-body">
                            <div class="row">
                                <div class="col-xs-12">
                                    <ul class="ulHeader">
                                        <li class="alarm-item-header"><span>机组</span><span>参数</span></li>
                                    </ul>
                                    <ul id="lowUI" class="alarmList">
                                        <li class="alarm-item"><a></a><span></span><span></span></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div id="rightToolPercent">
            <div id="parentCompanyClose" class="close" style="margin-right:0px;" title="关闭"> x </div>
            <div id="allCompanyChart"></div>
        </div>
        <div id="realTimeInfo">
            <ul id="nowUI" class="alarmList">
                <li class="alarm-item"><a></a><span></span><span></span></li>
            </ul>
            <div id="realTimeTempClose" class="close" title="关闭"> x </div>
        </div>
        <br style="clear: both;" />
<#include "shared/footerScript.ftl" />
<script type="application/javascript" src="/js/heatmap.js"></script>
<script type="application/javascript" src="/js/es5-shim.min.js"></script>
<script type="application/javascript" src="/js/promise-6.1.0.js"></script>
<script type="application/javascript" src="/js/underscore.js"></script>
<#--<script type="application/javascript" src="/vendors/echarts/dist/echarts.js"></script>-->
<script type="application/javascript" src="/vendors/echarts/dist/echarts.min.js"></script>
<script type="application/javascript" src="/js/bootstrap.newsbox.min.js"></script>

<script type="application/javascript" src="/js/bussiness/index.js"></script>
</body>
</html>

