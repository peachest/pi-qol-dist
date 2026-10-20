# @peachest/pi-qol-dist

[@vanillagreen/pi-qol](https://github.com/vanillagreencom/kendex/tree/main/pi-extensions/pi-qol) 的预打包发布（esbuild bundle），消除 Pi 启动时 jiti 逐模块转译税（38 模块 ≈ -800ms TUI 就绪）。

## 为什么存在

pi 用 jiti 现场转译 .ts 扩展；pi-qol 的 38 个 TS 模块在暖缓存下仍有 ~800ms 逐文件装载开销。
本仓由 GitHub Actions 自动从上游 kendex monorepo 构建 bundle 并打 tag，`src/` 保留上游源码快照。

## 安装

```bash
pi install git:github.com/peachest/pi-qol-dist@<tag>
# 或浮动分支（自动跟随最新构建，自担风险）
pi install git:github.com/peachest/pi-qol-dist#dist-main
```

## 上游更新流程

自动：每日 cron 检测上游变更 → 重建 → 打 `v<upstream>-b<n>` tag。
手动：Actions 页 "build-from-upstream" → Run workflow → 填上游 ref。

升级本机：`pi update --extensions`（reconcile 到 settings 里钉的 ref）或改 settings 里的 tag。

## 构建

`./build.sh`（期望 `src/` 已有上游快照）。
