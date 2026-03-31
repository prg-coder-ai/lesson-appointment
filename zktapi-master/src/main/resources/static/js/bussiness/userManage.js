(function () {
    $(function () {
        var _$ListTable = $('#ListTable');
        var _modelService = app.createService('user');
        
        var _$modal = $('#CreateModal');
        var _$form = _$modal.find('form');

        $("#btnAddNew").on("click", function () {

            _$modal.modal("show");
            _$modal.find("input[name='id']").val('');
            _$modal.find("input[name='account']").val('');
            _$modal.find("input[name='passwrod']").val('');
            _$modal.find("input[name='realName']").val('');
            _$modal.find("input[name='mobile']").val('');
            _$modal.find("input[name='qq']").val('');
            _$modal.find("input[name='weixin']").val('');
            _$modal.find("input[name='availableLength']").val('30');
            $("#passwordContainer").show();
        });

        _$form.validate();

        _$form.find('.submit').click(function (e) {
            e.preventDefault();
            if (!_$form.valid()) {
                return;
            }
            var model = _$form.serializeFormToObject();
/*            abp.ui.setBusy(_$modal);*/
            if (!model.id) {
                _modelService.create(model,function (data) {
                    _$modal.modal('hide');
                    getModelList();
                })
            }
            else 
            {
                _modelService.update(
                model,function (data) {
                        _$modal.modal('hide');
                        getModelList();
                    }
                );
            }
              
        });

        _$modal.on('shown.bs.modal', function () {
            _$modal.find('input:not([type=hidden]):first').focus();
        });
    
        _$ListTable.jtable({
            pageList: "normal",
            title:'',
            paging: true,
            //selecting: true,
            //selectingCheckboxes :true,
            pageSizes: [10,20],
            pageSize:10,
            sorting: true,
            defaultSorting:"ID Desc",
            //  multiSorting: true,  
            actions: {
                listAction:'/admin/user/getPaging'
               /* listAction: function (postData, jtParams) {
                    return app.createPagingFun(_modelService.getAll,postData, jtParams);
                },*/
            },

            fields: {

               
                //此处开始循环数据
                 
                id: {
                    title: '编号',
                    key: true,
                    list: true,
                    width:'3%'
                },
                realName: {
                    title: '姓名',
                    width: '6%'
                },
                account: {
                    title: '登录账号',
                    width: '3%'
                },
                mobile: {
                    title: '联系方式',
                    width: '6%'
                },
                weixin: {
                    title: '微信账号',
                    width: '5%',
                },
                qq: {
                    title: 'QQ',
                    width: '5%',
                },
/*                balance: {
                    title: '账号余额(元）',
                    width: '4%',
                    display:function(data){
                        return '<span style="color:#ff0000">'+(data.record.balance/100).toFixed(2)+'</span>';
                    }
                },*/
                availableLength: {
                    title: '可用时长（天）',
                    width: '5%',
                    key:false,
                    display:function(data){
                        return data.record.availableLength;
                    }

                },
                startTime: {
                    title: '启用时间',
                    width: '5%',
                    key:false,
                    display:function(data){
                        if(data.record.startTime)
                            return moment(data.record.startTime).format('YYYY年MM月DD日, h:mm:ss a');
                        else
                            return '';
                    }

                },
                endTime: {
                    title: '失效时间',
                    width: '5%',
                    key:false,
                    display:function(data){
                        if(data.record.endTime)
                            return moment(data.record.endTime).format('YYYY年MM月DD日, h:mm:ss a');
                        else
                            return '';
                    }
                },
                state: {
                    title: '账号状态',
                    width: '4%',
                    display:function(data){
                        return '<span style="'+(data.record.state==1?'color:#00ff00':data.record.state==0?'color:#ff0000':'color:#0000ff')+'">'+(data.record.state==2?'未激活':data.record.state==1?'正常':data.record.state==0?'停用':'删除')+'</span>';
                    }
                },
                    actions: {
                        title:'操作',
                        sorting: false,
                        display: function (data) {
                            var $span = $('<span style="display:flex;flex-direction:row;justify-content:center;"></span>');
                            //编辑

                            $('<button class="btn btn-primary btn-xs" title="编辑"><i class="fa fa-edit">编辑</i></button>')
                                    .appendTo($span)
                                    .click(function () {
                                        EditModel(data.record);
                                    });
                            //暂停账号

                            $('<button class="btn btn-primary btn-xs" title="'+((data.record.state==1 || data.record.state==2)?'停用账号':(data.record.state==0 || data.record.state==3)?'启用账号':'')+'"><i class="fa fa-times">'+((data.record.state==1 || data.record.state==2)?'停用账号':(data.record.state==0 || data.record.state==3)?'启用账号':'')+'</i></button>')
                                .appendTo($span)
                                .click(function () {
                                    StopModel(data.record);
                                });
                            //删除

                            $('<button class="btn btn-danger btn-xs" title="删除"><i class="fa fa-times">删除</i></button>')
                                    .appendTo($span)
                                    .click(function () {
                                        deleteModel(data.record);
                                    });
                            $('<button class="btn btn-danger btn-xs" title="呼叫记录"><i class="fa fa-times">呼叫记录</i></button>')
                                .appendTo($span)
                                .click(function () {
                                    location.href='/admin/serviceTask/list?userId='+ data.record.id+"&n="+data.record.realName;
                                });
                         /*   $('<button class="btn btn-danger btn-xs" title="充值管理"><i class="fa fa-times">充值管理</i></button>')
                                .appendTo($span)
                                .click(function () {
                                    location.href='/admin/accountHistory/list?userId='+ data.record.id+"&n="+data.record.realName+"&type=0";
                                });
                            $('<button class="btn btn-danger btn-xs" title="消费记录"><i class="fa fa-times">消费记录</i></button>')
                                .appendTo($span)
                                .click(function () {
                                    location.href='/admin/accountHistory/list?userId='+ data.record.id+"&n="+data.record.realName+"&type=1";
                                });*/

                            return $span;
                        }
                    },
            }
        });

        function EditModel(model)
        {
            _$modal.off('show.bs.modal').on('show.bs.modal', function () {
                _$modal.find("input[name='id']").val(model.id);
                _$modal.find("input[name='account']").val(model.account);
                _$modal.find("input[name='realName']").val(model.realName);
                _$modal.find("input[name='mobile']").val(model.mobile);
                _$modal.find("input[name='qq']").val(model.qq);
                _$modal.find("input[name='weixin']").val(model.weixin);
                _$modal.find("input[name='availableLength']").val(model.availableLength);
                $("#passwordContainer").hide();
            });
            _$modal.modal("show");
        }
         

        //刷新表格信息
        $("#ButtonReload").click(function () {
            getModelList();
        });

        //暂停、启用账号
        function StopModel(model) {
            if(!confirm('是否要'+(model.state==1 || model.state==2?'停用':'启用')+'当前账号？'))
            {
                return;
            }
            if(model.state==1) //正常->停用
                model.state=0;
            else if(model.state==2) //未激活->停用
                model.state=3
            else if(model.state==0)//停用->正常
                model.state=1;
            else if(model.state==3)//停用->未激活
                model.state=2
            app.ajax({
                contentType: 'application/json',
                url:'/admin/user/update',
                data:JSON.stringify(model),
                method:"Post",
                success:function (data) {
                    getModelList();
                },
                error:function (error) {
                    alert(error.Message);
                }
            });
        }


        //模糊查询功能
        function getModelList(reload) {
            
            if (reload) {
                _$ListTable.jtable('reload');
            } else {
                _$ListTable.jtable('load', {
                    realName: $('#txtRealName').val()
                });
            }
        }
        //
        //删除当前product实体
        function deleteModel(product) {
            if (confirm('确定要删除该用户吗？'))
            {
                _modelService.delete({
                    id: product.id
                },
                function(data){
                    getModelList(true);
                },
                function(error){

                });
            }
        }

        //搜索
        $('#btnSearch').click(function (e) {
            e.preventDefault();
            e.stopPropagation();
            getModelList();
        });
        getModelList();
    });
})();

    /******上传图片功能*****************/

    //打开编辑器插入图片窗口
    function showEditorImageUploadForm() {
      
        $("#UploadImageModal").modal("show");
        $("#UploadImageModal #uploadImgBtn").off("click").on("click",function (e) {
            app.uploadImg(e, function (imgUrl) { editorInstances.insertImage('Description', imgUrl); }, 'fileToUpload1');
        });
    }
    //打开产品默认图片上传窗口
    function showDefaultImageUploadForm() {
        
        $("#UploadImageModal").modal("show");
        $("#UploadImageModal #uploadImgBtn").off("click").on("click",function (e) {
            app.uploadImg(e, function (imgUrl) { $("#HeaderImg").val(imgUrl); $("#ImgUrlShow").attr("src", imgUrl); }, 'fileToUpload1');
        });
    }

    //上传前的图片预览功能,只预览了第一张
    $("#fileToUpload1").change(function (e) {
        var file = e.delegateTarget.files[0];
        //在此可以对选择的文件进行判断:文件类型 文件大小等
        //.....

        var reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function (ret) {
            var picString = reader.result
            //预览图片
            $("#selImg").attr({ "src": picString });
            $("#selImg").css("width:50px;");
        }
    });
    

     /****** end 上传图片功能*****************/

