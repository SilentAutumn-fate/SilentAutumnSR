# FireFly 代理（Windows x64）

本目录中的代理和 Guardian 均来自 [YYHEggEgg 的 v2.0.0 发布包](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/releases/tag/v2.0.0)，适用 [GPL-3.0](LICENSE)。对应源码见 [v2.0.0 源码](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/tree/v2.0.0) 或 [源码归档](https://github.com/YYHEggEgg/FireflySR.Tool.Proxy/archive/refs/tags/v2.0.0.tar.gz)。

从项目根目录运行 `run.bat` 启动服务端和代理。代理首次运行会从 `config.tmpl.json` 创建 `config.json`，并在本机准备代理证书。默认目标是 `localhost:21000`。修改服务端 HTTP 端口时，请同步调整本机 `config.json` 中的 `DestinationPort`。退出时通过代理窗口正常结束，Guardian 会协助恢复系统代理设置。

`config.json` 和证书文件由本机管理。
