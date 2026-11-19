# 霓虹街区 (Neon Street Block)

单街区 3D 霓虹赛博网页场景（Neon Street Block），可静态部署于 GitHub Pages。

- **在线演示地址**：[https://sovlyn.github.io/neon_street_gemini/](https://sovlyn.github.io/neon_street_gemini/)

---

## 核心特性清单

- **低多边形程序化单街区**：包含南北楼宇、横/竖/天台霓虹招牌、四车道湿滑街面、人行横道、路灯、运河与拱桥、街面积水、贩卖机与管线。
- **昼夜 24 小时时间滑块与自动循环**：联动天空光照、霓虹亮度、建筑亮窗率、车流密度。
- **天气与氛围系统**：支持晴 / 微雨 / 暴雨 / 飘雪 + 可选雾效 + 湿地面与运河倒影水波。
- **动态交通与行人**：多车道车流、红绿灯队列、车灯与发光尾灯拖尾；撑伞行人剪影。
- **瞬时点击交互**：
  - 点击霓虹招牌产生闪烁故障。
  - 点击路灯切换开关。
  - 点击运河与积水生成水面涟漪。
- **多主题与场景预设**：
  - 5 套配色主题（赛博东京 / 九龙霓虹 / 蒸汽幻梦 / 琥珀雨夜 / 幽翠赛博，UI 与 3D 色板联动）。
  - 4 套场景预设。
- **种子与分享机制**：程序化“换一条街”（种子生成）+ 可分享 URL 参数（`t`, `auto`, `w`, `f`, `p`, `s`, `fx`, `cam`, `txt`）。
- **低频无害随机彩蛋**：UFO 掠过夜空、霓虹黑猫窜过街角、整街霓虹电压同步闪烁。
- **摄影模式**：隐藏 UI、暂停画面、导出高分辨率 PNG；支持快捷键（`H` 摄影模式、`Space` 暂停、`P` 导出 PNG、`R` 换一条街、`Esc` 退出）。
- **后处理管线**：内置 `UnrealBloomPass` 泛光 + 可开关色差/胶片噪点/暗角。
- **进阶趣味项**：自定义主招牌文字输入、自动运镜开关。

---

## 技术架构

### 1. Rust -> WebAssembly (`src/`)
- **核心依赖**：`wasm-bindgen = 0.2.130`（构建时采用 `--target web`，开启 release 优化、`opt-level = "s"` 及 LTO）。
- **职责划分**：
  - `rng.rs` / `noise`：确定性 PRNG 与噪声生成。
  - `generator.rs`：单街区程序化生成。
  - `environment.rs`：昼夜与天气状态机。
  - `traffic.rs`：多车道车流与红绿灯。
  - `pedestrians.rs`：撑伞行人状态机。
  - `water.rs`：水面波纹与点击涟漪。
  - `particles.rs`：雨雪粒子物理计算。
  - `events.rs`：彩蛋调度器。
- **数据同步**：通过 `Float32Array` 平面缓冲向 JS 高效同步每帧动态数据。

### 2. TypeScript + Three.js (`web/`)
- **核心技术栈**：Vite + TypeScript。
- **渲染与交互**：Three.js 3D 渲染、程序化 CanvasTexture 霓虹招牌、Planar `Reflector` + 自定义 GLSL 水波涟漪着色器、`EffectComposer` 后处理、Raycaster 点击拾取、主题联动 HUD 与 URL 状态读写。

---

## 依赖说明 & 本地构建/运行/测试命令

### 环境要求
- **Rust stable**（需包含 `wasm32-unknown-unknown` target）
- **wasm-bindgen-cli 0.2.130**
- **Node.js 22+ / npm 10+**

### 常用命令
```bash
# 安装依赖
npm install

# 编译 Rust Release WASM 并生成 web/wasm/pkg/
npm run build:wasm

# 本地开发预览
npm run dev

# TypeScript 类型检查
npm run typecheck

# 运行 Rust 测试与 Clippy 检查
cargo test
cargo clippy --all-targets -- -D warnings

# 运行前端 Vitest 单元测试
npm test

# 生产环境打包（WASM + 类型检查 + Vite 产出至 dist/）
npm run build

# 运行 Playwright 端到端浏览器验证
npm run test:e2e
```

---

## GitHub Actions CI & GitHub Pages 部署说明

- **`.github/workflows/ci.yml`**：每次推送（push）或拉取请求（PR）时，自动执行 `cargo test`、`cargo clippy`、WASM 构建、`tsc`、Vitest、Vite 构建及 Playwright E2E 测试。
- **`.github/workflows/deploy-pages.yml`**：当代码推送到 `master` 分支时，自动设置 `VITE_BASE=/neon_street_gemini/` 并构建部署至 GitHub Pages。

---

## 资产清单与许可证

- **100% 程序化生成**：本项目所有 3D 几何体、霓虹招牌文字、湿滑沥青、光晕贴图、雨雪、车流与行人剪影均由代码与 HTML5 Canvas 纹理**程序化生成**，**未引入任何外部第三方模型、图片、字体或 CDN 静态资产**，从根本上杜绝外部许可风险与 CDN 失效风险。
- **核心开源库依赖许可简表**：
  - `three`: MIT
  - `vite`: MIT
  - `wasm-bindgen`: MIT / Apache-2.0
  - `serde` / `serde_json`: MIT / Apache-2.0

---

## 已知限制

1. 仅面向桌面端现代浏览器（需支持 WebGL 2 与 WebAssembly），不提供移动端触控与低端设备降级适配。
2. 无音频/音效系统。
3. 单街区范围有限（72m 尺度），不提供无限延展城市或第一人称地面漫游。
4. 在纯软件渲染（如无头 SwiftShader）环境下，高分辨率反射帧率会低于独立或集成 GPU。
