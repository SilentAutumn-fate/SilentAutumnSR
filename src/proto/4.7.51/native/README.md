# 4.7.51 本机协议导出与服务端更新

本目录是从 `H:/SR_Beta/StarRail_Beta` 的 OSBETAWin4.7.51 客户端导出的原始名称协议。`manifest.json` 记录输入二进制、metadata 及导出文件 SHA256。

- [`StarRail.proto`](../../StarRail.proto)：4,991 个消息，保留客户端名称，包含 oneof、map 和嵌套消息的展开定义。
- [`CmdId.json`](../../CmdId.json)：2,717 个唯一命令号，全部从客户端的真实注册表恢复；2,695 个消息名仍混淆，22 个可读。完整命令表不等于名称已全部去混淆。
- `cmd4751-evidence.json`：每个命令的类型槽、命令号、注册指令 RVA。
- `aliases.json`：4,014 个通过字段集合和标量类型检查的兼容名称映射，不改变 wire ID。
- `validation-535.json`：按相同 WriteTo RVA 对照独立 4.7.51 样本，535 个消息字段/编码/集合形状全部匹配。
- `wire-refinements.json`：C# 属性类型无法区分 int32/sint32，9 个 zigzag 字段由同版本描述符恢复。其余标量按 protoc-C# 类型处理；原始 C# 属性/常量声明顺序映射使用了 Dumpcs2Protobuf 同类方法，并经过独立样本校验。

CmdId 原理：解析 `BHGPNEODPMD..cctor`（RVA 14B16440..14B28330）里 Dictionary<RuntimeTypeHandle,ushort> 的 Add 调用；用 MessageParser<T> getter 中的精确类型槽地址关联 T。2,717 条全部关联成功，没有依据枚举顺序猜测命令号。

服务端实际使用`../../StarRail.proto` 和 `../../CmdId.json` 作为原始输入，以此生成 `../schema.json` 和 `../CmdId.json`。生成后的命令表含 4,145 个名称键，但仍只有 2,717 个唯一 wire ID，多出的键是兼容别名。未恢复语义的旧 handler 不会借用旧版命令号。

## 重建

在 `H:/SR_Beta` 执行（Python 需要 pefile、capstone）：

```powershell
$env:DOTNET_ROOT='H:/SR_Beta/_probe/dotnet-sdk'
& _probe/HSRGlobalMetadata/bin/Release/net10.0/HSRGlobalMetadata.exe H:/SR_Beta/StarRail_Beta --output H:/SR_Beta/_probe/client-dump-4.7.51-full --no-string-literals
python SilentAutumnSR/dev/tools/dump-client-proto.py _probe/client-dump-4.7.51-full/dump.cs _probe/client-protocol-4.7.51-full
python SilentAutumnSR/dev/tools/dump-client-cmdid.py
SilentAutumnSR/runtime/node/node.exe SilentAutumnSR/dev/tools/refine-client-proto.js _probe/client-protocol-4.7.51-full
```

CmdId 提取器对本次 GameAssembly SHA256 做强校验；换客户端构建必须重新定位注册表，不能复用硬编码 RVA。proto 原始导出和精修输出分开保存。全量取证保留在 `_probe/client-protocol-4.7.51-full/`，包含属性/字段、原始 schema、未确认项和校验报告。

协议恢复工具参考 Hiro420/Dumpcs2Protobuf；兼容名称/标量编码参考同版本 lcxs1/hsr-local 描述符与 amizing/robinsr 的4.7.51样本。许可证与固定版本来源见上层 README 和 LICENSE-GPL-3.0.txt。
