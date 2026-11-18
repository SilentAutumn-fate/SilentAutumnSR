# SilentAutumnSR

《崩坏：星穹铁道》本地私服。启动后用任意账号名和密码登录游戏即可。

## 快速开始

```
1. 双击 install.bat      仅首次需要（需联网，约几分钟）
2. 双击 run.bat          启动服务端并接入游戏
   双击 stop.bat         停止服务端
```

需要 Windows 10 或更新版本。安装脚本可准备 Node.js；4.7.51 的 KCP 适配器还需要 Python 3。
`install.bat -Force` 可完全重装。

FireFly 代理随仓库提供。原包内的 `rootCert.pfx` 含已公开的 CA 私钥，请在运行前将它移出代理目录，让代理在本机生成证书。服务端需从项目根目录启动。

## 游戏内命令

| 命令 | 作用 |
|---|---|
| `/help` | 列出全部命令 |
| `/tp <entryId> [planeId] [floorId]` | 传送到地图入口 |
| `/unstuck` | 回到安全点 |
| `/sync` | 重新读取账号档案 |
| `/refill` | 补满秘技点 |
| `/id …` | 自定义挑战关卡与 buff |
| `/node` | 切换挑战节点 |
| `/set standard\|rateup 5\|rateup 4 …` | 重写卡池 |
| `/funmode on\|off\|hp <n>` | 娱乐模式血量 |
| `/test` | 回显测试 |

## 说明

仅供学习与个人离线使用，与 HoYoverse 无关联；请使用合法获取的客户端，不要重新
分发游戏资源或第三方程序。

FireFly 代理和 Guardian 来自 [FireflySR.Tool.Proxy v2.0.0](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/tree/v2.0.0)，适用 [GPL-3.0](runtime/kcp/LICENSE-GPL-3.0.txt)。
