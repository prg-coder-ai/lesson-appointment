var product = {
    id: 0, 
    data:{descriptionCN:"",//中文内容
        descriptionEN:"",//英文内容
        descriptionKR:"",//韩文内容
    },
    widthSlider: null,//宽度调整器
    heightSlider: null,//高度调整器
    containerMarginSlider:null,//对象边距调整器
    blockWidthSlider: null,//容器宽度调整器
    blockMarginSlider: null,//容器边距调整器
    textWidthSlider: null,
    textWidthSlider0: null, //不同分辨率下的宽度
    textWidthSlider768: null,
    textWidthSlider992: null,
    textWidthSlider1200: null,
    textWidthSlider1440: null,
    textWidthSlider1600: null,
    textHeightSlider:null,
    topMarginSlider: null,
    rightMarginSlider: null,
    bottomMarginSlider: null,
    leftMarginSlider:null
};

//保存数据
$(document).ready(function () {
    $('button[name="btnSaveProduct"]').on("click", function () {
        if (mainApp.language == 'CN')
        {
            product.data.descriptionCN =JSON.stringify(mainApp.currentContent);
        }
        else if (mainApp.language == 'EN')
        {
            product.data.descriptionEN = JSON.stringify(mainApp.currentContent);
        }
        else 
        {
            product.data.descriptionKR = JSON.stringify(mainApp.currentContent);
        }
       
        $.ajax({
            type: "POST",
            url: "/api/services/app/product/UpdateProductAsync",
            data: product.data,
        }).then(function(data)
        {
            alert('保存成功！');
        }, function (e) {
            alert('保存数据时发生错误！'+JSON.stringify(e));
        });
    });
    $("#selLanguage").on("change", function () {
        mainApp.language = $(this).val();
        mainApp.setContent();
    });
});

//轮播图
Vue.component("carousel-layout", {
    data: function () {
        return {
            isShowMenu: false,
            //id: function () { return { id: id };}
        }
    },
    props: ['content'],
    template: '#carouselTemplate',
    methods: {
        showMenu: function () {
            this.isShowMenu = true;
        },
        hideMenu: function () {
            this.isShowMenu = false;
        }
    }
});

//单图片布局 -子组件
var imgItemLayout = Vue.extend({
    data: function () {
        return {
            isShowMenu: false,
            //id: function () { return { id: id };}
            cID: this.contentId,
            linkUrl: this.img.linkUrl,
        }
    },
    props: ['img','contentId'],
    template: '#imgItemTemplate',
    methods: {
        showMenu: function (e) {
            this.isShowMenu = true;
            //e.stopPropagation();
            //e.preventDefault();
        },
        hideMenu: function (e) {
            this.isShowMenu = false;
            //e.stopPropagation();
            //e.preventDefault();
        },
        imgClicked: function () {
            if (this.img.linkUrl && this.img.linkIsVideo)
            {
                Video.playVideo(this.img.linkUrl);
            }
            else if(this.img.linkUrl)
            {
                window.open(this.img.linkUrl, '', '', false);
              //  location.href = this.img.linkUrl;
            }
        }
    }
});

//容器布局
Vue.component("custom-layout", {
    data: function () {
        return {
            isShowMenu: false,
            //id: function () { return { id: id };}
            contentID: this.content.id,
        }
    },
    components: { 'img-item-layout': imgItemLayout },
    props: {
        content: { type: Object },
    },
    template: '#imgContainerTemplate',
    methods: {
        showMenu: function () {
            this.isShowMenu = true;
        },
        hideMenu: function () {
            this.isShowMenu = false;
        }
    },
    computed: {
        nestLevel: function () { //嵌套级别，或自己有多少个父级容器
            return this.content.componentPath.toString().split('-').length-1;
        },
        right:function() //设置菜单离右侧的距离
        {
            return (this.nestLevel * 20 + 10) + 'px';
        },
        zIndex: function () //子菜单在父菜单的上面
        {
            return (this.nestLevel + 9999);
        }
    }
});

//文本容器
Vue.component("text-component", {
    data: function () {
        return {
            isShowMenu: false,
        }
    },
    props: ["block"],
    template: '#textTemplate',
    methods: {
     
        showMenu: function () {
            this.isShowMenu = true;
        },
        hideMenu: function () {
            this.isShowMenu = false;
        }
    }
})

/*空容器（用户还未选择）*/
Vue.component("empty-container", {
    data: function () {
        return {
            isShowMenu: true,
            //id: function () { return { id: id };}
            id: 0,
            brother: this.brotherContent
        }
    },
    props:["brotherContent"],//传入相邻容器的ID，作为插入新容器的位置参考
    template: '#contentToolbar',
    methods: {
        showMenu: function () {
            this.isShowMenu = true;
        },
        hideMenu: function () {
            this.isShowMenu = false;
        }
    }
});

