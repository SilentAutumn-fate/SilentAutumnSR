# FireFly 代理（Windows x64）

本目录中的代理和 Guardian 均来自 [YYHEggEgg 的 v2.0.0 发布包](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/releases/tag/v2.0.0)，适用 [GPL-3.0](../runtime/kcp/LICENSE-GPL-3.0.txt)。对应源码见 [v2.0.0 源码](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/tree/v2.0.0) 或 [源码归档](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/archive/refs/tags/v2.0.0.tar.gz)。

从项目根目录运行 `run.bat` 启动服务端和代理。仓库附带的 `config.json` 来自归档包，默认目标为 `localhost:21000`。如果没有 `config.json`，代理会从 `config.tmpl.json` 创建它。代理证书由本机准备。修改服务端 HTTP 端口时，请同步调整本机 `config.json` 中的 `DestinationPort`。退出时通过代理窗口正常结束，Guardian 会协助恢复系统代理设置。

`archive/rootCert.pfx` 是曾为旧版本公开发布的历史证书，包含已公开的 CA 私钥。代理运行时应使用本机生成的证书。请勿将归档证书导入系统信任库或移到代理执行目录。
