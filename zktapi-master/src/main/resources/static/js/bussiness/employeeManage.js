var maingrid;
var _$resetModal;
var _$resetForm;
var _$modal;
var _$form;
var stationJson = '';

$(function () {
    var _modelService = app.createService('employee');
    _$modal = $('#CreateModal');
    _$form = _$modal.find('form');

    _$resetModal = $('#ResetModal');
    _$resetForm = _$resetModal.find('form');

    //设置提示框的样式
    toastr.options.positionClass = 'toast-center-center';
    //检索
    $("#search").click(function () {
        loadGrid();
        maingrid.changePage('first');
    });
    $("#search_form").keydown(function(e){
        if(e.keyCode==13)
        {
            e.stopPropagation();
            e.preventDefault();
            loadGrid();
            maingrid.changePage('first');
        }
    });
    var col = [
        {display: '员工编号', name: 'id', width: 80},
        {display: '账号', name: 'account', width: 150},
        {display: '姓名', name: 'name', width: 80},
        {display: '所属部门', name: 'companyName', width: 200},
        {display: '所属换热站', name: 'stationName', width: 200},
        //{display: '部门', name: 'department', width: 100},
        {
            display: '员工类型', name: 'privilege', width: 100, render: function (rowData) {
                if (rowData.privilege == "1") {
                    return "操作员";
                } else if (rowData.privilege == "2") {
                    return "安装人员";
                } else if (rowData.privilege == "3") {
                    return "管理员";
                } else
                    return "维护人员";
            }
        },
        {
            display: '状态', name: 'status', width: 100, render: function (rowData) {
                if (rowData.status == "2") {
                    return "<span style='color: red'>停用</span>";
                } else if (rowData.status == "3") {
                    return "<span style='color: red'>已删除</span>";
                } else if (rowData.status == "1") {
                    return "<span style='color: green'>正常</span>";
                } else if (rowData.status == "0") {
                    return "<span style=''>待审核</span>";
                } else if (rowData.status == "4") {
                    return "<span style='color: red'>审核拒绝</span>";
                }
            }
        },
        {
            display: '操作', width: 200, render: function (rowData, index) {
                var returnVar = "<a class='custom-a-style' style='font-weight: normal' href='javascript:void(0);' onclick='resetPassword(" + rowData.id + ",\"" + rowData.account + "\");'> 重置密码 </a>　";
                if (rowData.status == 0 || rowData.status == 4) {
                    returnVar += "<a class='custom-a-style' style='font-weight: normal' href='javascript:void(0);' onclick='audit(" + index + ");'> 审核 </a>";
                } else {
                    returnVar += "<a style='color: #ccc;' href='javascript:void(0);'> 审核 </a>";
                }
                return returnVar;
            }
        }
    ];
    var barcol = [
        {text: "添加", click: PostToolbarBtnItemClick, icon: 'add'},
        {text: "修改", click: PostToolbarBtnItemClick, icon: 'edit'},
        {text: "删除", click: PostToolbarBtnItemClick, icon: 'delete'}
    ];
    PostToolbarOptions = {
        items: barcol,
    };
    loadGrid();

    function loadGrid() {
        maingrid = $("#maingrid").ligerGrid({
            columns: col,
            dataAction: 'server',
            url: "/admin/employee/getPaging",//从服务端加载数据
            parms: $('#search_form').serializeArray(),//这里是关键，传递搜索条件的参数  serializeArray是jquery自带的吧form转json传递的方法
            checkbox: false,
            rownumbers: true,
            pageSize: 20,
            usePager: true,
            width: '99%',
            height: '98%',
            toolbar: PostToolbarOptions,
            onLoaded:function(grid){
                //设置分页输入框的宽度
                var manager = $("#maingrid").ligerGetGridManager();
                var data = manager.getData();
                var total=manager.currentData.Total*1;
                var pageSize=manager.options.pageSize*1;
                var size=parseInt((total/pageSize).toString()).toString().length;
                $(".pcontrol input").css("width",size*15+"px").attr("maxLength",size);
                manager.toggleLoading(false);//隐藏加载层
            }
        });
    }

    function PostToolbarBtnItemClick(item) {
        _$modal.find("input[name='account']").removeAttr("disabled");
        _$modal.find("input[name='name1']").removeAttr("disabled");
        _$modal.find("input[name='name2']").removeAttr("disabled");
        _$modal.find("select[name='companyID']").removeAttr("disabled");
        _$modal.find("select[name='stationID']").removeAttr("disabled");
        //_$modal.find("input[name='department']").removeAttr("disabled");
        _$modal.find("select[name='privilege']").removeAttr("disabled");
        _$modal.find("select[name='status']").removeAttr("disabled");
        switch (item.text) {
            case "添加":
                _$modal.modal("show");
                _$form.find('.submit').show();
                _$form.find('.audit').hide();
                _$modal.find("#myModalLabel").html("新建员工");
                _$modal.find("input[name='id']").val('0');
                _$modal.find("input[name='account']").val('');
                _$modal.find("input[name='password']").parent().show();
                _$modal.find("input[name='password']").val('');
                _$modal.find("input[name='name1']").val('');
                _$modal.find("input[name='name2']").val('');
                _$modal.find("select[name='stationID']").val('-1');
                _$modal.find("select[name='companyID']").val('-1');
                //_$modal.find("input[name='department']").val('');
                _$modal.find("select[name='privilege']").val('1');
                _$modal.find("select[name='status']").val('1');
                break;
            case "修改":
                var selected = maingrid.getSelecteds();
                if (selected.length != 1) {
                    toastr.warning('请选择一条数据!');
                    return;
                }
                _$form.data('bootstrapValidator').removeField('password');
                _$modal.find("#myModalLabel").html("编辑员工");
                _$modal.find("input[name='id']").val(selected[0].id);
                _$modal.find("input[name='account']").val(selected[0].account);
                _$modal.find("input[name='password']").parent().hide();
                _$modal.find("input[name='name1']").val(selected[0].name1);
                _$modal.find("input[name='name2']").val(selected[0].name2);
                _$modal.find("select[name='companyID']").val(selected[0].companyID);
                bindStation("companyID", "stationID");
                _$modal.find("select[name='stationID']").val(selected[0].stationID);
                //_$modal.find("input[name='department']").val(selected[0].department);
                _$modal.find("select[name='privilege']").val(selected[0].privilege);
                _$modal.find("select[name='status']").val(selected[0].status);
                _$form.find('.submit').show();
                _$form.find('.audit').hide();
                _$modal.modal("show");
                break;
            case "查看":
                break;
            case "删除":
                var selected = maingrid.getSelecteds();
                if (selected.length != 1) {
                    toastr.warning('请选择一条数据!');
                    return;
                }

                if (confirm('确定要删除该数据吗？')) {
                    _modelService.delete({
                            id: selected[0].id
                        },
                        function (data) {
                            maingrid.loadData();
                        },
                        function (error) {

                        });
                }
                break;
        }
    }

    _$modal.find("input[name='account']").blur(function () {
        checkName();
    })

    //检查站名
    function checkName() {
        $('#nameError').html("");
        if ($.trim(_$modal.find("input[name='account']").val()) != '') {
            _modelService.getByName({
                    name: $.trim(_$modal.find("input[name='account']").val())
                },
                {id: _$modal.find("input[name='id']").val()}, function (data) {
                    if (data.data.result == 0) {
                        $('#nameError').html(data.data.message);
                    }
                })
        }
    }

    formValidator();
    resetFormValidator();

    function formValidator() {
        _$form.bootstrapValidator({
            message: 'This value is not valid',
            fields: {
                account: {
                    message: '账号验证失败',
                    validators: {
                        notEmpty: {
                            message: '账号不能为空'
                        }
                    }
                },
                password: {
                    validators: {
                        notEmpty: {
                            message: '密码不能为空'
                        },
                        stringLength: {
                            min: 6,
                            max: 18,
                            message: '密码长度必须在6到18位之间'
                        },
                        regexp: {
                            regexp: /^[a-zA-Z0-9_]+$/,
                            message: '密码只能包含大写字母、小写字母、数字和下划线'
                        }
                    }
                },
                name1: {
                    validators: {
                        notEmpty: {
                            message: '姓不能为空　'
                        }
                    }
                },
                name2: {
                    validators: {
                        notEmpty: {
                            message: '名不能为空'
                        }
                    }
                },
                companyID: {
                    message: '公司验证失败!',
                    validators: {
                        notEmpty: {
                            message: '公司不能为空'
                        },
                        callback: {
                            message: '请选择公司',
                            callback: function (value, validator) {
                                if (value == -1) {
                                    return false;
                                } else {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    function resetFormValidator() {
        _$resetForm.bootstrapValidator({
            message: 'This value is not valid',
            fields: {
                password: {
                    validators: {
                        notEmpty: {
                            message: '新密码不能为空'
                        },
                        stringLength: {
                            min: 6,
                            max: 18,
                            message: '密码长度必须在6到18位之间'
                        },
                        regexp: {
                            regexp: /^[a-zA-Z0-9_]+$/,
                            message: '密码只能包含大写字母、小写字母、数字和下划线'
                        },
                        identical: {
                            field: 'repassword',
                            message: '两次输入的密码不相符'
                        }
                    }
                },
                repassword: {
                    validators: {
                        notEmpty: {
                            message: '重复新密码不能为空'
                        },
                        stringLength: {
                            min: 6,
                            max: 18,
                            message: '密码长度必须在6到18位之间'
                        },
                        regexp: {
                            regexp: /^[a-zA-Z0-9_]+$/,
                            message: '密码只能包含大写字母、小写字母、数字和下划线'
                        },
                        identical: {
                            field: 'password',
                            message: '两次输入的密码不相符'
                        }
                    }
                }
            }
        });
    }

    _$form.find('.submit').click(function (e) {
        e.preventDefault();
        _$form.data('bootstrapValidator').validate();
        if (!_$form.data('bootstrapValidator').isValid()) {
            return;
        }
        if ($.trim($('#nameError').html()) != "") {
            return;
        }
        var model = _$form.serializeFormToObject();
        if (model.id == 0) {
            model.createrID = getLoginUser().id;
            _modelService.create(model, function (data) {
                if (data.data.result == 1) {
                    _$modal.modal('hide');
                    maingrid.loadData();
                }
                else {
                    $('#nameError').html(data.data.message);
                }
            })
        }
        else {
            _modelService.update(
                model, function (data) {
                    if (data.data.result == 1) {
                        _$modal.modal('hide');
                        maingrid.loadData();
                    }
                    else {
                        $('#nameError').html(data.data.message);
                    }
                }
            );
        }
    });

    _$resetForm.find('.submit').click(function (e) {
        e.preventDefault();
        _$resetForm.data('bootstrapValidator').validate();
        if (!_$resetForm.data('bootstrapValidator').isValid()) {
            return;
        }
        var model = _$resetForm.serializeFormToObject();
        if (model.id == 0) {
            toastr.error('参数错误!');
            return;
        }
        else {
            $.ajax({
                contentType: 'application/json',
                url: '/admin/employee/resetPassword',
                data: JSON.stringify(model),
                method: "Post",
                beforeSend: function (request) {
                    request.setRequestHeader("authorization", getToken());
                },
                success: function (data) {
                    toastr.success('重置成功!');
                    _$resetModal.modal('hide');
                },
                error: function (error) {

                }
            });
        }
    });

    _$modal.on('hidden.bs.modal', function () {
        _$form.data('bootstrapValidator').destroy();
        _$form.data('bootstrapValidator', null);
        $('#nameError').html("");
        formValidator();
    });

    _$resetModal.on('hidden.bs.modal', function () {
        _$resetForm.data('bootstrapValidator').destroy();
        _$resetForm.data('bootstrapValidator', null);
        resetFormValidator();
    });

    _$form.find('.audit').click(function (e) {
        e.preventDefault();
        var model = _$form.serializeFormToObject();
        //if (model.status == 0) {
        if ($(this).attr("class").indexOf("btn-success") > -1) {
            model.status = 1;
        } else if ($(this).attr("class").indexOf("btn-danger") > -1) {
            model.status = 4;
        }
        _modelService.update(
            model, function (data) {
                _$modal.modal('hide');
                maingrid.loadData();
            }
        );
    });

    //绑定分公司和换热站
    bindCompany();
    $("#searchCompanyID").change(function () {
        bindStation("searchCompanyID", "searchStationID");
    });
    $("#companyID").change(function () {
        bindStation("companyID", "stationID");
    });

    var _stationService = app.createService('heatexchangestation');
    _stationService.getAll({}, {"page": 1, "pagesize": 9999}, function (data) {
        stationJson = data;
    });
});

function bindCompany() {
    //绑定分公司
    var _companyService = app.createService('company');
    _companyService.getAll({"searchParentID": -1}, {"page": 1, "pagesize": 20}, function (data) {
        var parentCompany = JSON.parse(data);
        if (parentCompany.Rows.length > 0) {
            $("#searchCompanyID").empty();
            $("#companyID").empty();
            $("#searchCompanyID").append("<option value=\"-1\">--请选择公司--</option>");
            $("#companyID").append("<option value=\"-1\">--请选择公司--</option>");
            for (var i = 0; i < parentCompany.Rows.length; i++) {
                if (parentCompany.Rows[i].status == 1)
               // if( (parentCompany.Rows[i].id == 2) ||(parentCompany.Rows[i].parentID == 2))
                       if((bid == -1)
                         ||   (parentCompany.Rows[i].id == bid)
                              ||(parentCompany.Rows[i].parentID == bid)
                                )
                {
                    $("#searchCompanyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");
                    $("#companyID").append("<option value='" + parentCompany.Rows[i].id + "'>" + parentCompany.Rows[i].name + "</option>");
                }
            }
        }
    });
}

function bindStation(companyIDStr, stationIDStr) {
    //绑定换热站
    $("#" + stationIDStr).empty();
    $("#" + stationIDStr).append("<option value=\"-1\">--请选择换热站--</option>");

    var companyId = $("#" + companyIDStr).val();
    if (parseInt(companyId) > 0 && stationJson != '') {
        var parentStation = JSON.parse(stationJson);
        if (parentStation.Rows.length > 0) {
            for (var i = 0; i < parentStation.Rows.length; i++)
                          {
                if (parentStation.Rows[i].companyID == companyId && parentStation.Rows[i].status == 1)
                    $("#" + stationIDStr).append("<option value='" + parentStation.Rows[i].id + "'>" +
                     parentStation.Rows[i].name + "</option>");
            }
        }
    }
}

function resetPassword(id, account) {
    _$resetModal.find("input[name='id']").val(id);
    _$resetModal.find("input[name='account']").val(account);
    _$resetModal.find("input[name='password']").val('');
    _$resetModal.find("input[name='repassword']").val('');
    _$resetModal.modal("show");
}

function audit(index) {
    var modalData = maingrid.getRow(index);
    if (modalData == undefined) {
        toastr.error('参数有误!');
        return;
    }
    _$modal.find("#myModalLabel").html("审核员工");
    _$modal.find("input[name='id']").val(modalData.id);
    _$modal.find("input[name='account']").val(modalData.account);
    _$modal.find("input[name='password']").parent().hide();
    _$modal.find("input[name='name1']").val(modalData.name1);
    _$modal.find("input[name='name2']").val(modalData.name2);
    _$modal.find("select[name='companyID']").val(modalData.companyID);
    bindStation("companyID", "stationID");
    _$modal.find("select[name='stationID']").val(modalData.stationID);
    _$modal.find("input[name='department']").val(modalData.department);
    _$modal.find("select[name='privilege']").val(modalData.privilege);
    _$modal.find("select[name='status']").val(modalData.status);

    _$modal.find("input[name='account']").attr("disabled", "disabled");
    _$modal.find("input[name='name1']").attr("disabled", "disabled");
    _$modal.find("input[name='name2']").attr("disabled", "disabled");
    _$modal.find("select[name='companyID']").attr("disabled", "disabled");
    _$modal.find("select[name='stationID']").attr("disabled", "disabled");
    _$modal.find("input[name='department']").attr("disabled", "disabled");
    _$modal.find("select[name='privilege']").attr("disabled", "disabled");
    _$modal.find("select[name='status']").attr("disabled", "disabled");
    _$form.find('.submit').hide();
    _$form.find('.audit').show();
    _$modal.modal("show");

}



