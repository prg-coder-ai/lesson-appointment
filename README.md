# lesson-appointment
lesson-appointment/  # 项目根目录-- 前端结构
├── index.html             # 入口HTML（登录页）
├── package.json           # 项目依赖+脚本配置
├── vite.config.js         # Vite核心配置文件
├── .env                   # 环境变量配置
├── .gitignore             # Git忽略文件
├── public/                # 静态资源（不参与打包）
│   ├── favicon.ico        # 网站图标
│   └── assets/            # 图片/字体等静态资源
└── src/                   # 源代码目录
    ├── styles/            # 样式文件
    │   ├── common.css     # 公共样式
    │   ├── admin.css      # 管理端样式
    │   ├── teacher.css    # 教师端样式
    │   └── student.css    # 学生端样式
    ├── pages/             # 页面文件
    │   ├── admin.html     # 管理端页面
    │   ├── teacher.html   # 教师端页面
    │   └── student.html   # 学生端页面
    └── scripts/           # 脚本文件
        ├── login.js       # 登录页逻辑
        ├── admin.js       # 管理端逻辑
        ├── teacher.js     # 教师端逻辑
        └── student.js     # 学生端逻辑
 Api---前后端结合 使用mvn 
 
# 前端核心配置文件
        package.json（项目依赖 + 运行 / 打包脚本
# vite.config.js（Vite 打包 / 运行配置）
自定义 Vite 的构建规则，比如打包输出目录、静态资源处理、端口等
# .env（环境变量配置）
# 使用步骤（打包 + 运行）
## 1. 初始化项目（首次使用）
# 1. 进入项目根目录
cd language-teaching-system

# 2. 初始化npm（如果未初始化）
npm init -y

# 3. 安装依赖
npm install

## 2. 开发环境运行（热更新）
npm run dev
# 自动打开浏览器，访问http://localhost:8080即可看到登录页

## 3.生产环境打包
  npm run build
  -- 打包完成后，生成dist目录，包含所有可部署的静态文件
  --  预览打包后的文件
 npm run preview
  本地预览打包后的效果，验证是否正常运行
# 部署说明
  打包后的dist目录是纯静态文件，可部署到任意 Web 服务器：
Nginx 部署：将 dist 目录复制到 Nginx 的html目录，修改 Nginx 配置（可选，解决路由问题）；
静态服务器：如 Netlify、Vercel、GitHub Pages，直接上传 dist 目录即可；
后端集成：将 dist 目录复制到后端项目的静态资源目录（如 SpringBoot 的resources/static）。

# 总结
核心配置文件包含package.json（依赖 / 脚本）、vite.config.js（打包规则）、.env（环境变量），实现标准化打包运行；
采用多页面打包配置，适配你的登录页 + 管理端 + 教师端 + 学生端多页面结构；
开发环境支持热更新、自动打开浏览器，生产环境打包自动压缩代码、移除 console；
环境变量分离 API 地址，避免硬编码，便于开发 / 生产环境切换。
