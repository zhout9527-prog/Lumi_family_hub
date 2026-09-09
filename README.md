# Lumi Family Hub

Lumi 是面向家庭的媒体与学习平台，目前处于初始开发阶段，接口、目录和交互仍可能调整。代码按两个独立产品组织：

- `Lumi Server`：运行在 Windows 10/11 家庭主机上，负责运维账户、API、SQLite、资源下载、隔离审核和本地媒体库。
- `Lumi Client`：运行在 Windows、Android 手机和 Android TV，仅供儿童与家长登录并访问家庭内容。

当前开发基线：Windows Server `0.4.0`，Windows/Android Client `0.3.0`。源码位于 [`family-platform`](family-platform)，当前实现边界见 [`family-platform/IMPLEMENTATION.md`](family-platform/IMPLEMENTATION.md)。

## 快速验证

```powershell
cd family-platform
npm install
npm run typecheck
npm run build:client
npm run build:server
.\.venv\Scripts\python.exe -m pytest backend -q
```

安装包属于构建产物，不纳入本仓库。本地构建后位于 `family-platform\artifacts`；达到可发布状态后，再通过独立发布渠道分发并附带 SHA-256 与代码签名。

平台只处理家庭有权使用的资源，不绕过付费、DRM、验证码或站点保护。Server 支持把本地视频、图书、音乐和图片导入隔离区，也支持登记公开的 Bilibili 单视频、空间/收藏夹/合集同步源；需要登录的平台由家长在官方客户端完成授权或转存，Lumi 只保存必要的链接与元数据，并在入库前执行隔离和人工审核。
