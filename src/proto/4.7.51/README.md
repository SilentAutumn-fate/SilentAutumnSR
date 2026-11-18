# 4.7.51 运行时协议

主协议文件是 `src/proto/StarRail.proto` 和 `src/proto/CmdId.json`，现已直接替换为本机 4.7.51 导出文件；`native/` 仅保留原始导出与取证副本。

`tools/prepare-protocol.js` 从两个主文件生成本目录的 schema.json 和兼容名称命令表。字段名称适配不会改变主文件给出的字段号、类型、集合形状和命令号。`handler-field-names.json` 通过新旧客户端相同属性名与类型恢复现有 handler 的名称；`handler-enums.json` 保留代码用到的枚举名称常量。

`tools/build.js` 检查协议输入指纹，有变化就调用 `tools/gen-proto.js` 重新生成 starrail.gen.js / starrail.ts / cmdId.ts。`dev/tools/import-protocol47.js` 现在只调用上述主文件准备流程，不再导入第三方描述符覆盖运行时。

输入/输出计数、SHA256、导出方法、独立样本验证和原始命令证据见 native/README.md 与 native/manifest.json。最初的同版本兼容名称参考 lcxs1/hsr-local commit fdfbfb83013edc80d86d017e138a82444a1b2ea8 与 amizing/robinsr commit fa130bc24be87b642fd00fcf9ecb678c82c71147；GPL-3.0 许可证已保留。

本次替换前的主文件及生成脚本保存在 H:/SR_Beta/_probe/before-primary-4751/。旧版运行时已不再是可选运行路径，若需要回滚必须恢复相应文件，不能只修改版本配置。
