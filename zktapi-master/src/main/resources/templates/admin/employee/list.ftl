<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>工作人员管理</title>
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
                    <div id="breadcrumb"> <a href="#" title="Go to Home" class="tip-bottom"><i class="icon-home"></i> Home</a> <a class="current" href="#">工作人员管理</a></div>
                </div>
                <hr />
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>关键字查询：</label>
                             <input type="hidden" class="form-control"   name="bindCompanyID" placeholder= "公司编号" value =${companyID}>　
                            <input type="text" class="form-control" name="searchAccount" placeholder="账号">　
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
                    <div class="modal fade"  id="CreateModal" tabindex="-1" role="dialog" aria-labelledby="新建/编辑工作人员信息表" data-backdrop="static">
                        <div class="modal-dialog" style="width:600px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                                    <h4 class="modal-title" id="myModalLabel">工作人员信息表</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novali date class="form-validation">
                                    <div class="modal-body" style="padding-left: 30px;">
                                        <input type="hidden" name="id" value="0" />

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>账号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="text" name="account" value="" required  maxlength="50" placeholder="请输入账号"  />
                                            <span id="nameError" class="errorMessage"></span>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>密码<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="password" name="password" value="" required  maxlength="20" placeholder="请输入密码" />
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>姓<span class="required">  </span></label>
                                            <input style="width:80px; display: inline;" class="form-control" type="text" id="name1" name="name1" value=""  maxlength="10" />
                                            <label style="min-width: 27px;">名<span class="required">  </span></label>
                                            <input style="width:80px; display: inline;" class="form-control" type="text" id="name2" name="name2" value="" required  maxlength="10" />
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属部门<span class="required">  </span></label>
                                            <select id="companyID" name="companyID" class="form-control">
                                                <option value="-1">--请选择公司--</option>
                                            </select>
                                        </div>

                                        <#--<div class="form-group form-md-line-input form-md-floating-label">
                                            <label>部门<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="text" name="department" value=""  maxlength="50" placeholder="请输入部门" />
                                        </div>-->

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>所属换热站<span class="required">  </span></label>
                                            <select id="stationID" name="stationID" class="form-control">
                                                <option value="-1">--请选择换热站--</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>权限等级<span class="required">  </span></label>
                                            <select class="form-control" name="privilege">
                                                <option value="1">操作员</option>
                                                <option value="2">安装人员</option>
                                                <option value="3">管理员</option>
                                                <option value="4">维护人员</option>
                                            </select>
                                        </div>

                                      <#--  <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>状态<span class="required">  </span></label>
                                            <select class="form-control" name="status">
                                                <option value="0">待审核</option>
                                                <option value="1">正常</option>
                                                <option value="2">停用</option>
                                                <option value="4">审核拒绝</option>
                                                <option value="3">删除</option>
                                            </select>
                                        </div>-->
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default cancel" data-dismiss="modal">取消</button>
                                        <button type="button" class="btn btn-primary blue submit"><i class="fa fa-save"></i> <span>保存</span></button>

                                        <button style="display: none;" type="button" class="btn btn-success audit"><i class="fa fa-check"></i> <span>审核通过</span></button>
                                        <button style="display: none;" type="button" class="btn btn-danger audit"><i class="fa fa-times"></i> <span>审核拒绝</span></button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div class="modal fade"  id="ResetModal" tabindex="-1" role="dialog" aria-labelledby="重置密码" data-backdrop="static">
                        <div class="modal-dialog" style="width:650px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                                    <h4 class="modal-title" id="myModalLabel">重置密码</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body" style="padding-left: 30px;">
                                        <input type="hidden" name="id" value="0" />

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>账号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="text" name="account" value="" disabled="disabled"  maxlength="50"  />
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>新密码<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="password" name="password" value="" required  maxlength="20" placeholder="请输入密码" />
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>重复新密码<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;" class="form-control" type="password" name="repassword" value="" required  maxlength="20" placeholder="再次输入密码" />
                                        </div>

                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-default cancel" data-dismiss="modal">取消</button>
                                        <button type="button" class="btn btn-primary blue submit"><i class="fa fa-save"></i> <span>保存</span></button>
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
<script src="/js/bussiness/employeeManage.js"  type="text/javascript"></script>
</body>
</html>
