var app = {
    /*
    创建分页函数
    getList:对应获取列表数据的具体函数
    postData:post方式提交的参数
    jtParams:jtable上传的查询参数，一般包括：SkipCount，jtStartIndex，jtSorting
    */
    createPagingFun: function (getList, postData, jtParams) {
        return $.Deferred(function ($dfd) {
            getList($.extend({}, { MaxResultCount: jtParams.jtPageSize, SkipCount: jtParams.jtStartIndex, Sorting: jtParams.jtSorting }, postData))
               .done(function (data) { $dfd.resolve({ Result: "OK", Records: data.items, TotalRecordCount: data.totalCount }); })
                .fail(function () { $dfd.reject(); });
        });
    },
    
    //上传图片到服务器
    ///fileToUpload:上传控件的id
    uploadImg: function (e, callback,fileToUpload) {
        fileToUpload = fileToUpload || "fileToUpload1";
        e.preventDefault();
        e.stopPropagation();
        var formdata = new FormData();
        var fileObj = document.getElementById(fileToUpload).files;
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
            var arr = data.Paths.split(',');
            var sizes = data.imgSize.split(',');
            for (var i = 0; i < arr.length; i++) {
                var sizeItem=sizes[i].split(':');//每张图片的：宽:高
                callback && callback(arr[i],sizeItem[0],sizeItem[1]);
            }
            $("#UploadImageModal").modal('hide');
        }, function () {
            //failCal
            alert('error ocuse');
        });
        return false;
    },
    /* 获取url中的关键字参数*/
    queryString: function (name) {
        var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)");
        var r = window.location.search.substr(1).match(reg);
        if (r != null) return decodeURIComponent(r[2]); return null;
    },
    
    //getTopCategories: function (clist, parentCode, incloudParent) {
    //    var arr = [];//['<option value="0">请选择分类</option> '];
    //    var findParent = false;
    //    for (var i = 0; i < clist.length; i++) {
    //        if (clist[i].code == parentCode) {
    //            findParent = true;
    //            var suffix = "";
    //            var item = clist[i];
    //            //arr.push($("<option>").val(item.id).text(item.name));
    //            if (incloudParent) {
    //                arr.push("<option value='" + item.id + "'>" + item.name + "</option>");
    //                suffix += "----";
    //            }
    //            for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix) ; j < subs.length; j++) {
    //                arr.push(subs[j]);
    //            }
    //            // arr.push({ id: clist[i].id, name: clist[i].name, parentID: 0, branches: getSubCategories(clist[i].id,clist)});
    //            break;
    //        }
    //    }
    //    if (!findParent) {
    //        for (var i = 0; i < clist.length; i++) {
    //            if (clist[i].parentCode == parentCode) {
    //                findParent = true;
    //                var suffix = "";
    //                var item = clist[i];
    //                //arr.push($("<option>").val(item.id).text(item.name));
    //                arr.push("<option value='" + item.id + "'>" + item.name + "</option>");
    //                for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix + "----") ; j < subs.length; j++) {
    //                    arr.push(subs[j]);
    //                }
    //                // arr.push({ id: clist[i].id, name: clist[i].name, parentID: 0, branches: getSubCategories(clist[i].id,clist)});
    //            }
    //        }
    //    }

    //    return arr;
    //},
    //getSubCategories:function(parentID, clist, suffix) {
    //    var arr = [];
    //    for (var i = 0; i < clist.length; i++) {
    //        if (clist[i].parentID == parentID) {
    //            var item = clist[i];
    //            arr.push($("<option>").val(item.id).text(suffix + item.name));
    //            for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix + "----") ; j < subs.length; j++) {
    //                arr.push(subs[j]);
    //            }
    //            //arr.push({ id: clist[i].id, name: clist[i].name, parentID: parentID, branches: getSubCategories(clist[i].id, clist) });
    //        }
    //    }
    //    return arr;
    //}
    //,
    getCategoryName:function(category) {
        return category.name?category.name:category.nameEN?category.nameEN:category.nameKR;
    },
    getTopCategories: function (clist, parentCode, incloudParent, formatFun) {
        formatFun = formatFun || function (category, suffix) { return "<option value='" + category.id + "'>" + suffix + app.getCategoryName(category) + "</option>"; };
        var arr = [];//['<option value="0">请选择分类</option> '];
        var findParent = false;
        for (var i = 0; i < clist.length; i++) {
            if (clist[i].code == parentCode) {
                findParent = true;
                var suffix = "";
                var item = clist[i];
                //arr.push($("<option>").val(item.id).text(item.name));
                if (incloudParent) {
                    arr.push(formatFun(item,suffix));
                   // arr.push("<option value='" + item.id + "'>" + item.name + "</option>");
                    suffix += "----";
                }
                for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix, formatFun) ; j < subs.length; j++) {
                    arr.push(subs[j]);
                }
                // arr.push({ id: clist[i].id, name: clist[i].name, parentID: 0, branches: getSubCategories(clist[i].id,clist)});
                break;
            }
        }
        if (!findParent) {
            for (var i = 0; i < clist.length; i++) {
                if (clist[i].parentCode == parentCode) {
                    findParent = true;
                    var suffix = "";
                    var item = clist[i];
                    //arr.push($("<option>").val(item.id).text(item.name));
                    arr.push(formatFun(item, suffix));
                    //arr.push("<option value='" + item.id + "'>" + item.name + "</option>");
                    for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix + "----", formatFun) ; j < subs.length; j++) {
                        arr.push(subs[j]);
                    }
                    // arr.push({ id: clist[i].id, name: clist[i].name, parentID: 0, branches: getSubCategories(clist[i].id,clist)});
                }
            }
        }

        return arr;
    },
    getSubCategories: function (parentID, clist, suffix, formatFun) {
        formatFun = formatFun || function (category, suffix) { return "<option value='" + category.id + "'>" + suffix + app.getCategoryName(category) + "</option>"; };
        var arr = [];
        for (var i = 0; i < clist.length; i++) {
            if (clist[i].parentID == parentID) {
                var item = clist[i];
                arr.push(formatFun(item,suffix));
              //  arr.push($("<option>").val(item.id).text(suffix + item.name));
                for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix + "----", formatFun) ; j < subs.length; j++) {
                    arr.push(subs[j]);
                }
                //arr.push({ id: clist[i].id, name: clist[i].name, parentID: parentID, branches: getSubCategories(clist[i].id, clist) });
            }
        }
        return arr;
}
  

}

