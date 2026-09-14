# Tailscale 跨网络连接

Lumi Server 本身就是家庭主机服务。Tailscale 只负责把 Server 所在电脑和各个 Client 放进同一个私有网络，不会替代 Lumi 的账号、权限或资源审核。

## Server 端

1. 在运行 Lumi Server 的 Windows 电脑安装 Tailscale，并登录家庭使用的 tailnet。
2. 保持 Server 监听 `0.0.0.0:2521`。安装版会为局域网和 `100.64.0.0/10` Tailscale 地址分别创建 Windows 防火墙规则。
3. 在 Tailscale 管理控制台确认这台电脑的 `100.x.y.z` 地址，并在 tailnet ACL 中只允许家庭设备访问 TCP `2521`。
4. 不要打开路由器端口转发、UPnP 或 Tailscale Funnel。Server 停止后，Client 应立即无法获取新的目录和播放票据。

便携版没有安装器创建的防火墙规则，可以在管理员 PowerShell 中按实际 Core 路径创建一条仅限 Tailscale 网段的规则：

```powershell
New-NetFirewallRule -DisplayName "Lumi Server Tailscale API" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 2521 -RemoteAddress 100.64.0.0/10 -Profile Any
```

## Client 端

在 Lumi Client 的“连接设置”中填写：

```text
http://Server的Tailscale地址:2521
```

例如 `http://100.101.20.8:2521`。手机、电视和另一台电脑也要登录同一个 tailnet；首次连接仍然需要 Lumi 家庭账户登录，不能依赖 Tailscale 身份代替应用账号。

## 检查顺序

```powershell
tailscale ping <Server的设备名或100.x地址>
curl.exe -I http://100.x.y.z:2521/api/v1/health
```

第二条返回 `200` 后，再在 Client 保存地址并登录。若 `tailscale ping` 成功但 HTTP 失败，优先检查 Windows 防火墙规则、Server 是否正在运行以及端口是否被其他程序占用。
