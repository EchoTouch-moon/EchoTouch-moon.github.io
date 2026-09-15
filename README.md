# 🖋 Creative Blog Templates — Markdown 双主题博客

01 **Dithered Ink** 与 02 **The Blue Notebook** 现在共用一套 Eleventy + Markdown 内容系统：文章只写一次，会自动生成两套不同排版的纯静态页面；03–05 仍保留为可直接打开的手写 HTML 模板。发布后的 01/02 没有前端框架运行时，原有 WebGL 动效、主题切换和阅读交互都被保留。

> 第一次运行：在本目录执行 `npm install`，随后执行 `npm run dev`，打开终端给出的本地地址。文章统一放在 `site/posts/`，可复制根目录的 `post-template.md` 开始写作。

---

## 一、你给的两个网站是怎么实现的？

两个站点托管在 **GitHub Pages**（响应头 `server: GitHub.com`，Fastly CDN 分发），本质是**纯静态 HTML**。深入源码后的完整技术画像：

| 维度 | dark.ronacher.eu «Dark Thoughts» | lucumr.pocoo.org |
|---|---|---|
| 内容来源 | 自写 Python 构建脚本生成的静态页 | **reStructuredText** + 小型自定义构建脚本（[mitsuhiko/lucumr](https://github.com/mitsuhiko/lucumr)） |
| 导航体验 | **htmx**：`hx-boost="true"` 只替换 `div.body`，局部换页无整页刷新 | 同样 htmx boost + head-support 扩展 |
| 招牌视觉 | `<canvas>` 头图：**WebGL shader 做 8×8 Bayer 有序抖动**（支持 `?dither=atkinson\|noise`），图片被渲染成单色墨点 | 头像圆形描边光晕、条目标题尾部 `—`、日期左栏 |
| 明暗主题 | `data-theme` 属性 + `light-dark()` CSS 函数 + localStorage 记忆，radio 切换 auto/light/dark | 相同机制 |
| 排版 | Crimson Text 正文 / Playfair Display 标题 / Ubuntu Mono 代码 | Lora 标题 / Merriweather 强调 / Ubuntu Mono 代码 |
| 配色 | 暖褐羊皮纸 ↔ 近黑咖啡 | 白纸蓝墨 ↔ 深海军蓝 |
| 细节彩蛋 | 文章超过一年自动追加「this article is N years old」徽章；`<script type="speculationrules">` 预取 | 每页可 **copy as markdown**（甚至 Ctrl+C 无选中时触发）；Pygments 代码高亮 |

一句话总结：**没有 React/Vue/Gatsby，只有手写 HTML + 少量 htmx + 一个构建脚本**。这正是它经久耐看的原因。

---

## 二、五套模板总览

| # | 目录 | 名称 | 美学关键词 | 字体体系 | JS 用量 | 直接致敬 |
|---|---|---|---|---|---|---|
| 01 | `01-dithered-ink/` | **Dithered Ink** | 暖褐羊皮纸 · 抖动画布 · 双主题 | Fraunces + EB Garamond + IBM Plex Mono | ~200 行（主题+画布+年代徽章） | dark.ronacher.eu |
| 02 | `02-blue-notebook/` | **The Blue Notebook** | 蓝墨水日记本 · 圆环头像 · em-dash | Lora + Merriweather + Ubuntu Mono | ~90 行（主题+copy-as-markdown） | lucumr.pocoo.org |
| 03 | `03-phosphor-terminal/` | **Phosphor Terminal** | CRT 终端 · 扫描线 · 全等宽绿磷光↔琥珀 | VT323 + Spline Sans Mono | ~120 行（打字机+j/k 键盘导航） | 终端极客文化 |
| 04 | `04-editorial-nocturne/` | **The Nightjar Review** | 文学期刊 · 首字下沉 · Tufte 边注 · 纸纹颗粒 | Newsreader + Spectral + JetBrains Mono | **0 行（纯 CSS）** | 杂志/Tufte CSS |
| 05 | `05-aurora-glass/` | **Afterglow** | 玻璃拟态 · 流动极光 · 渐变进度条 | Sora + Instrument Sans + Space Mono | ~60 行（进度条+滚动显现） | 当代 glassmorphism |

每个目录统一包含三页：

```
index.html   首页 / 文章列表
post.html    文章排版样板（h2/h3、代码高亮块、引用、脚注、标签、上下篇）
about.html   关于页 / colophon
assets/style.css + assets/app.js
```

### 如何选

- 喜欢 Armin 的两款就选 **01**（更文艺、有动态头图）或 **02**（更清爽、功能最贴近原站）。
- 追求个性表达、写的是短小技术札记 → **03**。
- 写长文、随笔、论文式内容 → **04**（边注与首字下沉为长阅读而生）。
- 想要现代感、作品集气质 → **05**。

---

## 三、各模板亮点速览

### 01 · Dithered Ink —— 抖动墨迹（v6 · 三幕场景 + 插件化引擎）

- 头图为**从零手写的 WebGL 片元着色器**，每个场景都是一段小叙事，经 **8×8 Bayer 有序抖动**逐设备像素变成 1-bit 墨点（边缘完全锐利）。场景已插件化：`window.__INK_SCENES.名字 = "GLSL"` 即可注册新场景，引擎自动汇编。
- `?scene=rain` 💧 **雨落水面**（默认）：26 根"雨柱"——每轮的位置/速度/雨丝长度/落点**重新随机**（周期号做哈希种子，永不重复）；雨丝带亮头、尾迹严格拖在头后，斜向落入水面后**在落点消失**并激起短促水花 + 两圈透视压扁的椭圆涟漪；水面为随风横移的微光波纹。雨强同时控制密度/速度/涟漪/节奏（暴雨循环更快）：`&rain=drizzle|light|heavy|storm`，默认 `auto` 每 44 秒微雨↔暴雨自动渐变。
- `?scene=clouds` ☁️ **流云**：7 朵独立的云，随机形状/位置/速度，近层慢远层快的视差，飘出画面后从另一侧循环回归；纯天空无其他元素。
- `?scene=willow` 🌿 **垂柳**：摄影式裁切——**106 条柳丝分四层**（后层 34 条浅细短=自然虚化感，中 26、前 26 条深粗长，顶部另有 16 条深色短穗形成参差叶缘）。每条柳丝挂着**独立的斜向披针形柳叶**（逐叶随机长度/角度/疏密，左右交替、随枝条摆动），叶数随枝长缩放保证密度均匀；阵风扫过时叶尖摆幅最大。
- `?scene=dunes` ☀️ 环形太阳与沙丘（内置场景，保留作对比）。
- **媒体模式**：画布加 `data-src="视频.mp4|照片.jpg"`，同一 shader 把你的素材抖动成同款效果。
- 主题系统：auto/light/dark 三态 radio + localStorage + `?theme=` URL 强制；reduced-motion 静帧；页签隐藏/滚出视口停帧。
- 文章超过一年自动出现橙色小徽章「this piece is N years old」。

### 02 · The Blue Notebook —— 蓝色笔记簿（v5 · 直接采用原版 WebGL 水面）

- 招牌动画 **Blue Tide**：**直接搬用 lucumr.pocoo.org 的 WebGL 水面 shader 与渲染循环**（作者 Armin Ronacher，源码见 [github.com/mitsuhiko/lucumr](https://github.com/mitsuhiko/lucumr)）——metaball 场、Wind Waker 配色、波线噪声、沿岸 pooling、悬停红点缀逐颗浮现（2.65s 线性爬坡 + 随机延迟）、~30fps 节流、视口/页签停帧、低 DPI 1.5× 超采样，全部原汁原味。**按设备像素渲染，边缘锐利**（此前 Canvas2D 移植版模糊的根源即在此）。
- 相对原版的仅有三处适配：空置区颜色与红色点缀改为从本站 CSS 变量（`--bg`/`--secondary`）读入的 uniform，保证与页面无缝融合；画布按 `.tide-canvas` 类发现；`prefers-reduced-motion` 只渲染单帧静画。
- 布局同原站：页首 150px（波线在 50px），**页尾 450px 整片海洋**（波线悬顶，即原版 `u_fadeTop`）。
- **主题切换 300ms 交叉淡化**：`data-initial-load` 属性压制首帧过渡（无闪白），落幕后 JS 移除属性、色彩开始渐变——lucumr 同款技巧；`(update: slow)` 慢速设备自动禁用。
- **页面间交叉淡化**：View Transitions API 的 `@view-transition { navigation: auto }`（现代浏览器 MPA 渐进增强，替代原站 htmx-boost 的顺滑感）+ speculationrules 预取。
- 微交互全家桶（全部 vanilla、全部尊重 reduced-motion / hover:hover）：
  条目行 hover 时**日期与标题缓缓分离**（manuelmoreale.com 的 gap-slide）、
  链接下划线**墨迹加粗**（cassidoo.co）、
  标题 hover 浮现 `#` 锚点、
  脚注↔引用**双向配对高亮**（悬停其一，其余淡出）、
  代码块 ghost copy 按钮（copied ✓ 1.4s 回弹）、
  表格行高亮、外部链接 `↗` 标记、
  文章标题旁实时 **≈ N min read**、超一年自动出现斜体 *N years old* 徽章、
  右下角返回顶部圆钮、页脚 **本地时钟 + 分时段问候**（good evening…）、
  头像光环 4s 呼吸脉动（hover 时暂停）。
- 完整复刻「auto/light/dark」三态主题 radio + localStorage 记忆 + 系统跟随（`light-dark()` + `color-scheme` 翻转）。

### 03 · Phosphor Terminal —— 磷光终端
- 整站一种字体气质：巨型 VT323 提示符打字机开场 + 光标闪烁；列表伪装成 `ls -lt` 输出。
- 底部常驻状态栏（NORMAL · 路径 · 编码）；CRT 扫描线和暗角只是一个固定定位伪元素。
- 绿磷光 ↔ 琥珀一键换管；`j/k` 移动选择、`/` 聚焦搜索框（输入框内不劫持按键）。
- v2 新增：终端风返回顶部 `[↥ cd ..]`（过 1.2 屏或短页 60% 自动浮现）、代码块 hover 复制按钮、speculationrules 预取。
- v3 新增：状态栏 **vim 式实时滚动百分比**（Top/37%/Bot/All）、目录行 hover/j-k 聚焦时浮现亮色 `>` 游标。

### 04 · The Nightjar Review —— 夜鹰评论
- **全站零 JavaScript**：颗粒纹理是内联 SVG feTurbulence data-URI；边注是 float；首字下沉是 `::first-letter`。
- 期刊版式：双细线报头、VOL 刊号行、两栏带中缝线的 Contents、罗马数字年份。
- ≥1120px 宽屏时文章右侧预留真实外白边距放 Tufte 式边注，窄屏时边注优雅折回行内。
- v2 新增（仍是纯 CSS）：目录条目 hover 时**编号与标题缓缓分开**、下划线墨迹加粗、外部链接 `↗`、金色选区、标题 `text-wrap: balance`。
- v3 新增（依然零 JS）：**CSS 滚动驱动显现**——目录条目/专题/花饰随滚动进入视口时淡入上浮（`animation-timeline: view()`，`@supports` 渐进增强，不支持的浏览器与 reduced-motion 直接静态呈现）。

### 05 · Afterglow —— 余晖
- 三团 radial-gradient 以 26s/32s/38s 异步漂移制造「永不重复」的天空，只在 `transform` 上做动画并对 reduced-motion 自动冻结。
- sticky 玻璃胶囊导航、毛玻璃卡片网格 + hover 抬升发光、渐变阅读进度条、IntersectionObserver 错峰显现。
- 文章页根据实际字数实时估算「N min read」。
- v2 新增：标题 hover 浮现青色 `#` 锚点（平滑滚动、避开 sticky 导航）、代码块复制按钮、玻璃返回顶部圆钮、正文外部链接 `↗`。
- v3 新增：**极光随鼠标轻轻倾斜**（三团光晕各按不同系数视差移动，`translate` 属性与关键帧动画正交叠加）、**卡片青色光晕跟随光标**（220px 径向高光，hover 才出现，触屏干净）；顺手修复了无 `.reveal` 元素页面阅读时长不计算的 bug。

---

## 四、发布工作流（写给三个月后的你）

1. **写作**：复制 `post-template.md` 到 `site/posts/你的文章名.md`，填写标题、摘要、日期、标签，然后用普通 Markdown 写正文。`draft: true` 可在本地预览，但不会进入正式构建。
2. **本地预览**：第一次执行 `npm install`，以后只需 `npm run dev`。01 和 02 会同时更新；`npm run build` 会把最终静态站写入 `_site/`。
3. **上线 GitHub Pages**：将整个 `blog-templates` 根目录作为一个仓库推送，不要只上传 01 子目录。
   ```bash
   cd 你的仓库
   git init -b main
   git add . && git commit -m "feat: publish blog"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```
4. 在 GitHub 打开 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。根目录的工作流会安装依赖、生成 `_site/` 并自动适配项目仓库的子路径；之后每次推送都会更新博客。

内容与主题的职责分开：`site/posts/` 是唯一文章源，`site/_includes/layouts/` 是两套页面骨架，01/02 各自的 `assets/` 继续负责视觉和动画。站点标题、简介等公共信息集中在 `site/_data/sites.js`。

---

## ⚠️ 版权与授权须知（务必阅读）

调研确认（2026-08，GitHub API 实查）：

- **lucumr.pocoo.org**：源码在 [mitsuhiko/lucumr](https://github.com/mitsuhiko/lucumr)，**公开但非开源**——其 LICENSE 第一句即 *"This repository is **not** open source."*，CC 协议只覆盖站点文章文字。
- **dark.ronacher.eu**：源码在 [mitsuhiko/dark](https://github.com/mitsuhiko/dark)，**没有任何 LICENSE 文件** = 默认版权全保留。

含义与建议：

- 模板 **02** 的水面动画是**逐行搬用的原版 shader**（应用户要求，文件头已注明出处）。**本地自用/学习没问题；若博客要公开发布**，请二选一：① 邮件询问作者授权（Armin Ronacher 以好说话著称）；② 换回自写实现。
- 模板 **01** 的抖动横幅是**原创实现**（Bayer 抖动是公开算法，代码未抄任何仓库），可放心发布。
- 其余 03/04/05 全部为本项目原创，无版权顾虑。

---


## 五、附录：值得长期参考的创意博客及其技术栈（2026 年实况）

| 博主 / 站点 | 特点 | 技术 |
|---|---|---|
| [lucumr.pocoo.org](https://lucumr.pocoo.org/) | 蓝墨水日志、copy-as-md | reST + 自写脚本 + htmx + GitHub Pages |
| [dark.ronacher.eu](https://dark.ronacher.eu/) | WebGL 抖动头图 | 同上 |
| [overreacted.io](https://overreacted.io/)（Dan Abramov） | 深蓝夜读排版、代码主题随页配色 | Next.js |
| [joshwcomeau.com](https://www.joshwcomeau.com/) | 交互玩具最多的博客之一 | Next.js + 大量自定义动效组件 |
| [ciechanow.ski](https://ciechanow.ski/)（Bartosz Ciechanowski） | 天花板级可交互解说（齿轮、GPS、声学…） | Astro + 手写 TS 可视化 |
| [wattenberger.com](https://wattenberger.com/)（Amelia Wattenberger） | 拟物隐喻、金鱼引导 | 定制前端 |
| [rauno.me](https://rauno.me/) | 微交互博物馆 | Next.js |
| [thesephist.com](https://thesephist.com/)（Linus Lee） | 词语索引式导航、可检索生平 | Hugo |
| [antfu.me](https://antfu.me/) | 极简双栏、幻灯片式分享 | VitePress 风格自建 |
| [sive.rs](https://sive.rs/)（Derek Sivers） | 「一本书就是一页」大字号极简 | 手写 HTML |
| [danluu.com](https://danluu.com/) | 反设计的极端案例：连 CSS 都没有 | 单文件 HTML |
| [rachelbythebay.org](http://rachelbythebay.org/w/) | 高密度工程写作、九十年代风 | 手写 HTML |
| [drewdevault.com](https://drewdevault.com/) | 无 JS 卫道士 | 手写 HTML |
| [fabiensanglard.net](https://fabiensanglard.net/) | 老派表格布局的书卷气 | 手写 HTML |

共同规律：**没有一个炫技堆料胜过 “一种字体气质 × 一处签名细节” 的组合**（Armin 是抖动墨点，Ciechanowski 是可拖动的物理仿真，Sivers 是近乎固执的字号）。

---

*Templates written August 2026 · CC BY-NC 4.0 · Edit freely, attribute gently.*
