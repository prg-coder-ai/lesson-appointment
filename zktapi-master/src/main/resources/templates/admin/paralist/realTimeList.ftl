<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>实时参数监视</title>
    <#include "../shared/cssFile.ftl" />
    <style>
        .line-chart-container>div{float:left;margin-left:10px;}
        .line-chart-container:after {clear:both;content:'';display: block;}
        .line-chart-container {line-height: 30px;}
        .l-text-field{height:26px;}
    </style>
</head>
 <script>
   var bid = ${companyID}　
   </script>
<body class="nav-md">
<div class="container body">
    <div class="main_container">
        <#include "../shared/topBar.ftl" />
        <#include "../shared/leftMenu.ftl" />
        <div class="right_col" role="main">
            <div id="content">
                <div id="content-header">
                    <div id="breadcrumb"><a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i>
                        Home</a> <a class="current" href="#">实时参数监视</a>
                        </div>
                </div>
                <hr/>
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div>
                            <div class="form-group">
                                <label>查询:</label>
                            </div>
                            <div class="form-group">
                             <input type="hidden" class="form-control" name="bindCompanyID" placeholder= "公司编号" value =${companyID}>　
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
                                <select id="searchSubID" name="searchSubID" class="form-control">
                                             <option value="-1">--请选择机组--</option>
                                  </select>　
                             </div>

                        </div>
                        <div>
                            <div class="form-group">
                                <label>换热站</label>
                               <input id="searchDeviceSN" type="text" style="width: 100px;" class="form-control" name="searchDeviceSN"
                                       placeholder="换热站编码">　
                            </div>

                            <button id="search" type="button" class="btn btn-primary" style="margin-left: 50px;">
                                <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                            </button>
                        </div>
                    </form>
                    <div id="maingrid" style="margin:0; padding:0"></div>

                    <div class="modal fade" id="paralistRealModal" tabindex="-1" role="dialog" aria-labelledby="机组参数列表"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:560px; height: 750px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="paralistModalTitle">历史数据</h4>
                                </div>
                                <div class="modal-body" style="padding: 10px;">
                                    <div id="templGrid" style="margin:0; padding:0"></div>
                                </div>
                            </div>
                         </div>
                    </div>
                    <div class="modal fade" id="ParaChartModal" tabindex="-1" role="dialog" aria-labelledby="机组参数"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:1220px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="paralistModalTitle">24小时机组参数曲线</h4>
                                </div>
                                <div class="modal-body" style="padding: 10px;">
                                    <div class="line-chart-container"><div>请选择日期：</div>
                                      <div><input type="text" name="startTime" id="startTime"></div><div>~</div>
                                      <div><input type="text" name="endTime" id="endTime"></div>
                                      <div><button id="btnShowLine" class="btn btn-info">搜索</button></div> </div>

                                    <div id="mainChart" style="width:1200px;height:450px;"></div>
                                </div>
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
<script src="/autosuggest/autosuggest.js"></script>
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
<script src="/js/mEcharts.js"></script>

<script src="/js/bussiness/paralistRealTimeManage.js" type="text/javascript"></script>
</body>
</html>
