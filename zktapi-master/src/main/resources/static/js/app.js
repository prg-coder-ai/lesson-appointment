(function ($) {
    //serializeFormToObject plugin for jQuery
    $.fn.serializeFormToObject = function () {
        //serialize to array
        var data = $(this).serializeArray();

        //add also disabled items
        $(':disabled[name]', this).each(function () {
            data.push({name: this.name, value: $(this).val()});
        });

        //map to object
        var obj = {};
        data.map(function (x) {
            obj[x.name] = x.value;
        });

        return obj;
    };

    //Configure blockUI
    if ($.blockUI) {
        $.blockUI.defaults.baseZ = 2000;
    }

})(jQuery);

var app = {
    /*创建服务接口函数*/
    createService: function (name) {
        return {
            create: function (dataModel, successFun, errFun) {
                $.ajax({
                    contentType: 'application/json',
                    url: '/admin/' + name + "/create",
                    data: JSON.stringify(dataModel),
                    beforeSend: function (request) {
                        request.setRequestHeader("authorization", getToken());
                    },
                    method: "Post",
                    success: function (data) {
                        successFun && successFun(data);
                    },
                    error: function (error) {
                        errFun && errFun(error);
                    }
                });
            },
            update: function (dataModel, successFun, errFun) {
                $.ajax({
                    contentType: 'application/json',
                    url: '/admin/' + name + '/update',
                    data: JSON.stringify(dataModel),
                    method: "Post",
                    beforeSend: function (request) {
                        request.setRequestHeader("authorization", getToken());
                    },
                    success: function (data) {
                        successFun && successFun(data);
                    },
                    error: function (error) {
                        errFun && errFun(error);
                    }
                });
            },
            getAll: function (conditions, page, successFun) {
                var data = $.extend({}, conditions, page);
                console.log(JSON.stringify(data));
                $.ajax({
                    url: '/admin/' + name + "/getPaging",
                    data: data,
                    method: "Post",
                    beforeSend: function (request) {
                        request.setRequestHeader("authorization", getToken());
                    },
                    success: function (data) {
                        successFun && successFun(data);
                    },
                    error: function (error) {
                        return error;
                    }

                });
            },
            delete: function (dataModel, successFun, errFun) {
                $.ajax({
                    url: '/admin/' + name + "/delete",
                    data: dataModel,
                    method: "Post",
                    beforeSend: function (request) {
                        request.setRequestHeader("authorization", getToken());
                    },
                    success: function (data) {
                        successFun && successFun(data);
                    },
                    error: function (error) {
                        errFun && errFun(error);
                    }
                });
            },
            getByName: function (conditions, idExp, successFun, errFun) {
                var data = $.extend({}, conditions, idExp);
                $.ajax({
                    url: '/admin/' + name + "/getByName",
                    data: data,
                    method: "Post",
                    beforeSend: function (request) {
                        request.setRequestHeader("authorization", getToken());
                    },
                    success: function (data) {
                        successFun && successFun(data);
                    },
                    error: function (error) {
                        errFun && errFun(error);
                    }

                });
            },
            get: function (id, successFun) {
                $.ajax({
                    url: '/admin/' + name + "/get?id=" + id,
                    method: "Get",
                    beforeSend: function (request) {
                        request.setRequestHeader("authorization", getToken());
                    },
                    success: function (data) {
                        successFun && successFun(data);
                    },
                    error: function (error) {
                        return error;
                    }

                });
            }
        }
    },
    ajax: function (params) { //加上authorization头的ajax请求
        params.beforeSend = function (request) {
            request.setRequestHeader("authorization", getToken());
        };
        $.ajax(params);
    },

    //上传图片到服务器
    ///fileToUpload:上传控件的id
    uploadImg: function (e, callback, errCallback, fileToUpload) {
        fileToUpload = fileToUpload || "fileToUpload1";
        e.preventDefault();
        e.stopPropagation();
        var formdata = new FormData();
        var fileObj = document.getElementById(fileToUpload).files;
        for (var i = 0; i < fileObj.length; i++)
            formdata.append("file" + i, fileObj[i]);
        $.ajax({
            type: 'POST',
            url: '/admin/user/upload',
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
            if (data.error.length > 0) {
                errCallback && errCallback(data);
            }
            else {
                callback && callback(data.data.imgPath);
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
        if (r != null) return decodeURIComponent(r[2]);
        return null;
    },

    getCategoryName: function (category) {
        return category.name ? category.name : category.nameEN ? category.nameEN : category.nameKR;
    },
    getTopCategories: function (clist, parentCode, incloudParent, formatFun) {
        formatFun = formatFun || function (category, suffix) {
            return "<option value='" + category.id + "'>" + suffix + app.getCategoryName(category) + "</option>";
        };
        var arr = [];//['<option value="0">请选择分类</option> '];
        var findParent = false;
        for (var i = 0; i < clist.length; i++) {
            if (clist[i].code == parentCode) {
                findParent = true;
                var suffix = "";
                var item = clist[i];
                //arr.push($("<option>").val(item.id).text(item.name));
                if (incloudParent) {
                    arr.push(formatFun(item, suffix));
                    // arr.push("<option value='" + item.id + "'>" + item.name + "</option>");
                    suffix += "----";
                }
                for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix, formatFun); j < subs.length; j++) {
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
                    for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix + "----", formatFun); j < subs.length; j++) {
                        arr.push(subs[j]);
                    }
                    // arr.push({ id: clist[i].id, name: clist[i].name, parentID: 0, branches: getSubCategories(clist[i].id,clist)});
                }
            }
        }

        return arr;
    },
    getSubCategories: function (parentID, clist, suffix, formatFun) {
        formatFun = formatFun || function (category, suffix) {
            return "<option value='" + category.id + "'>" + suffix + app.getCategoryName(category) + "</option>";
        };
        var arr = [];
        for (var i = 0; i < clist.length; i++) {
            if (clist[i].parentID == parentID) {
                var item = clist[i];
                arr.push(formatFun(item, suffix));
                //  arr.push($("<option>").val(item.id).text(suffix + item.name));
                for (var j = 0, subs = app.getSubCategories(item.id, clist, suffix + "----", formatFun); j < subs.length; j++) {
                    arr.push(subs[j]);
                }
                //arr.push({ id: clist[i].id, name: clist[i].name, parentID: parentID, branches: getSubCategories(clist[i].id, clist) });
            }
        }
        return arr;
    }


}

$(document).ready(function () {
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
            $("#selImg").attr({"src": picString});
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



