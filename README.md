# SilentAutumnSR

《崩坏：星穹铁道》本地私服。启动后用任意账号名和密码登录游戏即可。
目前仅支持通过配置文件进行战斗。

## 快速开始

```
1. 双击 install.bat      仅首次需要（需联网，约几分钟）
2. 双击 run.bat          启动服务端并接入游戏
   双击 stop.bat         停止服务端
```

需要 Windows 10 或更新版本。安装脚本可准备 Node.js；4.7.51 的 KCP 适配器还需要 Python 3（可用 `SASR_PYTHON` 指定解释器）。
`install.bat -Force` 可完全重装。

首次检出后，将 `server.config.example.json` 复制为 `server.config.json`，使用模板中的本机监听地址。运行 `install.bat` 安装依赖并生成协议，再运行 `run.bat` 启动服务端。FireFly 代理及默认配置随仓库提供，首次启动时在本机准备证书。另用启动器接入时请自行准备 `launcher/`。参见 [FireFly 使用说明](FireFly.Proxy.v2/README.md)。

开发验证可运行 `npm ci`、`npm run build` 和 `npm test -- --runInBand`。构建会从提交中的协议输入生成运行文件。

## 配置

- 本机配置及环境变量见 [配置说明](docs/configuration.md)。
- FreeSR 配置文件位于 `src/data/freesr-data.json`。

服务端需从项目根目录启动。

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
