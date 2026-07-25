
var fLoadAndRender= null;
 function assignLoadobjectListFunction ( fun ){
    fLoadAndRender = fun;
    console.log("assigned function",fun);

 }

     function getPagebar() {       
     return `
            <div class="pagination-bar">
              <div class="pagination-info">
                共 <span id="xxx-total">0</span> 条记录，每页 
                <select id="xxx-page-size" onchange="changeXxxPageSize()">
                  <option value="5" selected>5</option>
                  <option value="10" selected>10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select> 条
              </div>
              <div class="pagination-btns" id="xxx-pagination-btns"></div>
          </div>
              `
        }
// 渲染分页按钮，代入 分页参数
function renderPagination( Pagination ) {
    const btnContainer = document.getElementById('xxx-pagination-btns');
    document.getElementById('xxx-total').textContent = Pagination.total;
    
    if (Pagination.total === 0) {
      btnContainer.innerHTML = '<span style="color:#999;">暂无数据</span>';
      return;
    }
  
    let html = '';
    // 上一页
    html += `<button class="pagination-btn" 
              onclick="changeXxxPage(${Pagination.pageNum - 1})"
              ${Pagination.pageNum === 1 ? 'disabled' : ''}>
              上一页
            </button>`;
  
    // 页码（显示前后3页，超出省略）
    const start = Math.max(1, Pagination.pageNum - 3);
    const end = Math.min(Pagination.totalPages, Pagination.pageNum + 3);
    
    if (start > 1) {
      html += `<button class="pagination-btn" onclick="changeXxxPage(1)">1</button>`;
      if (start > 2) html += '<span style="padding:0 4px;">...</span>';
    }
  
    for (let i = start; i <= end; i++) {
      html += `<button class="pagination-btn ${i === Pagination.pageNum ? 'active' : ''}" 
                onclick="changeXxxPage(${i})">${i}</button>`;
    }
  
    if (end < Pagination.totalPages) {
      if (end < Pagination.totalPages - 1) html += '<span style="padding:0 4px;">...</span>';
      html += `<button class="pagination-btn" onclick="changeXxxPage(${Pagination.totalPages})">${Pagination.totalPages}</button>`;
    }
  
    // 下一页
    html += `<button class="pagination-btn" 
              onclick="changeXxxPage(${Pagination.pageNum + 1})"
              ${Pagination.pageNum === Pagination.totalPages ? 'disabled' : ''}>
              下一页
            </button>`;
  
    btnContainer.innerHTML = html;
  }

  // 切换页码
function changeXxxPage(targetPage) {
    if (targetPage < 1 || targetPage > Pagination.totalPages) return;
    Pagination.pageNum = targetPage;
    if(fLoadAndRender)
        fLoadAndRender();//loadCourseList();
    // 滚动到卡片顶部
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth' });
  }
  
  // 切换每页条数
  function changeXxxPageSize() {
    const select = document.getElementById('xxx-page-size');
    Pagination.pageSize = Number(select.value);
    Pagination.pageNum = 1; // 切换条数后重置为第1页
    if(fLoadAndRender)
        fLoadAndRender();//loadCourseList();
  }
  /*
  // JS中可以用变量来表示一个函数，例如：
  // 方法1：函数表达式
  const myFunc = function(param) {
    // 函数体
    console.log("参数为:", param);
  };

  // 方法2：箭头函数
  const myArrowFunc = (param) => {
    console.log("箭头函数参数为:", param);
  };

  // 使用
  // myFunc("Hello");
  // myArrowFunc("World");
  // 举例：有一个函数
  function hello(name) {
    console.log("Hello, " + name + "!");
  }

  // 把函数名赋值给一个变量
  const greet = hello;

  // 利用该变量调用这个函数
  greet("Alice"); // 输出: Hello, Alice!
  */