var mainApp = new Vue({
    el: '#app',
    data: {
        language: 'CN',
        imgPlacehold: '/images/placehold.png',
        eventHub: new Vue(),
        screenWidth:1920,
        currentContent: [
                //  { id: 1, componentName: 'text-component', componentPath: '1', text: 'hello world', containerStyle: {width:'100%',height:'200px',marginTop:'0px',marginRight:'0px',marginBottom:'0px',marginLeft:'0px'} },
               // { id: 1, componentName: "carousel-layout", componentPath: '1',imgs:[] },
                 // { id: 2, componentName: "custom-layout", containerStyle: '',componentPath:'2', childen: [{ id: 1, componentName: 'img', componentPath: '2-1', imgUrl: '/images/placehold.png', containerStyle: '', imgStyle: '', linkUrl: '', isBackgroundImg: false, width: 400, height: 200 }, { id: 2, componentName: 'custom-layout', componentPath: '2-2', containerStyle: '', childen: [{ id: 1, componentName: 'img', componentPath: '2-2-1', imgUrl: '/images/placehold.png', containerStyle: '', imgStyle: '', linkUrl: '', isBackgroundImg: false, width: 400, height: 200 }] }] },
                //{ id: 3, componentName: "horizontal-2-layout", imgUrl1: 'http://chi.jjprs.com/img/jj_con02_01_img_07.jpg', imgUrl2: 'http://chi.jjprs.com/img/jj_con02_01_img_07.jpg', containerStyle: '', imgStyle: '' },
                //{ id:4,componentName:"carousel-layout"},
        ],
    },
    ready: function () {
    },
    mounted: function () {
        this.screenWidth = $(document.body).width();
        this.initData();
    },
    created: function () {
        
        this.$root.eventHub.$on('append-img', function(e){ //新增单张图片
            mainApp.appendImg(e);
        });
        this.$root.eventHub.$on('delete-img', function (e) { //删除单张图片
            mainApp.deleteImg(e);
        });
        this.$root.eventHub.$on('change-img', function (e) { //修改或上传图片
            mainApp.uploadImg(e);
        });
        //this.$root.eventHub.$on('set-link', function(e) { //为图片添加链接地址
        //    mainApp.setImgLink(e);
        //});
        this.$root.eventHub.$on('delete-block', function (e) { //删除一个容器块儿
            mainApp.deleteBlock(e);
        });
        this.$root.eventHub.$on('img-to-background', function (e) { //将图片修改为div的背景图
            mainApp.changeImgToBackground(e);
        });
        this.$root.eventHub.$on('background-to-img', function (e) { //将容器背景转换为图片
            mainApp.changeBackgroundImgToImg(e);
        });
        this.$root.eventHub.$on('change-img-container-size', function (e) { //设置图片容器大小
            mainApp.setImgContainerSize(e);
        });
        this.$root.eventHub.$on('insert-container', function (e) { //新增容器
            mainApp.insertContainer(e);
            console.log('insertContainer');
        });
        this.$root.eventHub.$on('insert-container-inner', function (e) { //在容器内新增子容器
            mainApp.insertContainerInner(e);
            console.log('insert-Container-Inner');
        });
       
        this.$root.eventHub.$on('set-carousel-imgs', function (e) { //管理轮播图图片
            mainApp.setCarouselImgs(e);
            console.log('setCarouselImgs');
        });

        this.$root.eventHub.$on('change-block-size', function (e) { //调整Block容器大小
            mainApp.changeBlockSize(e);
            console.log('root changeBlockSize');
        });
        this.$root.eventHub.$on('change-block-style', function (e) { //调整Block容器布局等样式属性
            mainApp.changeBlockStyle(e);
            console.log('root changeBlockSize');
        });
        this.$root.eventHub.$on('set-text-container-style', function (e) { //调整text块儿样式属性
            mainApp.setTextContainerStyle(e);
            console.log('root setTextContainerStyle');
        });
        this.$root.eventHub.$on('append-text', function (e) { //增加text块儿
            mainApp.appendText(e);
            console.log('root appendText');
        });

        this.$root.eventHub.$on('edit-text', function (e) { //编辑text块儿
            mainApp.editText(e);
            console.log('root editText');
        });
        this.$root.eventHub.$on('set-video', function (e) { //为视频
            mainApp.setVideo(e);
            console.log('root setVideo');
        });
    },
    methods: {
        initData: function () {
            product.id = app.queryString("ID");
            $.ajax({
                type: 'POST',
                url: '/api/services/app/product/GetProductByIdAsync',
                data: { Id: product.id },
                dataType: 'json'
            }).then(function (data) {
                console.log(data);
                product.data = data.result;
                $("#productName").text(data.result.productNameCN || data.result.productNameEN || data.result.productNameKR);
                mainApp.setContent();
            }, function () {
                alert('获取数据时发生错误！');
            });
        },
        ///根据屏幕宽度返回对应组件宽度
        getAdaptationWidth: function (block) { 
            var width = '100%';
            if (this.screenWidth < 768) {
                width = block.width0;
            } else if (this.screenWidth >= 768 && this.screenWidth < 992) {
                width = block.width768;
            } else if (this.screenWidth >= 992 && this.screenWidth < 1200) {
                width = block.width992;
            } else if (this.screenWidth >= 1200 && this.screenWidth < 1440) {
                width =block.width1200;
            } else if (this.screenWidth >= 1440 && this.screenWidth < 1600) {
                width = block.width1440;
            } else if (this.screenWidth > 1600) {
                width = block.width1600;
            }
            return width;
        },
        setContent: function () {
            if (this.language == 'CN') {
                this.currentContent = JSON.parse(product.data.descriptionCN)|| [];
            } else if (this.language == 'EN') {
                this.currentContent = JSON.parse(product.data.descriptionEN) || [];
            } else   {
                this.currentContent = JSON.parse(product.data.descriptionKR) || [];
            }
        },
        getContent:function() //根据语言获取布局内容
        {
            return this.currentContent;
        },
        setVideo: function (event) { //编辑视频
            var img = this.getByComponentPath(event.componentPath);
            if (img) {
                Video.showVideoSetForm(img, function (newUrl,isVideo) {
                    img.linkUrl = newUrl;
                    img.linkIsVideo = isVideo;
                });
            }
        },
        editText: function (event) {   //编辑text块儿的文本
            var textBlock = this.getByComponentPath(event.componentPath);
            if(textBlock)
            {
                showEditTextForm(textBlock, function (newText) {
                    textBlock.text = newText;
                });
            }
        },
        changeBlockStyle: function (event) //调整Block容器布局等样式属性
        {
            console.log("changeBlockStyle emit componentPath:" + event.componentPath);

            var block = this.getByComponentPath(event.componentPath);
            if (block) {
                SetBlockStyleForm(block, function (newDirection) {
                    block.containerStyle.flexDirection = newDirection;
                    console.log('set block.changeBlockStyle.flexDirection' + block.containerStyle.flexDirection);
                });
            }
        },
        changeBlockSize: function (event)//调整Block容器大小
        {
            console.log("changeCarouselSize emit componentPath:" +event.componentPath);
          
            var block = this.getByComponentPath(event.componentPath);
            if (block) {
                SetBlockSizeForm(block, function (newWidth,newMargin) {
                    block.containerStyle.width = newWidth;//需要带单位传递:如 200px
                    block.containerStyle.margin = newMargin;
                    block.containerStyle.minWidth = '0%';
                    block.containerStyle.minHeight = 'auto';
                    console.log('set block.containerStyle.width' + block.containerStyle.width + '; margin' + block.containerStyle.margin);
                });
            }
           
        },
        setCarouselImgs: function (event)//管理轮播图图片
        {
            var block = this.getByComponentPath(event.componentPath);
            if (block) {
                block.imgs= block.imgs || [];
                CarouselManage.showCarouselImgsForm(block.imgs, function (imgList) {
                    block.imgs = imgList;
                });
            }
        },
        deleteBlock: function (event) {
            var componentPath = event.componentPath;
            //顶层block，直接删除
            if (componentPath.toString().split('-').length == 1)
            {
                var content = mainApp.getContent();
                if(content)
                {
                    var index = _.findIndex(content, function (item) { return item.id == componentPath; });
                    if (index != -1) {
                        content.splice(index, 1);
                    }
                }
                return;
            }
            //非顶层block
            var parent = this.getParentByComponentPath(componentPath);
            var blockID = _.last(componentPath.split('-'));
            if (parent && parent.childen && blockID>0) {
                var blockIndex = _.findIndex(parent.childen, function (item) { return item.id == blockID });
                parent.childen.splice(blockIndex, 1);
            }
        },
        uploadImg: function (event) {
            var componentPath = event.componentPath;
            console.log("$emit recevied componentPath:" + componentPath);
            var that=this;
            showEditorImageUploadFormEx(function (imgUrl,width,height) {
                var img =  that.getByComponentPath(componentPath);
                if (img)
                {
                    img.imgUrl = imgUrl;
                    img.realWidth = width+'px'; //图片真实的宽度
                    img.realHeight = height + 'px';//图片真实高度
                    img.containerStyle.minHeight = 'auto';
                    img.containerStyle.minWidth = '0%';
                    //img.width = '100';
                    //img.height = 'auto';
                }
            })
        },
        getByComponentPath: function (componentPath) { //根据ID路径获取子组件
            var content = mainApp.getContent();//顶级数组[]
            var IdArr = componentPath.toString().split('-');
            var obj = null;
            if (content.length>0 && IdArr.length>0)
            {
                obj = _.find(content, function (item) { return item.id == IdArr[0]; });//顶级父类
                var index = 1;
                while (index < IdArr.length && obj.childen && obj.childen.length > 0)
                {
                    obj = _.find(obj.childen, function (item) { return item.id == IdArr[index]; });
                    index++;
                }
            }
            return obj;
        },
        getParentByComponentPath: function (componentPath, level) { //根据ID路径获取子组件,level:父亲=1，祖父=2...
            if (!level) { level = 1;} //未传入该字段，则设为1，表示父节点
            var content = mainApp.getContent();//顶级数组[]
            var IdArr = componentPath.toString().split('-');
            if (IdArr.length < level + 1) { return null; }//传入的path的深度没有level大，则无法取到对应父节点
            var parents = [];
            if (content.length > 0 && IdArr.length > 0) {
                parents.push(_.find(content, function (item) { return item.id == IdArr[0]; }));//顶级父类
                var obj = _.find(content, function (item) {return item.id == IdArr[0];});
                var index = 1;
                while (index < IdArr.length && obj.childen && obj.childen.length > 0) {
                    parents.unshift(_.find(obj.childen, function (item) { return item.id == IdArr[index]; }));
                    obj = _.find(obj.childen, function (item) { return item.id == IdArr[index]; });
                    index++;
                }
            }
            return parents[level];
        },
        deleteImg:function(event)
        {
            //var gradPatherBlock = this.getParentByComponentPath(event.componentPath, 2); //图片的祖父节点
            var fatherBlock = this.getParentByComponentPath(event.componentPath);//父节点
            var imgID = _.last(event.componentPath.split('-'));
            console.log("$deleteImg emit componentPath:" + event.componentPath);
            if (fatherBlock) {
                //if (fatherBlock.childen.length == 1) { //父节点下只有这一张图片，则将父节点也删掉
                //    if (gradPatherBlock) {
                //        var blockIdx = _.findIndex(gradPatherBlock.childen, function (item) { return item.id == fatherBlock.id; });
                //        gradPatherBlock.childen.splice(blockIdx, 1);
                //        return;
                //    }
                    //else  //没有祖父节点，说明父节点直接在content数组(contentCN/contentEN/contentKR)中
                    //{
                    //    var content = this.getContent();
                    //    var fatherIndex = _.findIndex(content, function (item) { return item.id == fatherBlock.id; });
                    //    content.splice(fatherIndex, 1);
                    //    return;
                    //}
               // }
                var idx = _.findIndex(fatherBlock.childen, function (img) { return img.id == imgID; });
                fatherBlock.childen.splice(idx, 1);
               
            }

        },
        //setImgLink: function (event) { //
        //    var componentPath = event.componentPath;
        //    var imgID = _.last(componentPath.split('-'));
        //    var linkUrl = event.linkUrl;
        //    console.log("setImgLink emit   linkUrl:" + linkUrl + ";componentPath" + componentPath);
        //    var that = this;
        //    showSetLinkForm(linkUrl, function (newLink) {
        //        var img = that.getByComponentPath(componentPath);
        //        if (img) {
        //            img.linkUrl = newLink;
        //        }
        //    });
        //},
        changeImgToBackground: function (event) { //将图片转换为容器背景
            var componentPath = event.componentPath;
            var imgID = _.last(componentPath.split('-'));
            console.log("changeImgToBackground emit componentPath:" + componentPath);
            var img = this.getByComponentPath(componentPath);
            if (img)
            {
                img.isBackgroundImg = true;
            }
        },
        changeBackgroundImgToImg: function (event) { //将容器背景转换为图片
            var componentPath = event.componentPath;
            console.log("changeBackgroundImgToImg emit  componentPath:" + componentPath);
            var img = this.getByComponentPath(componentPath);
            if (img) {
                img.isBackgroundImg = false;
            }
        },
        setImgContainerSize: function (event) { //设置图片容器大小
            var componentPath = event.componentPath;
            console.log("setImgContainerSize emit  componentPath:" + componentPath);
            var img = this.getByComponentPath(componentPath);
            if (img) {
                SetContainerSizeForm(img, function (newWidth, newHeight,newMargin) {
                    img.width = newWidth;
                    img.height = newHeight;
                    img.containerStyle.margin = newMargin;
                    console.log(img.width + ";" + img.height + ',margin:' + img.containerStyle.margin);
                });
            }
        },
        setTextContainerStyle: function (event) { //设置文本块儿容器大小
            var componentPath = event.componentPath;
            console.log("setTextContainerSize emit  componentPath:" + componentPath);
            var block = this.getByComponentPath(componentPath);
            if (block) {
                SetContainerStyleForm(block, function (newWidth0, newWidth768, newWidth992, newWidth1200, newWidth1440, newWidth1600, newMinWidth, newHeight, newMinHeight, newMarginTop, newMarginRight, newMarginBottom, newMarginLeft, moreStyle) {
                    block.width0 = newWidth0;
                    block.width768 = newWidth768;
                    block.width992 = newWidth992;
                    block.width1200 = newWidth1200;
                    block.width1440 = newWidth1440;
                    block.width1600 = newWidth1600;
                    block.height = newHeight;
                    block.marginTop = newMarginTop;
                    block.marginRight = newMarginRight;
                    block.marginBottom = newMarginBottom;
                    block.marginLeft = newMarginLeft;
                    block.minWidth = newMinWidth;
                    block.minHeight = newMinHeight;
                    block.moreStyle = moreStyle;
                   // console.log('block style:' + JSON.stringify(block.containerStyle));
                });
            }
        },
        appendText: function (event) {
            var block = this.getByComponentPath(event.componentPath);
            if (block) {
                var textID = 1;
                if (block.childen && block.childen.length > 0) {
                    var maxText = _.max(block.childen, function (text) { return text.id; });
                    textID = maxText ? maxText.id + 1 : 1;
                }
                var text = { id: textID, componentName: 'text-component', componentPath: event.componentPath + '-' + textID, text: '文本块-' + event.componentPath + '-' + textID, containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }, width0: '100%', width768: '100%', width992: '100%', width1200: '100%', width1440: '100%', width1600: '100%', moreStyle: {} }
                block.childen.push(text);
                console.log(JSON.stringify(text));
            }
        },
        appendImg: function (event) {
            var block = this.getByComponentPath(event.componentPath);
            if (block) {
                var imgID = 1;
                if (block.childen && block.childen.length > 0) {
                    var maxImg = _.max(block.childen, function (img) { return img.id; });
                    imgID = maxImg ? maxImg.id + 1 : 1;
                }
                var img = { id: imgID, componentName: 'img', componentPath: event.componentPath + '-' + imgID, imgUrl: this.imgPlacehold, imgStyle: '', linkUrl: '', linkIsVideo: false, isBackgroundImg: false, containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }, width0: '100%', width768: '100%', width992: '100%', width1200: '100%', width1440: '100%', width1600: '100%', moreStyle: {} }
                block.childen.push(img);
                console.log(JSON.stringify(img));
            }
        },
        insertContainer: function (event) {
            var layoutID = event.id;
            var aimType = event.type;
            console.log("$insertContainer emit recevied iD:" + layoutID + "; type:" + aimType);
            var content = mainApp.getContent();
            if (content) {
              
                var idx = _.findIndex(content, function (item) { return item.id == layoutID });
                if(idx==-1) {idx=0;} else {idx+=1;}
                var newBlockID = 1;
                if (content.length>0) {
                    var maxIdItem = _.max(content, function (item) { return item.id; });
                    newBlockID = maxIdItem.id + 1;
                }
                var obj = {};
                if (aimType == 'img-container-type')//单图片容器
                {
                    obj = {
                        id: newBlockID, componentName: 'custom-layout', componentPath: newBlockID, childen: [
                           // { id: 1, componentName: 'img', componentPath: newBlockID + '-1', imgUrl: '/images/placehold.png', containerStyle: '', imgStyle: '', linkUrl: '', linkIsVideo: false, isBackgroundImg: false, height: 100, containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }, newWidth0: '100%', newWidth768: '100%', newWidth992: '100%', newWidth1200: '100%', newWidth1440: '100%', newWidth1600: '100%', moreStyle: {} }
                        ], containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px', flexDirection: 'row' }, width0: '100%', width768: '100%', width992: '100%', width1200: '100%', width1440: '100%', width1600: '100%', moreStyle: {}
                    };
                }
                else if(aimType == 'carousel-container-type') {//新增轮播图容器
                    obj = { id: newBlockID, componentName: 'carousel-layout', componentPath: newBlockID, imgs: [{ id: 1, imgUrl: '/images/bannerSample/1.jpg', link: '', sort: 1, width: 100, height: 100 }, { id: 2, imgUrl: '/images/bannerSample/2.jpg', link: '', sort: 2, width: 100, height: 100 }, { id: 3, imgUrl: '/images/bannerSample/3.jpg', link: '', sort: 3, width: 100, height: 100 }], containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }, width0: '100%', width768: '100%', width992: '100%', width1200: '100%', width1440: '100%', width1600: '100%', moreStyle: {} };
                }
                console.log(JSON.stringify(obj));
                content.splice(idx, 0, obj);
                //content.unshift(obj);
            }
        },
        insertContainerInner: function (event)//在容器内新增子容器
        {
            //var parentBlockID = event.id;
            //var componentPath = event.componentPath;
            var parent = event.parent;
            var aimType = event.type;
            console.log("$insertContainerInner emit recevied parent:" + JSON.stringify(parent));
            if (parent) {
                var newBlockID = 1;
                if (parent.childen && parent.childen.length > 0) {
                    var maxItem = _.max(parent.childen, function (item) { return item.id; });
                    if (maxItem) {
                        newBlockID = maxItem.id + 1;
                    }
                }
                var componentPath = parent.componentPath + '-' + newBlockID;
                var obj = {};
                if (aimType == 'img-container-type')//单图片容器
                {
                    obj = {
                        id: newBlockID, componentName: 'custom-layout', componentPath: componentPath, containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px', flexDirection: 'row' }, width0: '100%', width768: '100%', width992: '100%', width1200: '100%', width1440: '100%', width1600: '100%', moreStyle: {},
                        childen: [
                               //    { id: 1, componentName: 'img', componentPath: componentPath + '-' + 1, imgUrl: '/images/placehold.png', containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }, linkUrl: '', isBackgroundImg: false, newWidth0: '100%', newWidth768: '100%', newWidth992: '100%', newWidth1200: '100%', newWidth1440: '100%', newWidth1600: '100%', moreStyle: {} }
                        ]
                    };
                }
                else if (aimType == 'carousel-container-type') {//新增轮播图容器
                    obj = { id: newBlockID, componentName: 'carousel-layout', componentPath: componentPath, imgs: [{ id: 1, imgUrl: '/images/bannerSample/1.jpg', link: '', sort: 1, width: 100, height: 100 }, { id: 2, imgUrl: '/images/bannerSample/2.jpg', link: '', sort: 2, width: 100, height: 100 }, { id: 3, imgUrl: '/images/bannerSample/3.jpg', link: '', sort: 3, width: 100, height: 100 }], containerStyle: { minWidth: '100%', minHeight: '100px', height: 'auto', marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }, width0: '100%', width768: '100%', width992: '100%', width1200: '100%', width1440: '100%', width1600: '100%', moreStyle: {} };
                }
                console.log(JSON.stringify(obj));
                parent.childen.push(obj);
                //content.unshift(obj);
            }
        },
    },


});

