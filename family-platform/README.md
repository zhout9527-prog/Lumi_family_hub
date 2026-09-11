# 家庭探索馆

家庭媒体与学习平台的第一阶段可运行实现。正式应用拆成两个独立产品：`Lumi Server` 只在 Windows 家庭主机上运行，负责运维界面、账号、数据库、API 和后台任务；`Lumi Client` 安装在 Windows、Android 手机或 Android TV，只提供儿童和家长功能。播放、阅读和音频服务可以按需接入 Jellyfin、Kavita、Audiobookshelf 等专用服务。

| 应用 | 安装位置 | 可登录角色 | 是否携带服务端 |
| --- | --- | --- | --- |
| Lumi Server | Windows 10/11 家庭主机 | `operator` | 是，自动启动 API、Worker 和 SQLite |
| Lumi Client | Windows 10/11、Android 手机、Android TV | `child`、`guardian` | 否，连接家庭主机 |

本仓库只发布源码；家庭平台的阶段设计文档保留在开发工作区，不随源码仓库发布。`IMPLEMENTATION.md` 是随源码维护的实现边界、角色流程和接口说明。

## 已交付

- Server 首次创建运维账户并设置密保，之后可在 Server 本机新增运维或找回密码；Client 提交儿童/家长注册申请，运维审批后登录
- Client 与 Server 在编译、包名、导航和后端权限上隔离，不能靠切换菜单越权
- 动画、图书、音频、益智游戏、创作和户外发现的统一目录
- 家长 Client 独有的家庭海报墙，可在全部、本地和在线影片之间筛选、收藏并直接播放；儿童账户不返回该导航入口
- Client 内置跨 Windows、Android 手机和 Android TV 的俄罗斯方块，规则内核统一，分别适配键盘、触控按钮与电视遥控器
- Server 可配置视频、图书、音乐、图片、缓存、投递箱和隔离区目录，并扫描、导入、编辑、发布或归档本机资源
- 支持开放媒体直链、B站按需播放以及抖音/夸克等官方页面入口；在线项目只保存链接、封面与元数据，不长期占用家庭硬盘
- B站空间、收藏夹和合集可保存为同步源，由 Worker 定时更新标题、封面和播放入口
- 儿童请求、家长审批、候选资源登记、管理员处理队列
- 来源白名单、许可/条款确认、私网 URL 防护、文件签名和压缩包路径检查
- 隔离区、人工确认入库、暂停/恢复/重试、审计日志、夜间摘要
- SQLite 默认存储，Alembic 迁移；可切换 PostgreSQL
- PWA、响应式界面、局域网浏览器访问
- PC 原生启动脚本、备份脚本、Worker 单次运行脚本和开机任务脚本
- Docker Compose 基础栈，以及可选的 Jellyfin/Kavita/Audiobookshelf 服务
- 原生跨平台壳层：Tauri 2 Windows 独立 EXE/NSIS `setup.exe`、Android 手机 APK/AAB、Android TV Leanback 入口

平台不会自动登录百度网盘、夸克网盘或 UP 主账号，也不会绕过付费、DRM、验证码或站点保护。家长可以使用对应平台的官方客户端手动下载/转存到 `inbox\cloud`，平台只负责后续校验、隔离、审核和入库。Bilibili 公开视频可以由 Server 的运维队列调用内置的 `yt-dlp + FFmpeg` 下载；任务仍必须经过家庭使用权利确认、隔离扫描和人工审核，但不强制填写公开的权利证明链接。来源地址或授权说明只是可选的内部备注，儿童端看不到这些信息和下载操作。

### Server 就是家庭主机

`Lumi Server` 不是“还要再连接一台主机”的客户端，它本身就是运行在家庭 PC/NAS 上的主机服务。Server 安装包启动两个进程：Windows 原生界面用于运维，内置 Core 监听 `8000` 端口并负责数据库、文件、Worker 和 API。Server 界面中显示的“本机服务”只是对自身 Core 的健康检查，不需要配置另一台主机。`Lumi Client` 才需要填写“家庭主机地址”：同一台电脑填 `127.0.0.1:8000`，局域网设备填运行 Server 的电脑的固定局域网地址（例如 `192.168.1.20:8000`）。

连接关系只有一条：

