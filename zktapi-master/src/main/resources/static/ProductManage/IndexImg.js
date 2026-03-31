var products = {
    categoryCode: 0
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
                $("#h1CategoryName").text(item.name);
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
            _$modal.find("#ImgUrlShowCN").attr('src', '');
            _$modal.find("#ImgUrlShowEN").attr('src', '');
            _$modal.find("#ImgUrlShowKR").attr('src', '');
            _$modal.find("#CategoryID").val('');
          
            _$modal.find("input[name='ImgUrlCN']").val('');
            _$modal.find("input[name='ImgUrlEN']").val('');
            _$modal.find("input[name='ImgUrlKR']").val('');
            //_$modal.find("input[name='Sort']").val('0');
            _$modal.find("input[name='Link']").val('');


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
                 
                productNameCN: {
                    title: '标题',
                    width: '20%',
                    display: function (data) {
                        return data.record.productNameCN ? data.record.productNameCN : '<div class="middle-in-td">--</div>';
                    }
                },
                imgUrlCN: {
                    title: '图片(中文）',
                    width: '20%',
                    display: function (data) {
                        return data.record.imgUrlCN ? '<img style="width:120px;" src="' + data.record.imgUrlCN + '" />' : '<div class="middle-in-td">未设置</div>';//data.record.imgUrlCN ? data.record.imgUrlCN : '<div class="middle-in-td">--</div>';
                    }
                },
                imgUrlEN: {
                    title: '图片(英文）',
                    width: '20%',
                    display: function (data) {
                        return data.record.imgUrlEN ? '<img style="width:120px;" src="' + data.record.imgUrlEN + '" />' : '<div class="middle-in-td">未设置</div>';//data.record.imgUrlCN ? data.record.imgUrlCN : '<div class="middle-in-td">--</div>';
                    }
                },
                imgUrlKR: {
                    title: '图片(韩文）',
                    width: '20%',
                    display: function (data) {
                        return data.record.imgUrlKR ? '<img style="width:120px;" src="' + data.record.imgUrlKR + '" />' : '<div class="middle-in-td">未设置</div>';//data.record.imgUrlCN ? data.record.imgUrlCN : '<div class="middle-in-td">--</div>';
                    }
                },
                //descriptionCN: {
                //    title: '内容',
                //    width: '20%',
                //    display: function (data) {
                //        return data.record.descriptionCN ? '<div class="middle-in-td"><i class="fa fa-check"></i></div>' : '<div class="middle-in-td">--</div>';
                //    }
                //},
                
                //imgUrl: {
                //    title: '图片',
                //    width: '6%',
                //    display: function (data) { return '<img style="width:100px;" src="' + data.record.imgUrl + '"/>';}
                //},

                categoryName: {
                    title: '分类名称',
                    width: '12%'
                },
                //attributes: {
                //    title:'描述', 
                //    width: '20%'
                //},
                //sort: {
                //    title: "显示顺序",
                //    width:'5%'
                //},
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
                        //删除
                        if (_permissions.delete) {
                            $('<button class="btn btn-danger btn-xs" title="删除"><i class="fa fa-times">删除</i></button>')
                                .appendTo($div)
                                .click(function () {
                                    deleteProduct(data.record);
                                });
                        }
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
                _$modal.find("input[name='ProductNameCN']").val(product.productNameCN);
                _$modal.find("#CategoryID").val(product.categoryID);
                _$modal.find("input[name='ImgUrlCN']").val(product.imgUrlCN);
                _$modal.find("input[name='ImgUrlEN']").val(product.imgUrlEN);
                _$modal.find("input[name='ImgUrlKR']").val(product.imgUrlKR);
                _$modal.find("[name='ImgUrlShowCN']").attr("src",product.imgUrlCN);
                _$modal.find("[name='ImgUrlShowEN']").attr("src", product.imgUrlEN);
                _$modal.find("[name='ImgUrlShowKR']").attr("src", product.imgUrlKR);
                _$modal.find("[name='ImgUrlShowCN']").css("display", "block");
                _$modal.find("[name='ImgUrlShowEN']").css("display", "block");
                _$modal.find("[name='ImgUrlShowKR']").css("display", "block");

                _$modal.find("input[name='Link']").val(product.link);
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


$(function () {
    // $('#Description').wysihtml5();
    //初始化编辑器
    //editorInstances.createEditor('Description');
});

var editorID = "Description";
function insertHtml()
{
editorInstances.insertHTML(editorID,"<div style='color:red;'>hello world</div>")

}
function insertImage() {
    showEditorImageUploadForm();
    //editorInstances.insertImage(editorID, "https://ss1.baidu.com/6ONXsjip0QIZ8tyhnq/it/u=3346039849,652983481&fm=173&app=25&f=JPG?w=218&h=146&s=17C243A75A73B3D2105863B703005002")
}

function showMenu(menuID)
{
    document.getElementsByClassName("wysihtml5-sandbox")[0].contentWindow.document.getElementById(menuID).style.display="";
}
function hideMenu(menuID) {
    document.getElementsByClassName("wysihtml5-sandbox")[0].contentWindow.document.getElementById(menuID).style.display = "none";
}
 
    /******上传图片功能*****************/

    //打开编辑器插入图片窗口
    function showEditorImageUploadForm() {
      
        $("#UploadImageModal").modal("show");
        $("#UploadImageModal #uploadImgBtn").off("click").on("click",function (e) {
            uploadImg(e, function (imgUrl) { editorInstances.insertImageEx('Description', imgUrl); });
        });
    }

    function showEditorImageUploadFormEx(callback) {

        $("#UploadImageModal").modal("show");
        $("#UploadImageModal #uploadImgBtn").off("click").on("click", function (e) {
            uploadImg(e, function (imgUrl) {
                callback && callback(imgUrl);
            });
        });
    }

    function addDivWithBgImg(event)
    {
         
        showEditorImageUploadFormEx(function (imgUrl) {
             editorInstances.insertHTML(editorID, '<div style="background:url(' + imgUrl + ') no-repeat 0 0;width:100%;min-height:100px;">&nbsp;</div><br/>'); 
        });
    }

    //打开产品默认图片上传窗口
    function showDefaultImageUploadForm(language) {
        
        $("#UploadImageModal").modal("show");
        $("#UploadImageModal #uploadImgBtn").off("click").on("click",function (e) {
            uploadImg(e, function (imgUrl) { $("#ImgUrl" + language).val(imgUrl); $("#ImgUrlShow" + language).attr("src", imgUrl); });
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
    

       //上传图片到服务器
    function uploadImg(e, callback) { 

            e.preventDefault();
            e.stopPropagation();
            
            var formdata = new FormData();
            var fileObj = document.getElementById("fileToUpload1").files;
            for (var i = 0; i < fileObj.length; i++)
                formdata.append("file" + i, fileObj[i]);
            $.ajax({
                type: 'POST',
                url: '/Admin/Images/Upload',
                data: formdata,
                /**
                *必须false才会自动加上正确的Content-Type
                */
                contentType: false,
                /**
                * 必须false才会避开jQuery对 formdata 的默认处理
                * XMLHttpRequest会对 formdata 进行正确的处理
                */
                processData: false
            }).then(function (data) {
                //alert(JSON.stringify(data));
                var arr = data.Paths.split(',');
                for (var i = 0; i < arr.length; i++) {
                    callback && callback(arr[i]);
                }
                $("#UploadImageModal").modal('hide');
            }, function () {
                //failCal
                alert('error ocuse');
            });
            return false;
        }
  
     /****** end 上传图片功能*****************/