function showEditTextForm(block,callback)
{
    var orgText = block.text;
    var $modal = $("#textEditModal");
     /* 拖拽 */
    $modal.draggable({
     cursor: "move",
         handle: '.modal-header'
    });
    editorInstances.setEditorValue('Description', orgText);
    $modal.modal({ show: true, backdrop: true });
    $modal.find("button.submit").off("click").on("click", function (e) {
        var text = $modal.find('#Description').val();
            callback && callback(text);
            });
        $modal.find("button.cancel").off("click").on("click", function (e) {
            block.text = orgText;
            editorInstances.setEditorValue('Description', '');
        });
}

/*图片上传*/
function showEditorImageUploadFormEx(callback) {

    $("#UploadImageModal").modal("show");
    $("#UploadImageModal #uploadImgBtn").off("click").on("click", function (e) {
        app.uploadImg(e, function(imgUrl,width,height) {
               callback && callback(imgUrl,width,height);
           // callback && callback(imgUrl, '100%', 'auto');
        });
    });
}

/*设置链接地址*/
//function showSetLinkForm(orgLink,callback) {

//    $("#SetLinkModal").modal("show");
//    $("#SetLinkModal #link").val(orgLink);
//    $("#SetLinkModal #setLinkBtn").off("click").on("click", function (e) {
//        var link = $("#SetLinkModal #link").val();
//        callback && callback(completelyLink(link));
//    });
//    $("#SetLinkModal #clearLinkBtn").off("click").on("click", function (e) {
//        callback && callback('');
//    });
    