```text
Windows Server（家庭 PC）
  ├─ 运维界面 + API + Worker + SQLite
  ├─ 资源目录：inbox -> quarantine -> library
  └─ 监听 0.0.0.0:8000
        ↑ HTTP/HTTPS（局域网或 Tailscale）
Windows/Android/Android TV Client（儿童、家长）
```

首次启动只能从 Server 本机创建首个运维账户，创建时必须同时设置密保问题和答案。后续登录页保留“新增运维”和“找回密码”入口，这两项接口同样只接受本机回环请求，局域网或互联网客户端不能调用。密码和密保答案均不以明文保存：数据库只保存独立随机盐和带算法、迭代次数版本的 PBKDF2-HMAC-SHA256 摘要；密保问题以明文保存，用于恢复时展示；会话只保存令牌摘要。数据库固定默认位于 Windows `%LOCALAPPDATA%\cn.lumi.familyhub.server\runtime\data\familyhub.db`，由当前 Windows 用户的文件权限保护。建议使用独立 Windows 账户、BitLocker，并定期执行备份。

从旧版升级且尚未设置密保的运维账户，会在首次进入“找回密码”时显示一次性本机迁移流程：设置密保问题、答案和新密码。完成后，后续恢复必须正确回答密保问题。这个兼容入口以“能登录 Server 所在 Windows 电脑”为可信边界，因此不应让儿童使用该 Windows 账户。

## PC 快速安装

日常使用不要求安装 Python、Node.js 或编译工具。优先运行：

```text
artifacts\windows\Lumi-Server_0.5.2_x64-setup.exe
```

不想安装时，完整保留并运行便携目录；其中两个 EXE 缺一不可：

```text
artifacts\windows\Lumi-Server_0.5.2_x64-portable\
  lumi-server.exe
  lumi-server-core\
    lumi-server-core.exe
    （Server Core 运行库文件）
```

`artifacts\windows\lumi-server_0.5.2_x64.exe` 可以直接在产物目录中双击，但必须和同目录的 `lumi-server-core\` 文件夹一起保留；移动到其他电脑时应整体复制便携目录。安装版会自动把两部分安装到正确位置。

首次打开 Server 会在本机创建数据目录并显示“创建首个运维账户”。密码至少 10 位，并且必须填写密保问题和答案；按钮只在提交期间禁用，输入不符合要求时会显示明确提示。创建后，用该账户登录 Server。已有账户可从登录页进入“找回密码”，也可创建另一个运维账户作为备用。家庭成员在 Client 的“注册申请”页提交儿童或家长账户，运维人员在 Server 的“账户管理”中批准，获批账户随后才能登录 Client。运维账户也可以登录 Client，但服务端只签发 `guardian` 范围的会话，不能从 Client 调用运维接口。界面中的称呼始终取服务器账户的显示名称，不写死某个孩子名字。

同一台 PC 上的 Client 默认访问 `127.0.0.1:8000`。Android 首次还不知道家庭主机地址时，可在登录页展开次级的“首次连接或更换家庭主机”，填写例如 `192.168.1.20:8000`；登录后主导航中始终有“连接设置”。登录页不再被单独的连接向导占据。

PC 作为临时家庭 NAS 时，应关闭自动睡眠，给电脑设置固定 DHCP 地址，并在 Windows 防火墙中只允许“专用网络”访问 `8000`。若从外网访问，先使用 Tailscale 等私有组网，再填写该私网地址；不要把 API、下载器或运维面板直接映射到公网。

源码开发模式仍可使用 `prepare-pc.ps1`、`start-familyhub.ps1`、`backup.ps1` 和 `run-worker-once.ps1`，但这些脚本不是普通家庭成员安装 Client 的前置条件。

## 开发与验证

```powershell
npm install
npm run typecheck
npm run build
.\.venv\Scripts\python.exe -m pytest backend -q
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini check
```

## 原生客户端与跨平台发布

前端组件只维护一份，但使用 Client/Server 两个编译模式生成不同产品。Client 本身不携带数据库或家庭媒体库；Server 安装包会携带并自动启动服务端核心。Windows Client 默认连接本机 `127.0.0.1:8000`，Android Client 会记住首次填写的家庭主机地址。当前 Windows 发布版本为 Server `0.5.2`、Client `0.4.3`。

| 目标 | 产物 | 最低系统 | 说明 |
| --- | --- | --- | --- |
| Windows Server x64 | 含核心的 NSIS `setup.exe`、带 Core 运行库目录的便携包 | Windows 10 1803+ | 仅运维角色；自动监听家庭 API `8000` |
| Windows Client x64 | 独立 EXE、NSIS `setup.exe` | Windows 10 1803+ | 儿童/家长界面；运维账户进入时降为家长权限；需要 WebView2 |
| Android 手机 Client | ARM64 APK、通用 APK、AAB | Android 7.0 / API 24 | 小米 15 使用 ARM64 APK；已适配状态栏安全区 |
| Android TV Client | ARM64 APK、通用 APK、AAB | Android 7.0 / API 24 | 同一 Client 带 Leanback 启动类别 |

Tauri 官方目前将 Android 最低支持版本定为 API 24；项目配置也固定为 `minSdkVersion: 24`。这意味着 Android 6 及更早设备不能安装。Android TV 的具体可用性还取决于电视厂商 WebView/系统实现，建议至少 Android TV 9（API 28）用于家庭部署。

本机当前已具备 Node.js，可完成 Web 构建；原生发布还需安装 Rust stable-msvc、Visual Studio Build Tools（Desktop development with C++）、Android Studio SDK/NDK/JDK 17。检查命令：

```powershell
.\scripts\native-check.ps1
```

安装工具提示：

```powershell
.\scripts\install-native-tools.ps1
```

构建脚本会在临时目录准备服务端依赖，并在构建完成后校验 Web、Python 和原生客户端产物。发布机应使用受控依赖缓存、代码签名和构建日志，避免把运行时数据或密钥放进源码目录。

安装完成后的构建命令：

```powershell
# 同时构建 Windows Client 与 Server
.\scripts\build-windows.ps1 -Edition All

