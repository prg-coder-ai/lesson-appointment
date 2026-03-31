//住户信息表逻辑
var maingrid;
(function () {
    $(function () {
        //设置提示框的样式
        toastr.options.positionClass = 'toast-center-center';
        var _modelService = app.createService('customer');
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
            {display: '编号', name: 'id', width: 80},
            {display: '住户姓名', name: 'name', width: 100},
            {display: '电话', name: 'phoneNumber', width: 150},
            {
                display: '生日', name: 'birthday', width: 150, render: function (rowData) {
                    return rowData.birthday == null ? "" : new Date(rowData.birthday).format('Y-m-d');
                }
            },
            {display: '身份证号', name: 'cid', width: 150},
            {
                display: '性别', name: 'gender', width: 80, render: function (rowData) {
                    if (rowData.gender == "1") {
                        return "男";
                    } else if (rowData.gender == "2") {
                        return "女";
                    } else {
                        return "未知";
                    }
                }
            },
            {display: '兴趣', name: 'interest', width: 200},
            {
                display: '入住时间', name: 'checkInTime', width: 150, render: function (rowData) {
                    return rowData.checkInTime == null ? "" : new Date(rowData.checkInTime).format('Y-m-d');
                }
            }
        ];
        var barcol = [
            {text: "添加", click: PostToolbarBtnItemClick, icon: 'add'},
            {text: "修改", click: PostToolbarBtnItemClick, icon: 'edit'},
            /*{text: "删除", click: PostToolbarBtnItemClick, icon: 'delete'}*/
        ];
        PostToolbarOptions = {
            items: barcol,
        };
        loadGrid();

        function loadGrid() {
            maingrid = $("#maingrid").ligerGrid({
                columns: col,
                dataAction: 'server',
                url: "/admin/customer/getPaging",//从服务端加载数据
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
                    _$modal.find("#myModalLabel").html("新建住户信息");
                    _$modal.find("input[name='birthday']").datetimepicker('setDate', new Date());
                    _$modal.find("input[name='checkInTime']").datetimepicker('setDate', new Date());
                    _$modal.find("input[name='id']").val('0');
                    _$modal.find("input[name='name']").val('');
                    _$modal.find("input[name='birthday']").val('');
                    _$modal.find("select[name='gender']").val('0');
                    _$modal.find("input[name='interest']").val('');
                    _$modal.find("input[name='phoneNumber']").val('');
                    _$modal.find("input[name='cID']").val('');
                    _$modal.find("input[name='checkInTime']").val('');
                    break;
                case "修改":
                    var selected = maingrid.getSelecteds();
                    if (selected.length != 1) {
                        toastr.warning('请选择一条数据!');
                        return;
                    }
                    _$modal.find("#myModalLabel").html("编辑住户信息");
                    _$modal.find("input[name='id']").val(selected[0].id);
                    _$modal.find("input[name='name']").val(selected[0].name);
                    if (selected[0].birthday != null) {
                        _$modal.find("input[name='birthday']").val(new Date(selected[0].birthday).format('Y-m-d'));
                        _$modal.find("input[name='birthday']").datetimepicker('setDate', new Date(selected[0].birthday));
                    }
                    _$modal.find("select[name='gender']").val(selected[0].gender);
                    _$modal.find("input[name='interest']").val(selected[0].interest);
                    _$modal.find("input[name='phoneNumber']").val(selected[0].phoneNumber);
                    _$modal.find("input[name='cID']").val(selected[0].cid);
                    if (selected[0].checkInTime != null) {
                        _$modal.find("input[name='checkInTime']").val(new Date(selected[0].checkInTime).format('Y-m-d'));
                        _$modal.find("input[name='checkInTime']").datetimepicker('setDate', new Date(selected[0].checkInTime));
                    }
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

        _$modal.find("input[name='name']").blur(function () {
            checkName();
        })
        _$modal.find("input[name='phoneNumber']").blur(function () {
            checkName();
        })

        //检查站名
        function checkName() {
            $('#nameError').html("");
            if ($.trim(_$modal.find("input[name='name']").val()) != '' && $.trim(_$modal.find("input[name='phoneNumber']").val()) != '') {
                _modelService.getByName({
                        name: $.trim(_$modal.find("input[name='name']").val()),
                        phoneNumber: _$modal.find("input[name='phoneNumber']").val()
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
                    name: {
                        message: '姓名验证失败',
                        validators: {
                            notEmpty: {
                                message: '姓名不能为空'
                            }
                        }
                    },
                    /*birthday: {
                        message: '生日验证失败',
                        validators: {
                            notEmpty: {
                                message: '生日不能为空'
                            }
                        }
                    },*/
                    phoneNumber: {
                        message: '电话验证失败',
                        validators: {
                            notEmpty: {
                                message: '电话不能为空'
                            }
                        }
                    }/*,
                    cID: {
                        message: '身份证号验证失败',
                        validators: {
                            notEmpty: {
                                message: '身份证号不能为空'
                            }
                        }
                    }*/
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

        _$modal.find("input[name='birthday']").datetimepicker({
            format: 'yyyy-mm-dd',
            language: 'zh-CN',
            weekStart: 1,
            todayBtn: 1,//显示‘今日’按钮
            autoclose: 1,
            todayHighlight: 1,
            startView: 2,
            minView: 2,  //Number, String. 默认值：0, 'hour'，日期时间选择器所能够提供的最精确的时间选择视图。
            forceParse: 0
        });
        _$modal.find("input[name='checkInTime']").datetimepicker({
            format: 'yyyy-mm-dd',
            language: 'zh-CN',
            weekStart: 1,
            todayBtn: 1,//显示‘今日’按钮
            autoclose: 1,
            todayHighlight: 1,
            startView: 2,
            minView: 2,  //Number, String. 默认值：0, 'hour'，日期时间选择器所能够提供的最精确的时间选择视图。
            forceParse: 0
        });
    });
})();