//}
/*给链接加上请求协议*/
function completelyLink(orgLink)
{
    orgLink=orgLink.trim();
    var result = orgLink;

    if (orgLink.indexOf('/')!=0 && orgLink.indexOf('http') == -1 || orgLink.indexOf('http')>0)
    {
        result = "http://" + orgLink;
    }
    return result;
}

/*调整容器样式*/
function SetBlockStyleForm(block, callback) { //block为持有的容器对象引用

    var orgflexDirection = block.containerStyle.flexDirection || "";
    var direction = orgflexDirection;
    $modal = $('#SetBlockStyleModal');
    /* 可拖拽 */
    $modal.draggable({
        cursor: "move",
        handle: '.modal-header'
    });
    $modal.modal({ show: true, backdrop: false });//backdrop去遮罩
    $modal.find('input[name="rdoFlexDirection"][value="' + direction + '"]').attr("checked", true);

    $modal.find('input[name="rdoFlexDirection"]').off('change').on('change', function (e) {
        //发生改变的时候触发  
        direction = $(this).val();// $modal.find('input[name="rdoFlexDirection"][checked]').val();
        block.containerStyle.flexDirection = direction;
    });

    $("#SetBlockStyleModal #setBlockStyleBtn").off("click").on("click", function (e) {
       // var direction = $modal.find('input[name="rdoFlexDirection"]').val();
        callback && callback(direction);
    });
    $("#SetBlockSizeModal #cancelBlockSizeBtn").off("click").on("click", function (e) {
        block.containerStyle.flexDirection = orgflexDirection;
    });

}