# 首次生成 Android Studio 工程并补充 TV/局域网设置；默认输出主流手机/电视可安装的 ARM64 Debug APK
npm run android:apk -- --init

# 旧款 32 位 ARM 电视或手机
npm run android:apk:arm

# 同时包含四种 CPU 架构，体积较大，仅在确有混合设备需求时使用
npm run android:apk:universal

# 商店发布包（构建后必须用独立发布密钥签名）
npm run android:aab -- --build-type release
```

`npm run android:apk` 使用无符号链接权限依赖的复制 JNI 流程，默认生成 Android Studio debug keystore 签名的通用 APK，包含 ARM64、32 位 ARM、x86 与 x86_64，适合当前家庭 PC 为手机和电视做内部安装与验证。需要缩小包体时可直接运行 `node scripts/build-android.mjs --format apk --abi arm64`。脚本直接调用 JDK 的 Gradle Wrapper JAR，不依赖 `gradlew.bat`；`build-android.ps1` 只是兼容旧命令的转发入口。要让后续 OTA 始终可升级，必须保留该构建机的 `%USERPROFILE%\.android\debug.keystore`；不要把它用于公开发布。所有 Android 产物都写入 `artifacts\android\`；Windows 产物写入 `artifacts\windows\`。Server Core 使用目录模式随安装器和便携目录一起分发，避免部分 Windows 安全策略阻止单文件运行时解压 DLL。Windows 构建使用 `native\windows\installer.nsi` 生成用户级 NSIS 安装器，安装器会检查并按需引导安装 WebView2；不依赖 WiX/MSI。正式发布前必须为 Windows 和 Android 配置独立代码签名；签名密钥不应提交到仓库。

当前构建产物命名约定：

```text
artifacts\windows\lumi-client_<version>_x64.exe
artifacts\windows\Lumi-Client_<version>_x64-setup.exe
artifacts\windows\Lumi-Server_<version>_x64-setup.exe
artifacts\windows\Lumi-Server_<version>_x64-portable\
artifacts\android\lumi-client-<version>-arm64-debug.apk
artifacts\android\lumi-client-<version>-universal-debug.apk
artifacts\android\lumi-client-<version>-universal-release.aab
```

Debug APK 只用于家庭内测；AAB 是未签名的 release 包，必须用自己的 Android App Signing key 签名后才能上架或通过 OTA 分发。Windows setup.exe 当前也是未做 Authenticode 代码签名的内部构建包；正式发布时应在受控发布机签名。

Android 和 Windows Client 不会携带 Python API/Worker。孩子和家长使用 Client；运维人员只使用 Windows Server。Server 安装器或便携目录负责启动家庭主机服务，不再把运维模式放进手机 APK。

### OTA 更新接口与发布流程

客户端预留两条只读更新接口：

| 接口 | 用途 | 访问控制 |
| --- | --- | --- |
| `GET /api/v1/updates/manifest`（别名 `/releases/latest`） | 读取版本、说明、SHA-256 和平台入口 | 无需登录，不返回家庭数据 |
| `GET /api/v1/updates/tauri?target=...&arch=...&current_version=...&channel=stable`（别名 `/releases/tauri`） | 返回 Tauri 签名更新清单 | 无更新返回 `204`；仅返回带签名的 HTTPS 产物 |

Windows 桌面端由 Tauri updater 验签后下载、安装并重启；Android 手机和电视端显示已审核的 APK 或应用商店入口，由家长确认安装。Android 不执行桌面端的静默更新。

正式发布步骤：

1. 同步 `src-tauri/tauri.conf.json` 的版本号、`updates/manifest.json` 的 `version`/`min_supported_version`，并按需要设置 `host_api_min_version`。
2. 在受控发布机生成并保管 Tauri 签名密钥。发布前设置 `FAMILYHUB_TAURI_UPDATER_ENDPOINT`（包含 `{{target}}`、`{{current_version}}` 的 HTTPS 接口）、`TAURI_UPDATER_PUBKEY` 或 `TAURI_UPDATER_PUBKEY_FILE`，以及 `TAURI_SIGNING_PRIVATE_KEY`；私钥不能提交仓库。
3. 执行 `npm run native:release`。脚本会生成被忽略的 `src-tauri/tauri.release.generated.conf.json`，然后构建带签名的 Windows 安装包和对应 `.sig`；上传它们到 HTTPS 存储。Android APK 填入 `platforms`，使用 `install_mode: "manual"` 或商店地址。
4. 填写 URL、签名、SHA-256、大小和内容类型，先校验临时清单，再原子替换 `updates/manifest.json`。Compose 已将该目录只读挂载到容器，也可用 `FAMILYHUB_UPDATE_MANIFEST_PATH` 指向自定义路径。
5. 在测试 Windows、Android 手机和 Android TV 上验证检查、下载、验签、取消、重启和失败提示，保留上一版包与清单用于人工回滚。

`src-tauri/tauri.release.conf.json` 和 `updates/manifest.example.json` 都只是模板，不能直接发布。当前不启用降级或静默后台安装；PC 上的 API/Worker 由管理员在维护窗口升级，避免运行中的服务自替换。

开发服务器：

```powershell
npm run dev
```

默认是 `http://localhost:4173`。后端 API 前缀为 `/api/v1`；开发服务器会把 `/api` 代理到 `http://127.0.0.1:8000`，也可以用 `FAMILYHUB_PROXY_TARGET` 指定其他端口。

