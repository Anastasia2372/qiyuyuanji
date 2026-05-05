# 七域源纪 UI

七域源纪 SillyTavern 角色卡的远程 HTML UI。

## 加载方式

由角色卡的 regex_scripts 通过 jsDelivr CDN 加载：

```
https://cdn.jsdelivr.net/gh/Anastasia2372/qiyuyuanji@main/index.html
```

## 当前版本（阶段二·完整伪零层）

- fixed 全屏覆盖，主动隐藏 SillyTavern 默认对话流
- 顶部状态栏（领主信息 / 阶级 / 势力 / 天元 / 位置 / 时辰 / 在场角色 / 难度）
- 中间对话流（按 stat_data 实时渲染 gametxt 内容，不显示 UpdateVariable）
- 底部输入框（直接发送，绕过 SillyTavern 默认输入区）
- 悬浮球 + 13 项菜单（玩家/同伴/空岛/副职/钓鱼/种地/世界事件/声望/动态/图鉴/难度/教学/设置）
- 13 个数据绑定面板（点菜单弹出，从 stat_data 读对应字段渲染）
- ESC 切换全屏显隐（临时退出伪零层看 ST 默认界面）

## 文件

- `index.html` 入口 stub（仅加载 main.js）
- `style.css` 样式（深色 + 流光 + 毛玻璃 + 金色蓝白 + 飘逸书法字体）
- `main.js` 核心逻辑（接管屏幕 + MVU 绑定 + 13 面板 + 输入交互 + ESC 切换）
