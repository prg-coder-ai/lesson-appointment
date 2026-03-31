<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>报警监视</title>
    <#include "../shared/cssFile.ftl" />
    <style>
        .line-chart-container>div{float:left;margin-left:10px;}
        .line-chart-container:after {clear:both;content:'';display: block;}
        .line-chart-container {line-height: 30px;}
        .l-text-field{height:26px;}
    </style>
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
                        Home</a> <a class="current" href="#">报警信息监视</a>
                        </div>
                </div>

                 <div style="width:90%; height: 50px;">
                                    <h4>实时报警状态:</h4>
                                        <h4 id="statelabel"> </h4>
                         </div>
                <hr/>
 <script>
   var bid = ${companyID}　
   alarmdata = ${state};//ok
  // console.log("a:");
   //console.log(alarmdata.alrmStr);
   //console.log(alarmdata.alrmStr.almtext);
   currentAlarm=  alarmdata.alrmStr.almtext;
   document.getElementById("statelabel").innerHTML = currentAlarm;

    // console.log(":a");
   </script>

                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div>
                            <div class="form-group">
                                <label>查询:</label>
                            </div>
                             <div class="form-group">
                                 <input type="hidden" class="form-control" name="bindCompanyID"
                                 placeholder= "公司编号" value =${companyID}>　
                                <select id="searchCompanyID"  class="form-control">
                                    <option value="-1">--请选择公司--</option>
                                </select>　
                                </div>

                            <button id="search" type="button" class="btn btn-primary" style="margin-left: 50px;">
                                <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                            </button>
                            <button id="refresh" type="button" class="btn btn-primary" style="margin-left: 50px;">
                                <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> 刷新
                            </button>
                        </div>
                    </form>

<!--
                    <div id="maingrid" style="margin:0; padding:0"></div>
                    -->
                    <div id="maingrid_history" style="margin:0; padding:0"></div>
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

<script src="/js/bussiness/alarmlistRealTimeManage.js" type="text/javascript"></script>
</body>
</html>