## Docker（可选）

PC 原生模式更适合当前阶段；安装 Docker Desktop 后，可以用 Compose 运行控制面和 PostgreSQL：

```powershell
Copy-Item .env.example .env
# 编辑 .env 中的密钥和密码
.\scripts\docker-up.ps1
```

需要媒体服务时：

```powershell
.\scripts\docker-up.ps1 -Media
```

控制面地址为 `http://localhost:8000`。Jellyfin、Kavita、Audiobookshelf 启动后仍需在各自的管理界面完成首次设置、媒体目录映射和家庭账号配置。它们是播放/阅读层，不把下载器权限下发给儿童账号。

## 数据目录和迁移

不要把家庭媒体放在代码目录。推荐：

```text
D:\FamilyHub\
  data\        数据库和运行配置
  inbox\       手动转入、云盘客户端同步和待处理文件
  quarantine\  校验通过但尚未人工确认的文件
  library\video\   已确认入库的视频
  library\books\   已确认入库的图书
  library\audio\   已确认入库的音乐和有声内容
  library\images\  封面和图片
  cache\        B站 Cookie 文件与可清理缓存
  backups\     SQLite/配置备份
```

未来迁移到 NAS 时，停止服务后整体复制 `data`、`quarantine`、`library` 和 `backups`，在 NAS 上重新执行准备脚本并更新路径即可。数据库结构由 Alembic 管理，PostgreSQL 可作为后续多人并发升级路径。

### Windows 运行时实际路径

安装版 Server 默认把运行时放在：

