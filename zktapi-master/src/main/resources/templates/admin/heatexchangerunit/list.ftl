<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>换热机组管理</title>
    <#include "../shared/cssFile.ftl" />
</head>
 <#if showAll !="0" >
    <body class="nav-md">
        <div class="container body">
        <div class="main_container">
        <#include "../shared/topBar.ftl" />
        <#include "../shared/leftMenu.ftl" />
    <#else>
        <body >
   </#if>
   <script>
   var bid = ${companyID}　
   </script>
        <div class="right_col" role="main">
            <div id="content">
                <div id="content-header">
                    <div id="breadcrumb"><a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i>
                        Home</a> <a class="current" href="#">换热机组管理</a></div>
                </div>
                <hr/>
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>关键字查询：</label>
                             <input type="hidden" class="form-control"  hidden name="bindCompanyID" placeholder= "公司编号" value =${companyID}>　
                            <input type="text" class="form-control" name="searchUnitNumber" placeholder="换热机组名称">
                            <input type="text" class="form-control" name="searchCrewID" placeholder="换热机组编号">　　
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
                        <button id="search" type="button" class="btn btn-primary">
                            <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                        </button>
                    </form>
                    <div id="maingrid" style="margin:0; padding:0"></div>

                    <!--html代码区域-->
                    <div class="modal fade" id="CreateModal" tabindex="-1" role="dialog" aria-labelledby="新建/编辑换热机组"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:500px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="myModalLabel">换热机组</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body">
                                        <input type="hidden" name="id" value="0"/>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属公司<span class="required">  </span></label>
                                            <select id="companyID" name="companyID" class="form-control">
                                                <option value="-1">--请选择公司--</option>
                                            </select>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属换热站<span class="required">  </span></label>
                                            <select id="stationID" name="stationID" class="form-control">
                                                <option value="-1">--请选择换热站--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>换热机组名称<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="maxlength-handler form-control edited"
                                                   type="text" name="unitNumber" value="" required maxlength="500"/>
                                            <span id="nameError" class="errorMessage"></span>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>换热机组编号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="maxlength-handler form-control edited"
                                                   type="text" name="crewID" value=""  maxlength="500"/>
                                        </div>
                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>换热机组地址<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="maxlength-handler form-control edited"
                                                   type="text" name="address" value=""  maxlength="50"/>
                                        </div>
                                            <div class="form-group form-md-line-input form-md-floating-label">
                                             <label>换热机组说明<span class="required">  </span></label>
                                             <input style="width:230px; display: inline;" class="maxlength-handler form-control edited"
                                                    type="text" name="updateDesc" value=""  maxlength="150"/>
                                         </div>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default" data-dismiss="modal">取消</button>
                                        <button type="button" class="btn btn-primary blue submit"><i
                                                class="fa fa-save"></i> <span>保存</span></button>
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
<script src="/js/bussiness/heatexchangerunitManage.js" type="text/javascript"></script>
</body>
</html>
