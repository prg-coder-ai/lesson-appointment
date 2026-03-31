<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>住户信息表管理</title>
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
                        Home</a> <a class="current" href="#">住户信息表管理</a></div>
                <#--<div class="row-fluid clearfix">
                    <div class="col-md-10">
                        <h1 id="h1CategoryName">住户信息表管理</h1>
                    </div>
                    <div class="col-md-2" style="margin:20px 0 0px;text-align:right;">
                        <button id="btnAddNew" class="btn btn-primary blue"><i class="fa fa-plus"></i>新增</button>
                    </div>
                </div>-->
                </div>
                <hr/>
                <div class="container-fluid">
                    <form id="search_form" class="form-inline" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>关键字查询：</label>
                            <input type="text" class="form-control" name="searchName" placeholder="姓名">　
                        </div>
                        <div class="form-group">
                            <input type="text" class="form-control" name="searchPhoneNumber" placeholder="电话">　
                        </div>
                        <div class="form-group">
                            <input type="text" class="form-control" name="searchCID" placeholder="身份证号">　
                        </div>

                        <button id="search" type="button" class="btn btn-primary">
                            <span class="glyphicon glyphicon-search" aria-hidden="true"></span> 检索
                        </button>
                    </form>
                    <div id="maingrid" style="margin:0; padding:0"></div>

                    <!--html代码区域-->
                    <div class="modal fade" id="CreateModal" tabindex="-1" role="dialog" aria-labelledby="新建/编辑住户信息表"
                         data-backdrop="static">
                        <div class="modal-dialog" style="width:600px;">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <button type="button" class="close" data-dismiss="modal" aria-hidden="true">
                                        &times;
                                    </button>
                                    <h4 class="modal-title" id="myModalLabel">住户信息表</h4>
                                </div>
                                <form name="productInformationsForm" role="form" novalidate class="form-validation">
                                    <div class="modal-body">
                                        <input type="hidden" name="id" value="0"/>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>姓名<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="name" value="" required maxlength="20" placeholder="请输入姓名"/>
                                            <span id="nameError" class="errorMessage"></span>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>电话<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="phoneNumber" value="" required maxlength="15" placeholder="请输入电话"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>生日<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="birthday" value="" readonly placeholder="请选择生日"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>身份证号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="cID" value="" maxlength="18" placeholder="请输入身份证号"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>性别<span class="required">  </span></label>
                                            <select name="gender" class="form-control">
                                                <option value="-1">未知</option>
                                                <option value="1">男</option>
                                                <option value="2">女</option>
                                            </select>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>兴趣<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="interest" value="" maxlength="100" placeholder="请输入兴趣"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>入住日期<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="checkInTime" value="" readonly placeholder="请选择入住日期"/>
                                        </div>

                                        <#--<div class="form-group form-md-line-input form-md-floating-label">
                                            <label>账号<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="account" value="" required maxlength="500"/>
                                        </div>

                                        <div class="form-group form-md-line-input form-md-floating-label">
                                            <label>密码<span class="required">  </span></label>
                                            <input style="width:230px; display: inline;"
                                                   class="maxlength-handler form-control edited"
                                                   type="text" name="password" value="" required maxlength="500"/>
                                        </div>-->
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
        <#include "../shared/footer.ftl" />
    </div>
</div>
<#include "../shared/footerScript.ftl" />
<script src="/js/bootstrap-maxlength.min.js"></script>
<script src="/js/app.js"></script>
<script src="/js/bussiness/customerManage.js" type="text/javascript"></script>
</body>
</html>
