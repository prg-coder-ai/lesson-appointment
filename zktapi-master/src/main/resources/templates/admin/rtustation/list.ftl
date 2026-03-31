<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>换热站远传管理</title>
    <#include "../shared/cssFile.ftl" />
</head>
<!--TBD2020 1 根据公司/换热站/机组--》更新RtuStation，其中stationcode可能位为NULL
     2  显示RtuStation列表，手动修改参数
-->
<script>
var bid = ${companyID}　
</script>

 <#if showAll !="0" >
    <body class="nav-md">
        <div class="container body">
        <div class="main_container">
        <#include "../shared/topBar.ftl" />
        <#include "../shared/leftMenu.ftl" />
    <#else>
        <body>
   </#if>
        <div class="right_col" role="main">
            <div id="content">
                <div id="content-header">
                    <div id="breadcrumb"> <a href="#" title="Go to Home" class="tip-bottom">
                    <i class="icon-home"></i> Home</a> <a class="current" href="#">换热站远传管理</a></div>
                </div>
                <hr />
                <div>

                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>关键字查询：</label>
                            <input type="text" class="form-control" name="searchName" placeholder="换热站名">　
                            <input type="hidden" class="form-control"  id="bid" name="bindCompanyID" placeholder= "公司编号" value =${companyID}>　
                              <input type="hidden" class="form-control"  name="bindStationID" placeholder=“站编号” value =${stationID}>　
                        </div>
                        <div class="form-group">
                            <select id="searchCompanyID" name="searchCompanyID" class="form-control">
                                <option value="-1">--请选择公司--</option>
                            </select>　
                        </div>
                        <div class="form-group">
                            <select id="searchCenterStationID" name="searchCenterStationID" class="form-control">
                                <option value="-1">--请选择中心换热站--</option>
                            </select>　
                        </div>
                        <div class="form-group">
                            <select id="searchStationID" name="searchStationID" class="form-control">
                                <option value="-1">--请选择换热站--</option>
                            </select>　
                        </div>
                        <button id="search" type="button" class="btn btn-primary">
                            <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                        </button>
                    </form>

                    <div id="maingrid" style="margin:0; padding:0"></div>

                    <!--html代码区域-->
                    <div class="modal fade"  id="CreateModal" tabindex="-1" role="dialog"
                         aria-labelledby="新建/编辑注册码" data-backdrop="static">
                        <div class="modal-dialog" style="width:600px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                                    <h4 class="modal-title" id="myModalLabel">换热站远传--注册码设置</h4>
                                </div>

                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body">
                                        <input type="hidden" name="id" value="0" />
                                        <input   name="stationID" value="0"  type="hidden"  />

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                              <label>换热站注册码<span class="required">  </span></label>
                                            <input type="text" id="stationCode" name="stationCode" style="width:230px; display: inline;"
                                                class="form-control" placeholder="注册码" />
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>机组个数<span class="required">  </span></label>
                                            <input  id="number" name="number"  type="text"  style="width:230px; display: inline;"
                                            class="form-control" placeholder="机组个数" />
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>换热站名称<span class="required">  </span></label>
                                            <input   name="stationName" value="0"   type="text"  readonly=‘true’ style="width:230px; display: inline;"/>
                                        </div>
                                        <div>
                                                <label>备注<span class="required">  </span></label>
                                                <input  name="mem" value="0"  type="text"  style="width:230px; display: inline;"/>
                                         </div>
                                        <div class="modal-footer">
                                            <button type="button" class="btn btn-default" data-dismiss="modal">取消</button>
                                            <button type="button" class="btn btn-primary blue submit">
                                               <i class="fa fa-save"></i> <span>保存</span></button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
  <#if showAll !="0" >
               <#include "../shared/footer.ftl" />
           </div>
           </div>
           </#if>
<#include "../shared/footerScript.ftl" />
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
<script src="/js/bussiness/rtuStationManage.js"  type="text/javascript"></script>
</body>
</html>
