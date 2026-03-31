//轮播图
Vue.component("carousel-layout", {
    data: function () {
        return {
            isShowMenu: false,
            //id: function () { return { id: id };}
        }
    },
    props: ['content'],
    template: ```<div :id="'myCarousel'+content.id" class="carousel slide content-block hover-menu" data-ride="carousel"  :style="content.containerStyle"  v-on:mouseover="showMenu" v-on:mouseout="hideMenu" >
                       <div class ="custom-menu"  :style="{display:isShowMenu?'':'none'}">
                         <button v-on: click="changeImage">
                             更换图片
                        </button>
                          <button v-on: click="changeImage">
                             删除图片
                        </button>
                         <button v-on: click="insertImage">
                             插入图片
                        </button>
                        <button v-on: click="changCarouselWidth">
                             调整宽度
                        </button>
                         <button v-on: click="insertImageBelow">
                             在下方插入图片
                        </button>
                         <button v-on: click="$emit('insert-carousel', { id: this.content.id })">
                             插入轮播图
                        </button>
                        </div>
                    <!-- 轮播（Carousel）指标 -->
                    <ol class="carousel-indicators">
                        <li :data-target="'#myCarousel'+content.id" data-slide-to="0" class ="active"></li>
                        <li :data-target="'#myCarousel'+content.id" data-slide-to="1" class =""></li>
                        <li :data-target="'#myCarousel'+content.id" data-slide-to="2" class =""></li>
                        <li :data-target="'#myCarousel'+content.id" data-slide-to="3" class =""></li>
                    </ol>
                    <!-- 轮播（Carousel）项目 -->
                    <div class="carousel-inner">
                        <div class="item active">
                            <img src="http://www.china-fwzx.com/Upload/1/9d6a1f47-decd-45a0-ae6a-92cd63e0020d.jpg">
                        </div>
                        <div class="item ">
                            <img src="http://www.china-fwzx.com/Upload/1/1bcdc8da-6f8a-4e1b-8bdb-ee4371f61f81.jpg">
                        </div>
                        <div class="item ">
                            <img src="http://www.china-fwzx.com/Upload/1/fc79ff76-86df-41c4-9908-03939255b034.jpg">
                        </div>
                        <div class="item">
                            <img src="http://www.china-fwzx.com/Upload/1/5c9bf204-d432-44f1-9f44-fe5a70253628.jpg">
                        </div>
                    </div>
                    <!-- 轮播（Carousel）导航 -->
                    <a class ="carousel-control left" :href="'#myCarousel'+content.id" data-slide="prev">
                    </a>
                    <a class ="carousel-control right" :href="'#myCarousel'+content.id" data-slide="next">
                    </a>
                </div>```,
    methods: {
        changeImg: function () {
            console.log("$emit('change-img') id:" + this.content.id);
            this.$emit('change-img', { id: this.content.id });
            console.log('eimt');
        },

        showMenu: function () {
            this.isShowMenu = true;
        },
        hideMenu: function () {
            this.isShowMenu = false;
        },
        insertContainerBelow: function () {
            console.log("$emit('insertContainerBelow') id:" + this.content.id);
            this.$emit('insert-container-below', { id: this.content.id });
            console.log('eimt');
        }
    }
});