/*调整容器大小*/
function SetBlockSizeForm(block, callback) { //block为持有的容器对象引用
    product.blockWidthSlider.refresh();
    product.blockMarginSlider.refresh();

    var orgWidth = block.containerStyle.width;//未作任何改变的边距设置
    var orgMargin = block.containerStyle.margin;//未作任何改变的边距设置
    var width = parseInt(block.containerStyle.width);//去掉了单位
    var margin = parseInt(block.containerStyle.margin);//去掉了单位

    $modal = $('#SetBlockSizeModal');
    /* 拖拽 */
    $modal.draggable({
        cursor: "move",
        handle: '.modal-header'
    });
    $modal.modal({ show: true, backdrop:false});
    //  $(".modal-backdrop").remove();
    product.blockWidthSlider.setValue(width);
    product.blockMarginSlider.setValue(margin);
    $modal.find('#blockMargin').val(orgMargin);

    product.blockWidthSlider.off('change');
    product.blockWidthSlider.on('change', function (e) {
        //当宽度发生改变的时候触发  
        var newWidth = e.newValue;
        block.containerStyle.width = newWidth+'%';
    });
    product.blockMarginSlider.off('change');
    product.blockMarginSlider.on('change', function (e) {
        //当margin发生改变的时候触发  
        var newMargin = e.newValue;
        block.containerStyle.margin = newMargin + 'px';
        $modal.find('#blockMargin').val(newMargin + 'px');
    });
   
    $("#SetBlockSizeModal #setBlockSizeBtn").off("click").on("click", function (e) {
        var lastWidth = product.blockWidthSlider.getValue();
        var lastMargin = $modal.find('#blockMargin').val();
        callback && callback(lastWidth + '%', lastMargin);
       
    });
    $("#SetBlockSizeModal #cancelBlockSizeBtn").off("click").on("click", function (e) {
        block.containerStyle.width = orgWidth;
        block.containerStyle.margin = orgMargin;
    });
}

/*调整图片大小*/
function SetContainerSizeForm(img, callback) { //img为持有的图片对象引用
    product.widthSlider.refresh();
    product.heightSlider.refresh();
    product.containerMarginSlider.refresh();
    var width = img.width, height = img.height, margin = parseInt(img.containerStyle.margin);
    var orgMargin = img.containerStyle.margin;//未作任何改变的边距设置
    $modal = $('#SetContainerSizeModal'); 
    /* 拖拽 */
    $modal.draggable({
        cursor: "move",
        handle: '.modal-header'
    });
    $modal.modal({ show: true, backdrop: false });
  //  $(".modal-backdrop").remove();
    console.log(width);
    product.widthSlider.setValue(width);
    
  //  product.heightSlider.setValue(height);
    product.containerMarginSlider.setValue(margin);
    $modal.find('#imgMargin').val(orgMargin);
    product.widthSlider.off("change");
    product.widthSlider.on('change', function (e) {
        //当宽度发生改变的时候触发  
        var newWidth=e.newValue;
        var isSameScale = $("input[name='chkSameScaleRate']").prop("checked");
        if (isSameScale) {
            //var newHeight = parseInt(newWidth * (height * 1.0 / width));
            //product.heightSlider.setValue(newHeight);
            img.width = newWidth;
            img.height = 'auto';
        }
        else
        {
            img.width = newWidth;
        }
    });
    product.heightSlider.off("change");
    product.heightSlider.on('change', function (e) {
        //当高度发生改变的时候触发  
        var newHeight = e.newValue;
        var isSameScale = $("input[name='chkSameScaleRate']").prop("checked");
        if (isSameScale) { //等比例缩放
            var newWidth = parseInt(newHeight * (width * 1.0 / height));
            product.widthSlider.setValue(newWidth);
            img.width = newWidth;
            img.height = newHeight;
        }
        else {
            img.height = newHeight;
        }
    });
    product.containerMarginSlider.off("change");
    product.containerMarginSlider.on('change', function (e) {
        //当margin发生改变的时候触发  
        var newMargin = e.newValue;
        img.containerStyle.margin = newMargin + 'px';
        $modal.find('#imgMargin').val(newMargin + 'px');

    });
    $("#SetContainerSizeModal #setContainerSizeBtn").off("click").on("click", function (e) {
        var width = product.widthSlider.getValue();
     //   var height = product.heightSlider.getValue();
        var lastMargin = $modal.find('#imgMargin').val();
        callback && callback(width, 'auto', lastMargin);
    });
    $("#SetContainerSizeModal #cancelSetContainerSizeBtn").off("click").on("click", function (e) {
        img.width = width;
       // img.height = height;
        img.containerStyle.margin = orgMargin;
    });
}

///将形如：{color:"#ff0000",border:"solid 1px #333"}的数据转变为：color:#ff0000;border:solid 1p #333;的形式
function joinStyleToString(styleObj)
{
    var result = _.map(styleObj, function (value, key) { return key + ':' + value; }).join(";");
    console.log(result);
    return result;
}
//将 ：color:#ff0000;border:solid 1p #333; 转变为 {color:"#ff0000",border:"solid 1px #333"} 对象
function formatStyleString(strStyle)
{
    var arr = strStyle.split(';');
    var obj = {};
    for(var item in arr)
    {
        var itemArr=arr[item].split(':');
        if (itemArr.length == 2)
            obj[itemArr[0]] = itemArr[1];
    }
    return obj;
}