```text
%LOCALAPPDATA%\cn.lumi.familyhub.server\runtime\
  data\familyhub.db       SQLite 数据库
  inbox\cloud\            家长手动转入、官方网盘客户端同步区
  quarantine\              下载/扫描后的隔离文件
  manifests\               下载任务清单
  works\                   Worker 临时工作目录
  cache\                   可清理缓存与可选的 B站 Cookie 文件
  library\video\          已审核视频
  library\books\          已审核图书
  library\audio\          已审核音频
  library\images\         图片与封面
```

在 Server 的“主机设置”中可以分别修改以上七类目录，保存时会自动创建不存在的文件夹；相对路径以 Server 运行时根目录为基准。也可通过 `FAMILYHUB_RUNTIME_ROOT` 一次性把默认根目录改到容量更大的磁盘，例如 `D:\FamilyHub\runtime`。已有本地成品可以放进对应资源目录后点击“扫描资源目录”，或在“资源管理”中填写文件路径并复制入库；新发现项目先成为草稿，由运维确认后发布给 Client。

### 登录与密码排查

Server 登录时使用的是“登录账号”，不是显示名称。密码采用不可逆摘要，程序和管理员都无法读取原密码，也不会因为源码文件状态而无法核对。若确认账号无误仍无法登录，从 Server 登录页选择“找回密码”：新账户回答创建时设置的密保问题；升级前的旧账户在 Server 本机补设一次密保后重置。重置会撤销该运维账户已有的全部会话。

不要删除或移动 `familyhub.db` 来解决登录问题，否则账户、目录和任务会一并丢失。迁移数据盘时应停止 Server 后完整复制 `runtime`，或设置固定的 `FAMILYHUB_RUNTIME_ROOT`，不要在两个数据库之间交替启动。

### Bilibili 下载流程

运维人员在 Server 的“下载队列”粘贴公开 `https://www.bilibili.com/video/BV...` 或 `b23.tv` 链接，选择 480/720/1080 清晰度即可提交。提交代表运维人员确认内容可依法用于家庭离线观看；标题和视频编号由下载器自动读取。Server 创建任务后，Worker 按以下顺序处理：

```text
公开链接 -> yt-dlp 获取单个视频 -> FFmpeg 合并 -> quarantine
         -> 文件签名/大小/可选 Defender 检查 -> 运维审核
         -> library\video -> Client 获得短时播放凭证
```

下载任务默认只处理公开、可下载的视频，不支持付费内容、DRM、验证码绕过或播放列表批量抓取；网络限速、地区限制或站点策略导致的失败会留在任务队列中。点击每条任务右侧的详情按钮可查看失败原因、视频编号、已传输字节、计划时间和重试次数。同一链接失败后再次粘贴会重新排队，Server 重启时也会恢复中断任务；全局暂停后可从同一按钮恢复。给定的 Bilibili 示例链接已通过格式解析，最终媒体流能否下载仍取决于 B 站当时的网络和访问策略。

