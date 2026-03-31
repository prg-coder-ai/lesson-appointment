
/*
 
   @Scripts.Render("~/Bundles/react/js")
   
<script src="@Url.Content("~/Areas/Admin/Contents/ProductManage/HelloWorld.jsx")"></script>

 <div id="content1"> </div> 
*/
class App extends React.Component{
    constructor(props) {
        super(props);
     
        this.state = {filterText:'', pageIndex:1,pageSize:2,Sorting:'ID desc', products: [] };
    }
    getDefaultProps(){
        return {
            repositery:abp.services.app.product.getPagedProductsAsync
        };
    }
    componentWillMount() {
        this.getProductList();
    }
    getProductList=()=>{
        var GetProductInput={
            FilterText:this.state.filterText,
            Sorting:'ID Desc',
            SkipCount:(this.state.pageIndex-1)*this.state.pageSize,
            MaxResultCount:this.state.pageSize,
        };
        this.props.repositery(GetProductInput).done(function (data) {
             
            this.setState({ products: data });
        }.bind(this)).always(function () {
           
        });
    }

    nextPage=()=>{
        this.setState({pageIndex:this.state.pageIndex+1});    
        this.getProductList();
    }

    ToPage=(e)=>{
            this.setState({pageIndex:+e.target.innerText});    
            this.getProductList();
    }

        render(){
            var list=[];
            if(this.state.products.items){
                list= this.state.products.items.map(function(product,i)
                {
                    return <tr><td>{JSON.stringify(product)}</td></tr>;         
                });
            }
            var page=[];
            var totalPage=Math.ceil(this.state.products.totalCount/this.state.pageSize);
            for(var i=1;i<totalPage;i++)
            {
                page.push(<span onClick={this.ToPage}>{i}</span>);
            }
            return(
                <div><table>{ list }</table>
                 <div>{page}<span onClick={this.nextPage}>下一页</span></div>
                </div>
            );
        }
    };

            var app= React.render(<App/>, document.getElementById('content1'));
            
        