/*调整文字块儿大小*/
function SetContainerStyleForm(block, callback) { //block为持有的对象引用
    product.textWidthSlider.refresh();
    product.textWidthSlider0.refresh();
    product.textWidthSlider768.refresh();
    product.textWidthSlider992.refresh();
    product.textWidthSlider1200.refresh();
    product.textWidthSlider1440.refresh();
    product.textWidthSlider1600.refresh();

  //  product.textHeightSlider.refresh();
    product.topMarginSlider.refresh();
    product.rightMarginSlider.refresh();
    product.bottomMarginSlider.refresh();
    product.leftMarginSlider.refresh();

    var moreStyle = block.moreStyle; //更多样式
    width0 = parseInt(block.width0),
    width768 = parseInt(block.width768),
    width992 = parseInt(block.width992),
    width1200 = parseInt(block.width1200),
    width1440 = parseInt(block.width1440),
    width1600 = parseInt(block.width1600),
    height = parseInt(block.containerStyle.height),
    marginTop = parseInt(block.containerStyle.marginTop),
    marginRight = parseInt(block.containerStyle.marginRight),
    marginBottom = parseInt(block.containerStyle.marginBottom),
    marginLeft = parseInt(block.containerStyle.marginLeft),
    //未作任何改变的设置
    orgMoreStyle = block.moreStyle;
        orgWidth0 = block.width0,
        orgWidth768 = block.width768,
        orgWidth992 = block.width992,
        orgWidth1200 = block.width1200,
        orgWidth1440 = block.width1440,
        orgWidth1600 = block.width1600,

        orgHeight = block.containerStyle.height,
        orgMarginTop = block.containerStyle.marginTop,
        orgMarginRight = block.containerStyle.marginRight,
        orgMarginBottom = block.containerStyle.marginBottom,
        orgMarginLeft = block.containerStyle.marginLeft,
        orgMinWidth = block.containerStyle.minWidth,
        orgMinHeight = block.containerStyle.minHeight,

        $modal = $('#SetContainerStyleModal');
        /* 拖拽 */
        $modal.draggable({
            cursor: "move",
            handle: '.modal-header'
        });
        $modal.modal({ show: true, backdrop: false });
        // $(".modal-backdrop").remove();

        $modal.find("#txtMoreStyle").val(joinStyleToString(moreStyle));
        product.textWidthSlider0.setValue(width0);
        product.textWidthSlider768.setValue(width768);
        product.textWidthSlider992.setValue(width992);
        product.textWidthSlider1200.setValue(width1200);
        product.textWidthSlider1440.setValue(width1440);
        product.textWidthSlider1600.setValue(width1600);

      //  product.textHeightSlider.setValue(height);
        product.topMarginSlider.setValue(marginTop);
        product.rightMarginSlider.setValue(marginRight);
        product.bottomMarginSlider.setValue(marginBottom);
        product.leftMarginSlider.setValue(marginLeft);

        $modal.find('#topMargin').val(orgMarginTop);
        $modal.find('#rightMargin').val(orgMarginRight);
        $modal.find('#bottomMargin').val(orgMarginBottom);
        $modal.find('#leftMargin').val(orgMarginLeft);
         
        product.textWidthSlider0.off('change');
        product.textWidthSlider0.on('change', function (e) {
            //当宽度发生改变的时候触发  
            var newWidth = e.newValue;
            block.width0 = newWidth + '%';
            block.containerStyle.minWidth = '0%';
        });
        product.textWidthSlider768.off('change');
        product.textWidthSlider768.on('change', function (e) {
            //当宽度发生改变的时候触发  
            var newWidth = e.newValue;
            block.width768 = newWidth + '%';
            block.containerStyle.minWidth = '0%';
        });
        product.textWidthSlider992.off('change');
        product.textWidthSlider992.on('change', function (e) {
            //当宽度发生改变的时候触发  
            var newWidth = e.newValue;
            block.width992 = newWidth + '%';
            block.containerStyle.minWidth = '0%';
        });
        product.textWidthSlider1200.off('change');
        product.textWidthSlider1200.on('change', function (e) {
            //当宽度发生改变的时候触发  
            var newWidth = e.newValue;
            block.width1200 = newWidth + '%';
            block.containerStyle.minWidth = '0%';
        });
        product.textWidthSlider1440.off('change');
        product.textWidthSlider1440.on('change', function (e) {
            //当宽度发生改变的时候触发  
            var newWidth = e.newValue;
            block.width1440 = newWidth + '%';
            block.containerStyle.minWidth = '0%';
        });
        product.textWidthSlider1600.off('change');
        product.textWidthSlider1600.on('change', function (e) {
            //当宽度发生改变的时候触发  
            var newWidth = e.newValue;
            block.width1600 = newWidth + '%';
            block.containerStyle.minWidth = '0%';
        });
        //统一设置宽度
        product.textWidthSlider.off('change');
        product.textWidthSlider.on('change', function (e) {
            var newWidth = e.newValue;
            block.width0 = newWidth + '%';
            block.width768 = newWidth + '%';
            block.width992 = newWidth + '%';
            block.width1200 = newWidth + '%';
            block.width1440 = newWidth + '%';
            block.width1600 = newWidth + '%';
            product.textWidthSlider1600.setValue(newWidth);
            product.textWidthSlider1440.setValue(newWidth);
            product.textWidthSlider1200.setValue(newWidth);
            product.textWidthSlider992.setValue(newWidth);
            product.textWidthSlider768.setValue(newWidth);
            product.textWidthSlider0.setValue(newWidth);
            block.containerStyle.minWidth = '0%';
        });
        product.topMarginSlider.off('change');
        product.topMarginSlider.on('change', function (e) {
            //当margin发生改变的时候触发  
            var newMargin = e.newValue;
            block.containerStyle.marginTop = newMargin + 'px';
            $modal.find('#topMargin').val(newMargin + 'px');

        });
        product.rightMarginSlider.off('change');
        product.rightMarginSlider.on('change', function (e) {
            //当margin发生改变的时候触发  
            var newMargin = e.newValue;
            block.containerStyle.marginRight = newMargin + 'px';
            $modal.find('#rightMargin').val(newMargin + 'px');

        });
        product.bottomMarginSlider.off('change');
        product.bottomMarginSlider.on('change', function (e) {
            //当margin发生改变的时候触发  
            var newMargin = e.newValue;
            block.containerStyle.marginBottom = newMargin + 'px';
            $modal.find('#bottomMargin').val(newMargin + 'px');

        });
        product.leftMarginSlider.off('change');
        product.leftMarginSlider.on('change', function (e) {
            //当margin发生改变的时候触发  
            var newMargin = e.newValue;
            block.containerStyle.marginLeft = newMargin + 'px';
            $modal.find('#leftMargin').val(newMargin + 'px');

        });
        $modal.find("button.submit").off("click").on("click", function (e) {
            moreStyle = $modal.find("#txtMoreStyle").val();
            moreStyle = formatStyleString(moreStyle);
            width0 = product.textWidthSlider0.getValue() + '%';
            width768 = product.textWidthSlider768.getValue() + '%';
            width992 = product.textWidthSlider992.getValue() + '%';
            width1200 = product.textWidthSlider1200.getValue() + '%';
            width1440 = product.textWidthSlider1440.getValue() + '%';
            width1600 = product.textWidthSlider1600.getValue() + '%';
            height = 'auto';// product.textHeightSlider.getValue()+'%';
            marginTop = product.topMarginSlider.getValue()+'px';
            marginRight = product.rightMarginSlider.getValue() + 'px';
            marginBottom = product.bottomMarginSlider.getValue() + 'px';
            marginLeft = product.leftMarginSlider.getValue() + 'px';
            var newMinWidth = '0%';
            var newMinHeight = '0%';
            callback && callback(width0, width768, width992, width1200, width1440, width1600, newMinWidth, height, newMinHeight, marginTop, marginRight, marginBottom, marginLeft, moreStyle);
        });
        $modal.find("button.cancel").off("click").on("click", function (e) {
            block.width0 = orgWidth0;
            block.width768 = orgWidth768;
            block.width992 = orgWidth992;
            block.width1200 = orgWidth1200;
            block.width1440 = orgWidth1440;
            block.width1600 = orgWidth1600;
            block.containerStyle.height = orgHeight;
            block.containerStyle.marginTop = orgMarginTop;
            block.containerStyle.marginRight = orgMarginLeft;
            block.containerStyle.marginBottom = orgMarginBottom;
            block.containerStyle.marginLeft = orgMarginLeft;
            block.containerStyle.minWidth = orgMinWidth;
            block.containerStyle.minHeight = orgMinHeight;
        });
}

