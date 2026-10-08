# tools/qa — 无头浏览器自验 / 测量脚本

从 2026-10 的会话临时目录迁入仓库,供任何会话复用。全部是 Python + Chrome DevTools 协议驱动 Edge 无头浏览器。

## 硬规则

- **一次只跑一个脚本 / 一个无头 Edge**:并行会把整机拖死(2026-10-06 CPU 95% 卡死)。
- **只杀自己的浏览器进程**:按命令行里的 `lootchain-qa\edge_` 过滤,不要 `taskkill /IM msedge.exe`(会杀掉用户自己的 Edge)。
- **跑完删掉浏览器配置目录**(每个 30~400MB,堆多了 C 盘会满):

```powershell
Get-CimInstance Win32_Process -Filter "name='msedge.exe'" | Where-Object { $_.CommandLine -like '*lootchain-qa\edge_*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-ChildItem "$env:TEMP\lootchain-qa" -Directory -Filter 'edge_*' | Remove-Item -Recurse -Force
```

- 用户真实账号(`hero_tour.py` / `panel_tour.py` 默认 dev-login userId=1)上**只看 / 开 / 关**,不做任何改数据的操作。

## 目录与环境变量

| 项 | 说明 |
|---|---|
| 输出目录 | `%TEMP%\lootchain-qa`(`LC_QA_OUT` 覆盖):`edge_*` 浏览器配置、`shots\` 截图 |
| `PREVIEW_PORT` | 7456 = Creator 预览(可拿到 TS 模块,能改 sim);7460 = 正式包(`tools/local-serve/serve_release.py`) |
| `EDGE_PORT` / `EDGE_PROFILE` | 调试端口 / 配置目录名(默认 9334 / edge_boss_profile) |

`boss_bar_cdp.py` 是公共底座(启动、登录 `guidetest02`、找根节点);`js_battle2.js`(预览,挂 `window.__M` 模型模块)/ `js_battle_release.js`(正式包)负责进战场。

## 常用脚本

| 脚本 | 用途 |
|---|---|
| `rush_perf_cdp.py <tag> [smooth\|ultra] [秒]` | 正式包手机参数打一局:加载门逐资源耗时、每 10 秒帧间隔 / 显存 / 节点 / 骨骼数、中途 20 秒 CPU 剖析 |
| `ult_hu_cdp.py <tag> [--codes A,B]` | 预览里逐个英雄放专属大招,峰值时刻定格截图 |
| `hero_tour.py <tag> 844x390m 667x375m 1600x900` | 英雄详情各页签截图;`HERO_EXTRA=steps.json` 自定义步骤(见 `equip_tap_steps.json`) |
| `panel_tour.py` | 大厅各面板截图巡检 |
| `boot_stuck_cdp.py <url> <mode> <tag>` | 登录 → 刷新,记录启动视图序列与异常(验证直进大厅) |
| `gfx_release_cdp.py <url>` | 读正式包各画质档画布像素 |
| `texmem_cdp.py` / `texmem_prof_cdp.py` | 显存账:按贴图列出占用 + 进场卡顿剖析 |
| `perf_cdp.py` / `dc_cdp.py` | CPU 剖析 / 绘制调用统计 |
| `soak_cdp.py` / `soak_rush_cdp.py` | 挂机压测,抓战斗循环异常 |
| `melee_probe_cdp.py` | 怪物钉在水晶前,统计各英雄出手事件与动画 |
| `fullpack_cdp.py` / `switch_wait.py` / `input_keep_cdp.py` / `battle_ui_cdp.py` | 首访整包下载 / 切页等待 / 输入框保持 / 战斗设置界面 |

## fxprev/ — 满屏大招(hu_*)选型与贴图处理

`server.py` + `index.html` + `spine-webgl.js` 是 spine 4.2 无头渲染页;`run_hu.py` / `win_hu.py` / `big_hu.py` / `core_hu.py` 出横条、时间窗口、铺满插槽、包围盒;
`picks_hu.json` 是 22 英雄的映射源。`hu_fix_tex.py` 从 `素材原始备份/hu-ult-pma-20261006` 重算图集(铺满帧椭圆柔边 + 预乘),`--write` 才落盘。
素材源默认 `D:\骨骼动画素材\hero_ult_out_4243\hero_ult_out_4243`。
