# 七域源纪 UI

七域源纪 SillyTavern 角色卡的远程 HTML UI 骨架。

## 加载方式

由角色卡的 regex_scripts 通过 jsDelivr CDN 加载：

```
https://cdn.jsdelivr.net/gh/Anastasia2372/qiyuyuanji@main/index.html
```

## 阶段进度

- 阶段一（已完成）：最小骨架——深色主题 + 渐变流光 + 毛玻璃悬浮球菜单 + 拖动 + 标题入场动画
- 阶段二（待做）：7 块玩法面板填充——同伴 / 空岛 / 副职 / 钓鱼 / 种地 / 世界事件 / 声望
- 阶段三（待做）：教学助手浮窗 + 立绘头像 + EWA 集成

## 文件

- `index.html` 主页
- `style.css` 样式（深色 + 金色 / 蓝白 + 飘逸书法字体 + 流光粒子）
- `main.js` 悬浮球交互逻辑（toggle / 拖动 / 位置持久化）