//管理轮播图图片
var CarouselManage = {
        imgList: [],
        showCarouselImgsForm: function (imgs, callback) {
            this.imgList = [];
            for (var i in imgs) {
                this.imgList.push(deepClone(imgs[i]));
            }
            this.clearEditForm();
            this.showImgListHtml();
            $("#SetCarouselImgModal").modal("show");
            that = this;
            $("#SetCarouselImgModal #SetCarouselImgBtn").off("click").on("click", function (e) {
                callback && callback(that.imgList);
            });
        },
        showImgListHtml: function () {
            var html = [];
            if (this.imgList.length == 0) {
                html.push('<tr><td colspan="5" style="text-align:center;">无数据</td></tr>');
            }
            for (var i = 0; i < this.imgList.length; i++) {
                html.push('<tr><td>' + this.imgList[i].id + '</td><td><img src="' + this.imgList[i].imgUrl + '" style="width:300px;" /></td><td>' + this.imgList[i].link + '</td><td>' + this.imgList[i].sort + '</td><td><button onclick="CarouselManage.editImg(' + this.imgList[i].id + ')">编辑</button>&nbsp;<button onclick="CarouselManage.deleteImg(' + this.imgList[i].id + ')">删除</button></td></tr>');
            }
            $("#carouselImgBody").html(html.join(""));
        },
        editImg: function (imgID) {
            var img = _.find(this.imgList, function (item) { return item.id == imgID; });
            
            $("#SetCarouselImgModal #imgEditLendIcon").removeClass('fa-plus').addClass('fa-edit');
            $("#SetCarouselImgModal #imgEditLend").text('编辑（编号：' + img.id + ')');
            $("#SetCarouselImgModal #imgID").val(img.id);
            $("#SetCarouselImgModal #imgUrl").val(img.imgUrl);
            $("#SetCarouselImgModal #imgUrlShow").attr("src", img.imgUrl);
            if (img.imgUrl) $("#SetCarouselImgModal #imgUrlShow").show();
            $("#SetCarouselImgModal input[name='link']").val(img.link);
            $("#SetCarouselImgModal input[name='sort']").val(img.sort);
            $("#SetCarouselImgModal #height").val(img.height);
            $("#SetCarouselImgModal #width").val(img.width);
        },
        showUploadForm: function () {
            $("#UploadImageModal").attr("z-index",9999);
            $("#UploadImageModal").modal("show");
            $("#UploadImageModal #uploadImgBtn").off("click").on("click", function (e) {
                app.uploadImg(e, function(imgUrl, width, height) {
                    $("#SetCarouselImgModal #height").val('auto');
                    $("#SetCarouselImgModal #width").val('100');
                    $("#SetCarouselImgModal #imgUrl").val(imgUrl);
                    $("#SetCarouselImgModal #imgUrlShow").attr("src", imgUrl);
                    $("#SetCarouselImgModal #imgUrlShow").show();
                });
            });
        },
        saveImg: function () {
            var imgID = $("#SetCarouselImgModal #imgID").val();
            if (imgID == 0) { this.addImg(); }
            else {
                var img = _.find(this.imgList, function (item) { return item.id == imgID; })
                if (img) {
                    img.imgUrl = $("#SetCarouselImgModal #imgUrl").val();
                    img.link = $("#SetCarouselImgModal input[name='link']").val();
                    img.sort = $("#SetCarouselImgModal input[name='sort']").val();
                    img.height = 'auto';// $("#SetCarouselImgModal #height").val();
                    img.width =  $("#SetCarouselImgModal #width").val()+'%';
                }
                this.imgList = _.sortBy(this.imgList, function (item) { return item.sort; });
                this.clearEditForm();
                this.showImgListHtml();
            }
        },
        cancelSaveImg: function () {
            this.clearEditForm();
        },
        deleteImg: function (imgID) {
            if (confirm("确定要删除编号为" + imgID + "的图片吗?")) {
                var imgIdx = _.findIndex(this.imgList, function (item) { return item.id == imgID; })
                if (imgIdx != -1) {
                    this.imgList.splice(imgIdx, 1);
                    this.showImgListHtml();
                    this.clearEditForm();
                }
            }
        },
        addImg: function () {//添加轮播图-保存方法
            if (!$("#SetCarouselImgModal #imgUrl").val()) { alert('请上传图片！'); return;}
            var newID = 1;
            if (this.imgList.length > 0) {
                var maxIDItem = _.max(this.imgList, function (item) { return item.id; });
                if (maxIDItem) {
                    newID = maxIDItem.id + 1;
                }
            }
            var img = { id: newID, imgUrl: $("#SetCarouselImgModal #imgUrl").val(), link: $("#SetCarouselImgModal input[name='link']").val(), sort: $("#SetCarouselImgModal input[name='sort']").val(), height: 'auto', width: $("#SetCarouselImgModal #width").val()+'%' };
            this.imgList.push(img);
            this.imgList = _.sortBy(this.imgList, function (item) { return item.sort; });
            this.showImgListHtml();
            this.clearEditForm();
        },
        clearEditForm: function () {
            $("#SetCarouselImgModal #imgEditLendIcon").removeClass('fa-edit').addClass('fa-plus');
            $("#SetCarouselImgModal #imgEditLend").text('添加Banner图');
            $("#SetCarouselImgModal #imgID").val(0);
            $("#SetCarouselImgModal #imgUrl").val('');
            $("#SetCarouselImgModal #imgUrlShow").attr("src", '');
            $("#SetCarouselImgModal #imgUrlShow").hide();
            $("#SetCarouselImgModal input[name='link']").val('');
            $("#SetCarouselImgModal input[name='sort']").val('1');
            $("#SetCarouselImgModal #height").val('auto');
            $("#SetCarouselImgModal #width").val(100);
        }
    };
 


