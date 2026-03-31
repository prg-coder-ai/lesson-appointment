var products = {
    categoryCode: 0,
    cssList: { black: '深色', red: '红色' },//网站支持的所有样式
};
(function () {
   
    $(function () {
        if (app.queryString("code"))
        {
            products.categoryCode = app.queryString("code");
        }
        abp.services.app.productCategory.getPagedProductCategoriesAsync({ CategoryCode: products.categoryCode,IncludeParent:true, MaxResultCount: 300, SkipCount: 0, Sorting: "ID ASC" }).done(function (data) {
            console.log(data.items.length);
            var item = _.find(data.items, function (itm) { return itm.code == products.categoryCode; });
            if (item) {
                $("#categoryName").text(item.name);
                $("#h1CategoryName").text(item.name+'内容管理');
            }
            var opts = app.getTopCategories(data.items, products.categoryCode, true).join("");
            $("#CategoryID").append(opts);
           
            var opts1 = app.getTopCategories(data.items, products.categoryCode, true, function (category, suffix) { return "<option value='" + category.code + "'>" + suffix + category.name + "</option>"; }).join("");
            $("#SearchCategoryID").append(opts1);
        });

        abp.services.app.productCategory.getParentCategoriesAsync({ Id: products.categoryCode }).done(function (data) {
            console.log(JSON.stringify(data));
            var nav = [];
            var category = _.find(data, function (item) { return item.code == products.categoryCode; });
            if (category) {
                nav.push('<a class="current" href="?code=' + category.code + '">' + (category.name ? category.name : category.nameEN ? category.nameEN : category.nameKR) + '</a>');
            }
            while (category && category.parentID > 0) {
                var item = _.find(data, function (item) { return item.id == products.categoryCode; });
                if (item) {
                    nav.unshift('<a  href="?code=' + item.code + '">' + (item.name ? item.name : item.nameEN ? item.nameEN : item.nameKR) + '</a>')
                }
                category = item;
            }
            nav.unshift('<a class="tip-bottom" href="/Admin/Home/Index">Home</a>');
            $("#breadcrumb").html(nav.join(""));


        });
     
        var _$productsTable = $('#ProductsTable');
        var _productService = abp.services.app.product;
        
        var _permissions = {
            create: abp.auth.hasPermission("Pages.Product.CreateProduct"),
            edit: abp.auth.hasPermission("Pages.Product.EditProduct"),
            'delete': abp.auth.hasPermission("Pages.Product.DeleteProduct")

        };
        var _$modal = $('#ProductCreateModal');
        var _$form = _$modal.find('form');

        $("#btnAddProduct").on("click", function () {

            _$modal.modal("show");
            _$modal.find("input[name='Id']").val('');
            _$modal.find("input[name='ProductNameCN']").val('');
            _$modal.find("#CategoryID").val('');
            _$modal.find("input[name='DescriptionCN']").val('');
            _$modal.find("input[name='DescriptionEN']").val('');
            _$modal.find("input[name='DescriptionKR']").val('');

        });

        _$form.validate();

        _$form.find('.submit').click(function (e) {

            e.preventDefault();

           
            if (!_$form.valid()) {
                return;
            }

            var product = _$form.serializeFormToObject();

            abp.ui.setBusy(_$modal);
            _productService.createOrUpdateProductAsync({
                productEditDto: product
            }).done(function () {
                _$modal.modal('hide');
                abp.event.trigger('app.createOrEditProductModalSaved');
            }).always(function () {
                abp.ui.clearBusy(_$modal);
            });
        });

        _$modal.on('shown.bs.modal', function () {
            _$modal.find('input:not([type=hidden]):first').focus();
        });
    
        _$productsTable.jtable({
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
                listAction: function (postData, jtParams) {
                    return app.createPagingFun(_productService.getPagedProductsAsync, $.extend(postData, {CategoryCode:$("#SearchCategoryID").val()*1>0?$("#SearchCategoryID").val():products.categoryCode}), jtParams);
                   
                }, //abp.appPath + "api/product" 
                
            },

            fields: {

                //此处开始循环数据
                id: {
                    title:'编号',
                    key: true,
                    list: true
                },
                 
                //productNameCN: {
                //    title: '标题',
                //    width: '20%',
                //    display: function (data) {
                //        return data.record.productNameCN ? data.record.productNameCN : '<div class="middle-in-td">--</div>';
                //    }
                //},
                descriptionCN: {
                    title: '中文网站样式',
                    width: '20%',
                    display: function (data) {
                        return products.cssList[data.record.descriptionCN] ? products.cssList[data.record.descriptionCN] : '未设置';
                    }
                },
                descriptionEN: {
                    title: '英文网站样式',
                    width: '20%',
                    display: function (data) {
                        return products.cssList[data.record.descriptionEN] ? products.cssList[data.record.descriptionEN] : '未设置';
                    }
                },
                descriptionKR: {
                    title: '韩文网站样式',
                    width: '20%',
                    display: function (data) {
                        return products.cssList[data.record.descriptionKR] ? products.cssList[data.record.descriptionKR] : '未设置';
                    }

                },
                categoryName: {
                    title: '分类名称',
                    width: '12%'
                },
                actions: {
                    title: '操作',
                    width: '10%',
                    sorting: false,
                    display: function (data) {
                       
                        var $span = $('<span style="margin:0 auto;width:100%;display:flex;flex-direction:column;"></span>');
                        var $div = $('<div></div>');
                        //编辑
                        if (_permissions.edit) {
                            $('<button class="btn btn-primary btn-xs" title="编辑"><i class="fa fa-edit">编辑</i></button>')
                                .appendTo($div)
                                .click(function () {
                                    EditProduct(data.record);
                                });
                        }
                        ////删除
                        //if (_permissions.delete) {
                        //    $('<button class="btn btn-default btn-xs" title="删除"><i class="fa fa-times"></i></button>')
                        //        .appendTo($div)
                        //        .click(function () {
                        //            deleteProduct(data.record);
                        //        });
                        //}
                      
                        $div.appendTo($span);
                        
                        return $span;
                    }
                },

            }

        });
       

        //打开添加窗口SPA
        $('#CreateNewProductButton').click(function () {
            //可选生成的对话框大小{size:'lg'}or{size:'sm'}
            //需要到_createContainer方法中添加,_args.size
            _createOrEditModal.open();
        });

        function EditProduct(product)
        {
            _$modal.off('show.bs.modal').on('show.bs.modal', function () {
                _$modal.find("input[name='Id']").val(product.id);
                _$modal.find("input[name='ProductNameCN']").val(product.productNameCN || '网站样式设置');
                _$modal.find("#CategoryID").val(product.categoryID);
                _$modal.find("textarea[name='DescriptionCN']").val(product.descriptionCN);
                _$modal.find("textarea[name='DescriptionEN']").val(product.descriptionEN);
                _$modal.find("textarea[name='DescriptionKR']").val(product.descriptionKR);
            });
            _$modal.modal("show");
        }
         

        //刷新表格信息
        $("#ButtonReload").click(function () {
            getProducts();
        });




        //模糊查询功能
        function getProducts(reload) {
            
            if (reload) {
                _$productsTable.jtable('reload');
            } else {
                _$productsTable.jtable('load', {
                    FilterText: $('#ProductsTableFilter').val()
                });
            }
        }
        //
        //删除当前product实体
        function deleteProduct(product) {
            abp.message.confirm(
                abp.localization.localize('ProductDeleteWarningMessage', 'Hill'),
                    function (isConfirmed) {
                        if (isConfirmed) {
                            _productService.deleteProductAsync({
                                id: product.id
                            }).done(function () {
                                getProducts(true);
                                abp.notify.success(abp.localization.localize('SuccessfullyDeleted','Hill'));
                            });
                        }
                    }
                );
        }



        //导出为excel文档
        $('#ExportProductsToExcelButton').click(function () {
            _productService
                .getProductsToExcel({})
                    .done(function (result) {
                        app.downloadTempFile(result);
                    });
        });
        //搜索
        $('#GetProductsButton').click(function (e) {
            e.preventDefault();
            getProducts();
        });

        //制作Product事件,用于请求变化后，刷新表格信息
        abp.event.on('app.createOrEditProductModalSaved', function () {
            getProducts(true);
        });

       getProducts();
       
      
    });
})();
    