$(document).ready(function () {
    if (!abp.session.userId || abp.session.userId == 0)
    {
        location.href = "/Account/Login";
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
    
        //选定菜单
        var CURRENT_URL = window.location.href.split('#')[0];
        var $SIDEBAR_MENU = $('#sidebar-menu');
        $SIDEBAR_MENU.find('a[href="' + CURRENT_URL + '"]').parent('li').addClass('current-page');
        $SIDEBAR_MENU.find('a').filter(function () {
            return this.href == CURRENT_URL;
        }).parent('li').addClass('current-page').parents('ul').slideDown(function () {
            //setContentHeight();
        }).parent().addClass('active');
     
});

/*
 用来管理编辑器的对象（配合wysihtml5编辑器）
*/
var editorInstances ={
    
    editorList: [{ textareaID: null, editorInstance: null }],//编辑器列表
    /*
       包装textarea为编辑器
        editorID:要包装的textarea的ID
    */
    createEditor:function(editorID,toolbar)
    {
        if (!toolbar) toolbar = "toolbar";
        var editorInstance = new wysihtml5.Editor(editorID, {
            toolbar: toolbar,
            stylesheets: ["/Content/bootstrap.css", "/css/editor/wysiwyg.css"],
            parser: function (html) {
                return html;
            }
            //parserRules: wysihtml5ParserRules
        });
        this.editorList.push({ textareaID:editorID, editorInstance: editorInstance });
    },
    getValue: function (editorID) {
        for (var i = 0; i < this.editorList.length; i++) {
            if (this.editorList[i].textareaID && this.editorList[i].textareaID == editorID) {
                if (this.editorList[i].editorInstance) {
                   return this.editorList[i].editorInstance.getValue();
                    //this.editorList[i].editorInstance.composer.commands.exec("insertHTML", value);
                }
                break;
            }
        }
        return "";
    },
    /*
    为编辑器设置内容
    editorID：被包装的textarea的ID
    value：要设置的内容
    */

    setEditorValue:function(editorID, value) {
        for (var i = 0; i < this.editorList.length; i++) {
            if (this.editorList[i].textareaID && this.editorList[i].textareaID == editorID) {
                if (this.editorList[i].editorInstance) {
                    this.editorList[i].editorInstance.setValue(value);
                    //this.editorList[i].editorInstance.composer.commands.exec("insertHTML", value);
                }
                break;
            }
        }

    },
    insertImage:function(editorID,imageUrl)
    {
        for (var i = 0; i < this.editorList.length; i++) {
            if (this.editorList[i].textareaID && this.editorList[i].textareaID == editorID) {
                if (this.editorList[i].editorInstance) {
                    this.editorList[i].editorInstance.composer.commands.exec("insertImage", { src: imageUrl, alt: "" });
                    
                }
                break;
            }
        }
    },
    insertImageEx: function (editorID, imageUrl) {
        for (var i = 0; i < this.editorList.length; i++) {
            if (this.editorList[i].textareaID && this.editorList[i].textareaID == editorID) {
                if (this.editorList[i].editorInstance) {
                    this.editorList[i].editorInstance.composer.commands.exec("insertImageEx", { src: imageUrl, alt: "" });

                }
                break;
            }
        }
    },
    insertHTML: function (editorID, value) {
        for (var i = 0; i < this.editorList.length; i++) {
            if (this.editorList[i].textareaID && this.editorList[i].textareaID == editorID) {
                if (this.editorList[i].editorInstance) {
                    this.editorList[i].editorInstance.setValue(value);
                    //this.editorList[i].editorInstance.composer.commands.exec("insertHTML", value);
                }
                break;
            }
        }

    },
//清空编辑器
  clearEditor:function(editorID) {
      for (var i = 0; i < this.editorList.length; i++) {
          if (this.editorList[i].textareaID && this.editorList[i].textareaID == editorID) {
              if (this.editorList[i].editorInstance) {
                  this.editorList[i].editorInstance.clear();
            }
            break;
        }
    }
}

};