Bilibili 官方页面和项目实现参考：[`Bili23-Downloader v2.11.0`](https://github.com/ScottSloan/Bili23-Downloader/releases/tag/v2.11.0)、[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)。

### 本地资源与在线播放

下载完成但尚未审核的文件不会丢失，也不会直接对 Client 可见。默认会先保存在 `runtime\library\video\.pending`（可在“主机设置”里改成其他隔离目录），数据库状态为“待审核”；审核通过后复制到 `runtime\library\video`，拒绝或冻结的文件仍会留在隔离目录，方便运维复核或清理。旧版本 `runtime\quarantine` 中的文件会在 Server 启动时自动迁移到这个待审核目录。

Server 的“资源管理”分为三个入口：

1. “本地资源”可导入 Server 电脑上的视频、PDF/EPUB/漫画和音乐文件，也可扫描已配置目录。导入默认复制文件，归档只让内容从 Client 消失，不删除原文件。
2. “在线播放”可登记 B站视频、抖音/夸克官方分享页以及 HTTPS 视频、音频、PDF 等开放直链。B站视频由 Server 按需解析并临时封装成带短时票据的 HLS 流，Client 继续使用 Lumi 播放器，同时加载可用的弹幕和评论；开放直链使用内置播放器，受 DRM 或站点策略限制的页面会保留“在官方页面打开”入口。
3. “自动同步”可保存 B站 UP 主空间、收藏夹或合集。Worker 每 30 秒检查到期任务，并按 1 至 168 小时的配置间隔重新读取平台列表；每次都会拉取最新条目，默认取最近 50 条，可在 1 至 200 条之间调整。同步只保存标题、封面和播放链接，不下载媒体。收藏到 UGC 合集中的任意一集时，Server 会还原合集标题、简介、分区、完整分集顺序和集数；多 P 视频会保留各自的 `p` 页码。播放器提供选集，某一集的儿童观看批准覆盖同一合集，便于连续播放。

在线播放和自动同步得到的资源均可在 Server 中撤回发布、隐藏、恢复或删除。合集支持删除当前单集或删除整合集；单集删除不会影响其他分集，整合集删除会一并撤下全部分集。永久删除记录会保留为同步屏障，后台更新不会把用户明确删除的单集或合集复活。B站资源旁的刷新按钮可为旧条目重新获取标题和封面。

公开内容无需账号。需要账号清晰度或私有收藏夹时，运维人员可在 Server 的“资源管理”中先验证任意一个有效的家长或运维 Lumi 账户，再从本机已登录的 Edge、Chrome 或 Firefox 导入 B站登录状态。已连接时同一区域会显示当前昵称和 UID，并提供明确的账户切换流程；Server 会先验证目标账号，再原子替换 Cookie，切换失败时继续保留原账号。平台不接收 B站账号密码，登录凭据不会返回给 Client；断开账号会立即移除导入状态。该能力不绕过会员、付费、DRM、验证码或地区限制，站点登录失效后需要由成人重新导入。

同一个运维账号允许在多台管理端同时保持独立会话，一端退出只注销自己的令牌，不会挤掉其他端；不同运维账号也可同时操作。Server 管理界面每 4 秒刷新一次共享状态，以便另一端的资源发布、下载任务或 B站账户切换及时出现。密码重置和账户停用属于安全事件，仍会注销该账户的全部现有会话。

Windows Server 点击关闭或最小化后会隐藏到系统托盘并继续提供 API、下载和同步服务；Windows Client 关闭时可选择退出或隐藏到托盘。后台 Core 使用无控制台窗口构建，不在任务栏保留 CMD 黑框；运行日志写入 `runtime\logs\lumi-server.log`。

### 家长海报墙与小游戏

“家庭海报墙”是家长 Client 的新增独立页面，不替换原有家庭书架、探索馆或搜索结果。它只展示当前家庭中已发布且可播放的视频，并依据 `local_available` 与播放模式区分“本地”和“在线”：本地影片仍由 Lumi Server 配置的视频目录保管，在线影片只保存入口和封面。儿童账户的导航中没有海报墙，后端的年龄、家庭和发布状态过滤仍是最终权限边界。

“小游戏”当前内置俄罗斯方块，儿童与家长 Client 均可进入，Server 运维界面不加载游戏入口。Windows 使用方向键移动和旋转，空格直接落下；Android 手机提供固定尺寸的触控按钮，并支持在棋盘上轻点旋转、左右滑动和向下滑动；Android TV 进入游戏后由遥控器方向键直接控制方块，确认键直接落下，返回键退出，不把遥控器模拟成鼠标。最高分只保存在当前 Client 设备，不上传家庭主机，也不参与儿童排名。

### 本轮同机验收

使用隔离运行时完成了：首次创建带密保的运维账户、密保查询和密码重置、运维登录、Client 注册申请、运维审批、Client 登录，以及运维账户在 Client 中降为家长权限。另对已安装 Server 的真实数据库只读备份副本执行了表迁移、旧账户密保补设、Server 登录与 Client 家长会话验证；原数据库未被修改。

## 安全和内容边界

- 儿童端只返回家庭审核后的元数据，不返回来源链接、成人内容、下载器操作和管理员信息。
- 百度网盘、夸克网盘、社区整理包可以登记为候选来源，但必须由家长人工确认权利并通过官方客户端转入隔离目录。
- Worker 不执行用户输入的命令，不直接访问未经允许的 URL；文件入库前会检查扩展名、文件签名、压缩包路径和可选 Defender 扫描结果。
- 下载任务有暂停开关、磁盘下限、每日配额和审计记录；系统异常时优先保持文件在隔离区。
- 正式 Server 不生成演示账号；运维账户只能从 Server 本机创建或恢复，儿童和家长账户必须申请并经运维审批。
