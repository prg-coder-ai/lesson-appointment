var CategoryModule = {
    rootCode:0,//服务顶级分类
    code: 3000000000000000,
    allCategoryList: [],//当前分类下所有子分类
    createNavigation:function(category)//输出导航
    {
        var nav = [];
        if (category)
        {
            nav.push('<a class="current" href="?code=' + category.code + '">' + (category.name ? category.name : category.nameEN ? category.nameEN : category.nameKR) + '</a>');
        }
        while (category && category.parentID > 0)
        {
            var item = _.find(CategoryModule.allCategoryList, function (item) { return item.id == category.parentID; });
            if(item)
            {
                nav.unshift('<a href="?code='+item.code+'">'+(item.name?item.name:item.nameEN?item.nameEN:item.nameKR)+'</a>')
            }
            category = item;
        }
        nav.unshift('<a class="tip-bottom" href="/Admin/Home/Index">Home</a>');
        $("#breadcrumb").html(nav.join(""));

        $("#h1CategoryName").text(category.name);

    }
};
(function () {

    $(function () {
        if (app.queryString("code")) {
            CategoryModule.code = app.queryString("code");
        }
        abp.services.app.productCategory.getPagedProductCategoriesAsync({ CategoryCode: CategoryModule.rootCode,IncludeParent:true, MaxResultCount: 300, SkipCount: 0, Sorting: "ID ASC" }).done(function (data) {
            CategoryModule.allCategoryList = data.items;
            var item = _.find(data.items, function (itm) { return itm.code == CategoryModule.code; });
            CategoryModule.createNavigation(item);
        });
        abp.services.app.productCategory.getPagedProductCategoriesAsync({ CategoryCode: CategoryModule.code, IncludeParent: true, MaxResultCount: 300, SkipCount: 0, Sorting: "ID ASC" }).done(function (data) {
           
            console.log(data.items.length);
            //var item = _.find(data.items, function (itm) { return itm.code == CategoryModule.code; });
            //if (item) {
            //    $("#categoryName").text(item.name);
            //}
            var opts = app.getTopCategories(data.items, CategoryModule.code, true).join("");
            $("#ParentID").append(opts);

            //var opts1 = app.getTopCategories(data.items, CategoryModule.code, true, function (category, suffix) { return "<option value='" + category.code + "'>" + suffix + category.name + "</option>"; }).join("");
            //$("#SearchCategoryID").append(opts1);

        });

        var _$productCategoryTable = $('#ProductCategoryTable');
        var _productCategoryService = abp.services.app.productCategory;

        var _permissions = {
            create: abp.auth.hasPermission("Pages.Product.CreateProductCategory"),
            edit: abp.auth.hasPermission("Pages.Product.EditProductCategory"),
            delete: abp.auth.hasPermission("Pages.Product.DeleteProductCategory")
        };
        var _$modal = $('#ProductCategoryCreateModal');
        var _$form = _$modal.find('form');

        $("#btnAddProductCategory").on("click", function () {

            _$modal.modal("show");
            _$modal.find("input[name='Id']").val('');
            _$modal.find("input[name='IsShowProductDetail']").prop("checked", false);
            _$modal.find("input[name='Code']").val('');

            _$modal.find("input[name='Name']").val('');
            _$modal.find("input[name='Description']").val('');
            _$modal.find("input[name='Img']").val('');
            _$modal.find("#ImgUrlShow").attr('src', '');
            _$modal.find("input[name='TitleImg']").val('');
            _$modal.find("#TitleImgUrlShow").attr('src', '');

            _$modal.find("input[name='NameEN']").val('');
            _$modal.find("input[name='ImgEN']").val('');
            _$modal.find("input[name='DescriptionEN']").val('');
            _$modal.find("#ImgUrlShowEN").attr('src', '');
            _$modal.find("input[name='TitleImgEN']").val('');
            _$modal.find("#TitleImgUrlShowEN").attr('src', '');

            _$modal.find("input[name='NameKR']").val('');
            _$modal.find("input[name='ImgKR']").val('');
            _$modal.find("input[name='DescriptionKR']").val('');
            _$modal.find("#ImgUrlShowKR").attr('src', '');
            _$modal.find("input[name='TitleImgKR']").val('');
            _$modal.find("#TitleImgUrlShowKR").attr('src', '');

            _$modal.find("input[name='Sort']").val('0');
            _$modal.find("input[name='Link']").val('');
            _$modal.find("input[name='IsShow']").prop("checked",true);
            _$modal.find("select[name='ParentID']").val(0);
            _$modal.find("input[name='ShowNavigation']").prop("checked", true);

            _$modal.find("#btnDelImgUrlCN").css('display','none');
            _$modal.find("#btnDelTitleImgCN").css('display', 'none');
            _$modal.find("#btnDelImgUrlEN").css('display', 'none');
            _$modal.find("#btnDelTitleImgEN").css('display', 'none');
            _$modal.find("#btnDelImgUrlKR").css('display', 'none');
            _$modal.find("#btnDelTitleImgKR").css('display', 'none');
        });

        _$form.validate();

        _$form.find('.submit').click(function (e) {

            e.preventDefault();
            //var ProductName = _$form.find('input[name="ProductName"]').val();
            //if (!ProductName)
            //{

            //    abp.notify.error('请输入业务名称！', '错误提示');
            //    return;
            //}
            //var Description = _$form.find('#Description').val();
            //if (!Description) {
            //    abp.message.error('请输入业务描述！', '错误提示');
            //    return;
            //}

            if (!_$form.valid()) {
                return;
            }

            var productCategory = _$form.serializeFormToObject();
            productCategory.IsShow = $("input[name='IsShow']").prop("checked");
            productCategory.ShowNavigation = $("input[name='ShowNavigation']").prop("checked");


            abp.ui.setBusy(_$modal);
            _productCategoryService.createOrUpdateProductCategoryAsync({ ProductCategoryEditDto: productCategory }).done(function () {
                _$modal.modal('hide');
                abp.event.trigger('app.createOrEditProductCategoryModalSaved');
            }).always(function () {
                abp.ui.clearBusy(_$modal);
            });
        });

        _$modal.on('shown.bs.modal', function () {
            _$modal.find('input:not([type=hidden]):first').focus();
        });

        _$productCategoryTable.jtable({
            pageList: "normal",
            title: '',
            paging: true,
            //selecting: true,
            //selectingCheckboxes :true,
            pageSizes: [10, 15],
            pageSize: 10,
            sorting: true,
            defaultSorting: "Sort DESC, ID Desc",
            //  multiSorting: true,
            actions: {
                listAction: function (postData, jtParams) {
                    return app.createPagingFun(_productCategoryService.getPagedSonCategoriesAsync, $.extend(postData, { CategoryCode: CategoryModule.code}), jtParams);
                },
            },
            fields: {
                //此处开始循环数据
                id: {
                    key: true,
                    list: true,
                    title: '编号',
                    width: '3%'
                },
                name: {
                    title: '名称(中文）',
                    width: '10%',
                    display: function (data) {
                        return data.record.name ? data.record.name : '<div class="middle-in-td">--</div>';
                    }
                },
                description: {
                    title: '描述(中文）',
                    width: '8%',
                    display: function (data) {
                        return data.record.description ? data.record.description : '<div class="middle-in-td">--</div>';
                    }
                },
                img: {
                    title: '图片(中文）',
                    width: '8%',
                    display: function (data) {
                        return data.record.img ? '<div class="middle-in-td"><img src="' + data.record.img + '" style="width:100px;" /></div>' : '<div class="middle-in-td">--</div>';
                    }
                },
                nameEN: {
                    title: '名称(英文）',
                    width: '10%',
                    display: function (data) {
                        return data.record.nameEN ? data.record.nameEN : '<div class="middle-in-td">--</div>';
                    }
                },
                descriptionEN: {
                    title: '描述(英文）',
                    width: '8%',
                    display: function (data) {
                        return data.record.descriptionEN ? data.record.descriptionEN : '<div class="middle-in-td">--</div>';
                    }
                },
                imgEN: {
                    title: '图片(英文）',
                    width: '8%',
                    display: function (data) {
                        return data.record.imgEN ? '<div class="middle-in-td"><img src="' + data.record.imgEN + '" style="width:100px;" /></div>' : '<div class="middle-in-td">--</div>';
                    }
                },
                nameKR: {
                    title: '名称(韩文）',
                    width: '10%',
                    display: function (data) {
                        return data.record.nameKR ? data.record.nameKR : '<div class="middle-in-td">--</div>';
                    }
                },
                descriptionKR: {
                    title: '描述(韩文）',
                    width: '8%',
                    display: function (data) {
                        return data.record.descriptionKR ? data.record.descriptionKR : '<div class="middle-in-td">--</div>';
                    }
                },
                imgKR: {
                    title: '图片(韩文）',
                    width: '8%',
                    display: function (data) {
                        return data.record.imgKR ? '<div class="middle-in-td"><img src="' + data.record.imgKR + '" style="width:100px;" /></div>' : '<div class="middle-in-td">--</div>';
                    }
                },
                IsShow: {
                    title: '是否显示',
                    width: '8%',
                    display: function (data) {
                        return data.record.isShow ? '是' : '否';
                    }
                },
                parentCategoryName: {
                    title:'父分类',
                    width: '7%'
                },
                //isShowProductDetail: {
                //    title: '是否显示内容详情',
                //    width: '10%'
                //},
                //parentID: {   
                //    title: '父分类ID',
                //    width: '15%'
                //},
                actions: {
                    title: '操作',
                    width: '24%',
                    sorting: false,
                    display: function (data) {
                        var $div = $('<div style="margin:0 auto;width:100%;display:flex;flex-direction:column;"></div>');
                        var $container1 = $("<div style='display:flex;flex-direction:row;'></div>").appendTo($div);
                        //编辑
                        if (_permissions.edit) {
                            $('<button class="btn btn-primary btn-xs" title="' + abp.localization.localize('Edit', 'Hill') + '"><i class="fa fa-edit">编辑</i></button>')
                                .appendTo($container1)
                                .click(function () {
                                    EditProductCategory(data.record);
                                });
                        }
                        
                        //删除
                        if (_permissions.delete) {
                            $('<button class="btn btn-danger btn-xs" title="' + abp.localization.localize('Delete', 'Hill') + '"><i class="fa fa-times">删除</i></button>')
                                .appendTo($container1)
                                .click(function () {
                                    deleteProductCategory(data.record);
                                });
                        }

                        //管理子分类
                        if (_permissions.edit) {
                            $('<div><button class="btn btn-success btn-xs" title="' + abp.localization.localize('Edit', 'Hill') + '"><i class="fa fa-edit">管理子分类</i></button></div>')
                                .appendTo($div)
                                .click(function () {
                                    location.href = '?code=' + data.record.code;
                                });
                        }
                         
                        return $div;
                    }
                },

            }

        });

  
        function EditProductCategory(productCategory) {
            _$modal.off('show.bs.modal').on('show.bs.modal', function () {
                _$modal.find("input[name='Id']").val(productCategory.id);
                _$modal.find("input[name='IsShowProductDetail']").prop("checked", productCategory.isShowProductDetail); 
                _$modal.find("input[name='Code']").val(productCategory.code);


                _$modal.find("input[name='Name']").val(productCategory.name);
                _$modal.find("input[name='Description']").val(productCategory.description);
                _$modal.find("input[name='Img']").val(productCategory.img);
                _$modal.find("#ImgUrlShow").attr('src', productCategory.img);
                _$modal.find("input[name='TitleImg']").val(productCategory.titleImg);
                _$modal.find("#TitleImgUrlShow").attr('src', productCategory.titleImg);

                _$modal.find("input[name='NameEN']").val(productCategory.nameEN);
                _$modal.find("input[name='ImgEN']").val(productCategory.imgEN);
                _$modal.find("input[name='DescriptionEN']").val(productCategory.descriptionEN);
                _$modal.find("#ImgUrlShowEN").attr('src', productCategory.imgEN);
                _$modal.find("input[name='TitleImgEN']").val(productCategory.titleImgEN);
                _$modal.find("#TitleImgUrlShowEN").attr('src', productCategory.titleImgEN);

                _$modal.find("input[name='NameKR']").val(productCategory.nameKR);
                _$modal.find("input[name='ImgKR']").val(productCategory.imgKR);
                _$modal.find("input[name='DescriptionKR']").val(productCategory.descriptionKR);
                _$modal.find("#ImgUrlShowKR").attr('src', productCategory.imgKR);
                _$modal.find("input[name='TitleImgKR']").val(productCategory.titleImgKR);
                _$modal.find("#TitleImgUrlShowKR").attr('src', productCategory.titleImgKR);

                _$modal.find("input[name='Sort']").val(productCategory.sort);
                _$modal.find("input[name='Link']").val(productCategory.link);
                _$modal.find("input[name='IsShow']").prop('checked', productCategory.isShow);
                _$modal.find("select[name='ParentID']").val(productCategory.parentID);
                _$modal.find("input[name='ShowNavigation']").prop("checked", productCategory.showNavigation);

                _$modal.find("#btnDelImgUrlCN").css('display', productCategory.img?'inline':'none');
                _$modal.find("#btnDelTitleImgCN").css('display', productCategory.titleImg ? 'inline' : 'none');
                _$modal.find("#btnDelImgUrlEN").css('display', productCategory.imgEN ? 'inline' : 'none');
                _$modal.find("#btnDelTitleImgEN").css('display', productCategory.titleImgEN ? 'inline' : 'none');
                _$modal.find("#btnDelImgUrlKR").css('display', productCategory.imgKR ? 'inline' : 'none');
                _$modal.find("#btnDelTitleImgKR").css('display', productCategory.titleImgKR ? 'inline' : 'none');
            });
            _$modal.modal("show");
        }

        //刷新表格信息
        $("#ButtonReload").click(function () {
            getProductCategory();
        });

        //模糊查询功能
        function getProductCategory(reload) {

            if (reload) {
                _$productCategoryTable.jtable('reload');
            } else {
                _$productCategoryTable.jtable('load', {
                    FilterText: $('#ProductCategoryTableFilter').val()
                });
            }
        }
        //
        //删除当前product实体
        function deleteProductCategory(productCategory) {
            abp.message.confirm(
                abp.localization.localize('ProductDeleteWarningMessage', 'Hill'),
                    function (isConfirmed) {
                        if (isConfirmed) {
                            _productCategoryService.deleteProductCategoryAsync({
                                id: productCategory.id
                            }).done(function () {
                                getProductCategory(true);
                                abp.notify.success(abp.localization.localize('SuccessfullyDeleted', 'Hill'));
                            });
                        }
                    }
                );
        }



       
        //搜索
        $('#GetProductCategoriessButton').click(function (e) {
            e.preventDefault();
            getProductCategory();
        });

        //制作Product事件,用于请求变化后，刷新表格信息
        abp.event.on('app.createOrEditProductCategoryModalSaved', function () {
            getProductCategory(true);
        });

        getProductCategory();


    });
})();

//打开产品默认图片上传窗口
function showImageUploadForm(valueContainer,showContainer,delBtnID) {

    $("#UploadImageModal").modal("show");
    $("#UploadImageModal #uploadImgBtn").off("click").on("click", function (e) {
        app.uploadImg(e, function (imgUrl) {
            $("#" + valueContainer).val(imgUrl); $("#" + showContainer).attr("src", imgUrl);
            $("#" + delBtnID).css("display", "inline-block");

        });
    });
}

function deleteTitleImg(language)
{
    $("#TitleImg" + language).val(); $("#TitleImgUrlShow" + language).attr("src", '');
    $("#btnDelTitleImg" + (language == '' ? 'CN' : language)).css("display", "none");
}

function deleteMenuImg(language) {
    $("#Img" + language).val();
    $("#ImgUrlShow" + language).attr("src", '');
    $("#btnDelImgUrl" + (language == '' ? 'CN' : language)).css("display", "none");
}