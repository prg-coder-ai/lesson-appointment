//换热机组逻辑
var maingrid;
var stationJson = '';
(function () {
    $(function () {
        toastr.options.positionClass = 'toast-center-center';
        var _modelService = app.createService('heatexchangerunit');
        var _$modal = $('#CreateModal');
        var _$form = _$modal.find('form');
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
            //{display: '记录号', name: 'id', width: 80},
             {display: '所属公司', name: 'companyName', width: 250},
               {display: '所属热力站', name: 'stationName', width: 250},
            {display: '换热机组名称', name: 'unitNumber', width: 200},
            //{display: '换热机组编号', name: 'crewID', width: 200},
            {display: '地址', name: 'address', width: 400},
            {display: '说明', name: 'updateDesc', width: 400}
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
                url: "/admin/heatexchangerunit/getPaging",//从服务端加载数据
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
            switch (item.text) {
                case "添加":
                    _$modal.modal("show");
                    _$modal.find("#myModalLabel").html("新建换热机组");
                    _$modal.find("input[name='id']").val(0);
                    _$modal.find("input[name='unitNumber']").val('');
                    _$modal.find("input[name='crewID']").val('');
                    _$modal.find("select[name='companyID']").val('-1');
                    _$modal.find("select[name='stationID']").val('-1');
                    _$modal.find("input[name='address']").val('');
                     _$modal.find("input[name='updateDesc']").val('说明');
                    break;
                case "修改":
                    var selected = maingrid.getSelecteds();
                    if (selected.length != 1) {
                        toastr.warning('请选择一条数据!');
                        return;
                    }
                    _$modal.find("#myModalLabel").html("编辑换热机组");
                    _$modal.find("input[name='id']").val(selected[0].id);
                    _$modal.find("input[name='unitNumber']").val(selected[0].unitNumber);
                    _$modal.find("input[name='crewID']").val(selected[0].crewID);
                    _$modal.find("select[name='companyID']").val(selected[0].companyID);
                    bindStation("companyID", "stationID");
                    _$modal.find("select[name='stationID']").val(selected[0].stationID);
                    _$modal.find("input[name='address']").val(selected[0].address);
                     _$modal.find("input[name='updateDesc']").val(selected[0].updateDesc);
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

        _$modal.find("input[name='unitNumber']").blur(function () {
            checkUnitNumber();
        })

        $("#stationID").change(function () {
            checkUnitNumber();
        });

        //检查站名
        function checkUnitNumber() {
            $('#nameError').html("");
            if ($.trim(_$modal.find("input[name='unitNumber']").val()) != '') {
                _modelService.getByName({
                        unitNumber: $.trim(_$modal.find("input[name='unitNumber']").val()),
                        stationID: _$modal.find("select[name='stationID']").val()
                    },
                    {id: _$modal.find("input[name='id']").val()}, function (data) {
                        if (data.data.result == 0) {
                            $('#nameError').html(data.data.message);
                        }
                    })
            }
        }

        //表单验证
        formValidator();

        function formValidator() {
            _$form.bootstrapValidator({
                message: 'This value is not valid',
                fields: {

                    stationID: {
                        message: '换热站验证失败!',
                        validators: {
                            notEmpty: {
                                message: '换热站不能为空'
                            },
                            callback: {
                                message: '请选择换热站',
                                callback: function (value, validator) {
                                    if (value == -1) {
                                        return false;
                                    } else {
                                        return true;
                                    }
                                }
                            }
                        }
                    },
                    unitNumber: {
                        message: '换热站编号验证失败',
                        validators: {
                            notEmpty: {
                                message: '换热站编号不能为空'
                            }
                        }
                    }
                }
            });
        }

        //表单提交
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

        _$modal.on('hidden.bs.modal', function () {
            _$form.data('bootstrapValidator').destroy();
            _$form.data('bootstrapValidator', null);
            $('#nameError').html("");
            formValidator();
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
})();


function bindCompany() {
    //绑定分公司"searchParentID": -2
    var _companyService = app.createService('company');
    _companyService.getAll({}, {"page": 1, "pagesize": 999}, function (data) {
        var parentCompany = JSON.parse(data);
        if (parentCompany.Rows.length > 0) {
            $("#searchCompanyID").empty();
            $("#companyID").empty();
            $("#searchCompanyID").append("<option value=\"-1\">--请选择公司--</option>");
            $("#companyID").append("<option value=\"-1\">--请选择公司--</option>");
            for (var i = 0; i < parentCompany.Rows.length; i++) {
            if (parentCompany.Rows[i].status == 1)
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
            for (var i = 0; i < parentStation.Rows.length; i++) {
                if (parentStation.Rows[i].companyID == companyId && parentStation.Rows[i].status == 1)
                    $("#" + stationIDStr).append("<option value='" + parentStation.Rows[i].id + "'>" + parentStation.Rows[i].name + "</option>");
            }
        }
    }
}