$(document).ready(function () {
    $("#initData").on("click", function () {
        mainApp.initData();
    });
    //初始化文本编辑器
    editorInstances.createEditor('Description');
    //所有slider初始化
    product.widthSlider = new Slider("#widthSlider", { tooltip: 'always' });
    product.heightSlider = new Slider("#heightSlider", { tooltip: 'always' });
    product.containerMarginSlider = new Slider("#marginSlider", { tooltip: 'always' });
    product.blockWidthSlider = new Slider("#containerWidthSlider", { tooltip: 'always' });//宽高调整
    product.blockMarginSlider = new Slider("#blockMarginSlider", { tooltip: 'always' }); //边距调整
    product.textWidthSlider = new Slider("#textWidthSlider", { tooltip: 'always' });
    product.textWidthSlider0 = new Slider("#textWidthSlider0", { tooltip: 'always' });
    product.textWidthSlider768 = new Slider("#textWidthSlider768", { tooltip: 'always' });
    product.textWidthSlider992 = new Slider("#textWidthSlider992", { tooltip: 'always' });
    product.textWidthSlider1200 = new Slider("#textWidthSlider1200", { tooltip: 'always' });
    product.textWidthSlider1440 = new Slider("#textWidthSlider1440", { tooltip: 'always' });
    product.textWidthSlider1600 = new Slider("#textWidthSlider1600", { tooltip: 'always' });
    product.textHeightSlider = new Slider("#textHeightSlider", { tooltip: 'always' });
    product.topMarginSlider = new Slider("#topMarginSlider", { tooltip: 'always' });
    product.rightMarginSlider = new Slider("#rightMarginSlider", { tooltip: 'always' });
    product.bottomMarginSlider = new Slider("#bottomMarginSlider", { tooltip: 'always' });
    product.leftMarginSlider = new Slider("#leftMarginSlider", { tooltip: 'always' }); 

    // 通过该方法来为每次弹出的模态框设置最新的zIndex值，从而使最新的modal显示在最前面
    $(document).on('show.bs.modal', '.modal', function (event) 
    {
        var zIndex = 1050 + (10 * $('.modal:visible').length);
        $(this).css('z-index', zIndex);
    });
    
    //视频播放器设置
    videojs.options.flash.swf = "/js/video-js.swf";
    Video.videoPlay = videojs("video_1");
    Video.videoPlay.on("ended", function () {
        console.log("end", this.currentTime());

    });
});

//视频上传管理
var Video = {
    videoPlay:null,
    showVideoSetForm: function (obj,callback) {
        var orgLink = obj.linkUrl;
        var orgisVideo = obj.linkIsVideo;
        var $modal = $("#setVideoForm");
        if (orgLink) $modal.find("#link").val(orgLink);
        $modal.find("#isVideo").prop("checked", orgisVideo);

        $modal.modal("show");
        $modal.find("[name='uploadVideoBtn']").off("click").on("click", function () {
            Video.uploadVideoForm(function (videoUrl) {
                $modal.find("#link").val(videoUrl);
                $modal.find("#isVideo").prop("checked",true);
            });
        });
        $modal.find(".submit").off("click").on("click", function (e) {
            var link = $modal.find("#link").val();
            var isVideo=$modal.find("#isVideo").prop("checked");
            callback && callback(link, isVideo);
        });
        $modal.find(".cancel").off("click").on("click", function (e) {
            obj.linkUrl = orgLink;
            obj.linkIsVideo = orgisVideo;
        });
    },
    uploadVideoForm:function(callback)
    {
        var $modal = $("#divAddVideo");
        $("#divAddVideo #frmAddVideo").attr("src", "/Areas/Admin/AddVideo.aspx?dt=" + new Date().getTime());
        $modal.modal({ show: true, backdrop: false });
        $("#divAddVideo #btnCloseVideoForm").off("click").on("click", function (e) {
            var videoUrl = window.frames[0].document.getElementById("hdVideoPath").value;
            callback && callback(videoUrl);
        });
    },
    playVideo:function(videoUrl)
    {
        var $modal = $("#VideoPlayForm");
        videoUrl = window.location.protocol +'//'+ window.location.host + videoUrl;
        $("#VideoPlayForm #videoUrl").attr("src", videoUrl);
        Video.videoPlay.src({ src: videoUrl, type: 'video/mp4', width: '300px', height: '200px' });
        Video.videoPlay.width(800)
        Video.videoPlay.height(600);
        Video.videoPlay.play();
        /* 拖拽 */
        $modal.draggable({
            cursor: "move",
            handle: '.modal-header'
        });
        $modal.modal("show");
        $modal.off("hidden.bs.modal").on("hidden.bs.modal", function () {
            Video.videoPlay.pause();
        });
    }



}



/******上传图片功能*****************/

//打开编辑器插入图片窗口
function showEditorImageUploadForm() {

    $("#UploadImageModal").modal("show");
    $("#UploadImageModal #uploadImgBtn").off("click").on("click", function (e) {
        app.uploadImg(e, function (imgUrl) { editorInstances.insertImage('Description', imgUrl); });
    });
}

//深拷贝
function deepClone(obj) {  
   
    if (!_.isObject(obj) || typeof obj === 'function') {  
        return obj;  
    }  
    cloneObj = _.isArray(obj) ? [] : {};  
    for (var i in obj) {  
        if (obj.hasOwnProperty(i)) {  
            if (!_.isObject(obj[i])) {  
                // obj[i]为null和undefined都会进入这里  
                cloneObj[i] = obj[i];  
            } else {  
                cloneObj[i] = deepClone(obj[i]);  
            }  
        }  
    }  
    return cloneObj;  
};  
    