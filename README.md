# SilentAutumnSR

# 支持 [freesr-data.json](https://srtools.neonteam.dev/) 配置导入

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## *懒人步骤：先双击install.bat安装依赖，再双击run.bat一键编译启动服务端和代理（电脑需要安装nodejs）*
# 安装

```bash
# 前提步骤
$ 双击运行 install.bat（自动执行 npm install 安装依赖）
```

## 1. 自动运行:
```bash
$ 双击文件 run.bat 即可一键运行
```
首次启动会花费较长时间进行编译，待提示`Server listening on port 23301`时说明启动完成


## 2. 手动运行:

### 2.1 流量代理

```bash
$ 您需要运行 FireFly.Proxy.v2 中的 FireflySR.Tool.Proxy.exe
```

### 2.2 运行应用

```bash
# development
$ npm run start

# watch mode 
$ npm run start:dev 

# production mode
$ npm run start:prod
```
## 3. 设置 freesr-data:
### 3.1 更新新的 freesr-data.json

```bash
$ 您可以在 src/data 中更新新的 freesr-data.json
```
### 3.2 在游戏内更新 data

```bash
$ 您可以在游戏中输入 /update 以从新的 freesr-data.json 更新新数据
```
### 3.3 改变多命途角色的命途

```bash
$ 您可以在游戏中输入 /id + 角色id 例如: /id 8006 (女同谐)来更新该角色的新命途
```

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->



## 4. 版本链自动抓取（hotfix auto-fetch）

当 `version.json` 里没有客户端请求的版本时，
**服务端会自动向官方 dispatch 抓取该版本的热更地址并落盘**，不再直接返回 403。

### 4.1 工作原理

1. 客户端请求 `/query_gateway?version=XXX&dispatch_seed=YYY`
2. 先查 `src/data/version.json` 是否有 `XXX`
3. 查不到时按版本前缀选择官方主机：

   | 版本前缀 | 官方主机 |
   |---|---|
   | `CNPROD*` | `prod-gf-cn-dp01.bhsr.com` |
   | `CNBETA*` | `beta-release01-cn.bhsr.com` |
   | `OSPROD*` | `prod-official-asia-dp01.starrails.com` |
   | `OSBETA*` | `beta-release01-asia.starrails.com` |

4. 请求官方 `query_gateway`（base64）→ 解码为 `GateServer` 报文
5. 抽取 `asset_bundle_url` / `ex_resource_url` / `lua_url` / `ifix_url`，写入 `version.json`
6. 用抓到的地址构造本地 `GateServer` 返回给客户端

失败时按 3 次重试（间隔 100ms），并做 **60 秒负缓存**，避免客户端反复请求不存在的版本时持续打官方接口。

### 4.2 手动触发 / 查看

```bash
# 查看版本链里已有的版本
$ curl http://127.0.0.1:21000/version/list

# 强制刷新某个版本（无视已有条目，重新抓取并落盘）
$ curl "http://127.0.0.1:21000/version/refresh?version=CNBETAWin4.5.51"
```

### 4.3 批量刷新（离线维护）

```bash
# 刷新 version.json 中已有的全部版本
$ node -r ts-node/register src/data/FetchHotfix/refresh_versions.ts --all

# 指定版本
$ node -r ts-node/register src/data/FetchHotfix/refresh_versions.ts CNBETAWin4.5.51 CNBETAWin4.5.52

# 只探测不写盘
$ node -r ts-node/register src/data/FetchHotfix/refresh_versions.ts --probe CNBETAWin4.5.51
```

> 说明：本地若存在游戏客户端目录（项目根目录下以 `Star Rail` / `StarRail` 开头的目录），
> 会优先用客户端内的 `BinaryVersion.bytes` 解析版本信息；没有客户端时走官方 dispatch 抓取。
> 两条路径都失败才判定该版本不支持（HTTP 403）。

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
