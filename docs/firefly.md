# FireFly 代理（Windows x64）

`FireFly.Proxy.v2/` 保留归档包原始目录和文件。代理和 Guardian 来自 [YYHEggEgg 的 v2.0.0 发布包](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/releases/tag/v2.0.0)，适用 [GPL-3.0](../runtime/kcp/LICENSE-GPL-3.0.txt)，对应 [v2.0.0 源码](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/tree/v2.0.0)。

归档包自带的 `rootCert.pfx` 含已公开的 CA 私钥。首次使用前请把它移出代理目录，由代理在本机生成证书。不要将归档证书导入系统信任库。

默认目标为 `localhost:21000`。如修改服务端 HTTP 端口，请同步调整代理配置中的 `DestinationPort`。使用完毕后正常退出代理，让 Guardian 协助恢复系统代理设置。
