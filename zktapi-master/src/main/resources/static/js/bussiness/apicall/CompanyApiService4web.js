//package com.ih.api.service4web

//class  modelService4web {

function _modelServiceGetByName(name,id,callback)
{
    var url =  '/api/company/getByName';
    /* $.post(url,
             { name:name},function(data,result){
             if (callback)
                 callback(data);
                 });*/
    console.log("modelServiceGetByName---");
    // console.log(nameSet);
    //console.log( JSON.stringify( { name:nameSet.name,id:nameSet.id}  ));
    $.ajax({
    url: url,
    type: "POST",
    data:    { name:name.name,id:id.id}   ,
    contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    dataType: "text",
    success: function (result) {
    //console.log("GetByName--");
    //console.log(result);
    //console.log(JSON.parse(result));
    //console.log("---GetByName");
    if (callback)
        callback(JSON.parse(result));
},
    error: function(result)
    {  console.log("GetByName e--");
       console.log(result);
        // console.log(JSON.parse(result));
        //console.log("---GetByName");
    }
});

}


function _modelServiceCreate( model, callback)
{
    var url =  '/api/company/create';
    console.log(JSON.stringify(  model ));
    /*$.post(url,{model: model},
            function(data,result){
                 console.log("_modelServiceCreate:");
                    console.log(data);
               if (callback)
                   callback(data);
           },"application/json;charset=UTF-8");
*/

    $.ajax({
    url: url,
    type: "POST",
    data: JSON.stringify(  model),
    contentType: "application/json;charset=UTF-8",
    dataType: "text",
    success: function (result) {
    //console.log("create2--");
    //console.log(result);
    //console.log(JSON.parse(result));
    //console.log("---create");
    if (callback)
        callback(JSON.parse(result));
}
});
}

function  _modelServiceUpdate( model, callback)
{
    var url =  '/api/company/update';
    //contentType: "application/json;charset=UTF-8",
    /*           console.log(JSON.stringify( model ));
       $.post(url, model ,function(data,result,xhr){
         console.log("modelServiceUpdate---");
         console.log(data);
         if (callback)
            callback(data);
         },"application/json;charset=UTF-8");
         */
    /* ok*/
    $.ajax({
    url: url,
    type: "POST",
    data: JSON.stringify( model ),
    contentType: "application/json;charset=UTF-8",
    dataType: "text",
    success: function (result) {
   // console.log("update2--");
    //console.log(result);
    //console.log(JSON.parse(result));
    //console.log("---update");
    if (callback)
        callback(JSON.parse(result));
}
});

}

function _modelServiceDelete(id,callback, errCallback)
{
    var url =  '/api/company/delete';
    /* $.post (url ,{ id:id.toString()}
              ,function(result)
              { console.log("del");
                console.log(result)
               if (result.data.status == 'ok')
                 {
                  console.log("delete--");
                  console.log(result);
                   console.log("---delete");
                    callback(JSON.parse(result) );
               }
               else if (errCallback) {
                 errCallback(JSON.parse(result));
                               }
             });*/
    console.log("_modelServiceDelete2:");
    console.log(id);
    $.ajax({
    url: url,
    type: "POST",
    data: {id:id} ,//JSON.stringify( id ),
    contentType: "application/x-www-form-urlencoded;charset=UTF-8",
    dataType: "text",
    success: function (result) {
    //   console.log("del2--");
    // console.log(result);
    // console.log(JSON.parse(result));
    //  console.log("---del");
    if (callback)
        callback(JSON.parse(result));
}
});
    //console.log("_---modelServiceDelete2:");
}

function getByID(id , callback, errCallback)
{
    if ( useTestedData && callback)
    {
        var companyList = {
            status: 'ok',
            data: {
            id: 1, name: '公司1',parentID:-1,status:1
        }
        };
        if (   callback)
            callback(JSON.stringify( companyList.data));
    }
    else {
        var url =  '/api/company/get';
        $.get (url + '?id=' + id.toString()
        ,function(result)
        {
            console.log(result)
            if (result.status == 'ok')
            {
                // console.log("result--");
                //console.log(result);
                //console.log("---result");
                callback(JSON.stringify( result.data));
            }
            else if (errCallback) {
                errCallback(result.message);
            }
        });
    }
}

function getCompanyList(page , pageSize , callback, errCallback)
{  var useTestedData = false;
    if ( useTestedData && callback)
    {
        var companyList = {
            status: 'ok',
            data: {
            PageIndex: 1,
            PageSize: 100,
            Count: 4,
            rows: [{id: 1, name: '公司1',parentID:-1,status:1},
            {id: 2, name: '公司2',parentID:-1,status:1},
            {id: 3, name: '公司32' ,parentID:2,status:1},
            {id: 4, name: '公司42',parentID :2,status:1}]
        }
        };
        if (   callback)
            callback(JSON.stringify( companyList.data));
    }
    else {
        var url =  '/api/getCompanyList';
        $.get (url + '?parentID=-1&pageIndex=' + page.toString() + '&pageSize=' + pageSize.toString()
        ,function(result)
        {
            console.log(result)
            if (result.status == 'ok')
            {
                //  var list = result.data.rows;
                // result.data.list = list;
                //  console.log("result--");
                // console.log(result);
                // console.log("---result");
                callback(JSON.stringify( result.data));

            }
            else if (errCallback) {
                errCallback(result.message);
            }
        });
    }
}
//}//class

