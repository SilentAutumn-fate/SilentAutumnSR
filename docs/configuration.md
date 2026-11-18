# Configuration and portability

The server has no machine-specific literals left. Everything it needs to know
about the host — ports, bind addresses, the address the client is told to dial,
the account identity, where data and logs live — is resolved by
[`src/common/settings.ts`](../src/common/settings.ts) in this order:

```
server.config.json   ->   SASR_* environment variables   ->   built-in defaults
```

The defaults are relative paths and well-known ports, so a fresh checkout runs
unchanged on any machine that starts it from the repository root. `run.bat`,
`stop.bat`, the proxy helper and the dev tools read the same settings file
through [`tools/server-config.js`](../tools/server-config.js), so they cannot
disagree with the server about a port.

## Fields

Copy `server.config.example.json` to `server.config.json` in the repository root for loopback-only settings. Git ignores the local copy. Every key is optional.

| key | default | meaning |
|---|---|---|
| `serverName` | `SilentAutumnSR` | name in dispatch, login and lineup answers |
| `http.bindHost` | `0.0.0.0` | address the HTTP/dispatch/SDK socket binds. `0.0.0.0` = every interface, `127.0.0.1` = this machine only |
| `http.port` | `21000` | HTTP port (dispatch, gateway, SDK) |
| `http.publicHost` | `auto` | host written into the dispatch answer the client reads. `auto` = this host's LAN address |
| `game.bindHost` | `0.0.0.0` | address the TCP game socket binds |
| `game.port` | `23301` | TCP game port |
| `game.publicHost` | `auto` | host written into the `query_gateway` answer (`ip`) |
| `account.uid` | `1337` | uid the SDK stub answers with |
| `account.token` | `aa` | session token the SDK stub answers with |
| `account.nickname` | `SilentAutumnSR` | player name used when a save has none |
| `paths.data` | `src/data` | static data (`version.json`, `freesr-data.json`, `resources/`) |
| `paths.logs` | `logs` | `server.log`, `requests.jsonl`, protocol captures |

`auto` is deliberately two-sided: a loopback `bindHost` advertises the loopback
address (local-only setup), an all-interfaces `bindHost` advertises the detected
LAN address (so another device can follow the answer without editing anything).
The detected address prefers a physical adapter (`Wi-Fi`, `WLAN`, `Ethernet`) on
a private range and skips virtual ones (`vEthernet`, Hyper-V, VMware, VirtualBox,
Docker, WSL, Radmin, Tailscale, ZeroTier, WireGuard, TAP/TUN).

## Environment variables

Useful when the same checkout must run with different settings without editing a
committed file (CI, several instances, a wrapper script).

| variable | overrides |
|---|---|
| `SASR_CONFIG` | path of the settings file itself (relative to the working directory) |
| `SASR_SERVER_NAME` | `serverName` |
| `SASR_HTTP_HOST`, `SASR_HTTP_PORT`, `SASR_HTTP_PUBLIC_HOST` | `http.*` |
| `SASR_GAME_HOST`, `SASR_GAME_PORT`, `SASR_GAME_PUBLIC_HOST` | `game.*` |
| `SASR_UID`, `SASR_TOKEN`, `SASR_NICKNAME` | `account.*` |
| `SASR_DATA_DIR`, `SASR_LOGS_DIR` | `paths.*` |

Unknown or out-of-range values are fatal at startup (`invalid http port: 70000`)
rather than silently ignored — a server that listens on an unexpected port is
harder to debug than one that refuses to start.

## Recipes

**This machine only, no LAN exposure**

```json
{ "http": { "bindHost": "127.0.0.1" }, "game": { "bindHost": "127.0.0.1" } }
```

**Another device on the same LAN (default)**

Leave `bindHost` at `0.0.0.0` and `publicHost` at `auto`. The startup banner and
`node tools/server-config.js` print the exact addresses:

```
dispatch / SDK   : http://192.168.1.23:21000 (bound 0.0.0.0:21000)
game server      : 192.168.1.23:23301 (bound 0.0.0.0:23301)
```

The client on the other device must still be redirected to that address: the
bundled `launcher.exe` + `hkrpg.dll` hardcode `http://127.0.0.1:21000`, so they
only work on the server machine. On the client machine run the bundled proxy
with `FireFly.Proxy.v2/config.json` set to

```json
{ "DestinationHost": "192.168.1.23", "DestinationPort": 21000 }
```

**Two servers on one machine**

```json
{
  "http": { "port": 21100, "publicHost": "auto" },
  "game": { "port": 23401, "publicHost": "auto" },
  "paths": { "logs": "logs-a" }
}
```

Give the second one its own settings file and start it with
`set SASR_CONFIG=server-b.config.json`. Note that `hkrpg.dll` and the bundled
proxy both default to port 21000, so a non-default HTTP port needs the proxy
config (and cannot be used through the launcher at all).

**A host name instead of an address** (port forwarding, DNS, IPv6 prefix)

```json
{ "http": { "publicHost": "sr.example.lan" }, "game": { "publicHost": "sr.example.lan" } }
```

## What the client actually receives

The two answers the client reads before the game socket are the only places the
advertised address appears:

- `/query_dispatch` → `regionList[0].dispatchUrl` = `http://<http.publicHost>:<http.port>/query_gateway`
- `/query_gateway` → `ip` = `<game.publicHost>`, `port` = `<game.port>`

Everything after that is a direct TCP connection to `ip:port`.

## Windows firewall

Binding `0.0.0.0` makes Windows ask once, the first time the server listens on a
non-loopback interface. If the prompt was dismissed, another device sees a
timeout while the server log shows nothing. Allow the two ports once, from an
administrator prompt:

```powershell
New-NetFirewallRule -DisplayName "SilentAutumnSR" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 21000,23301 -Profile Private
```

`-Profile Private` keeps the rule off public networks.

## Verifying a configuration

```powershell
node tools\server-config.js            # resolved settings, as the server sees them
node tools\server-config.js --json     # same, machine-readable
node tools\server-config.js --health   # URL run.ps1 probes
node dev\tools\fake-client.js          # login handshake against the configured game port
```

The server prints the same block at startup:

```
[config] SilentAutumnSR
[config]   name=SilentAutumnSR
[config]   http=0.0.0.0:21000 (advertises 192.168.1.23)
[config]   game=0.0.0.0:23301 (advertises 192.168.1.23)
[config]   account=1337/SilentAutumnSR
[config]   data=...\src\data
[config]   logs=...\logs
[config]   config=...\server.config.json
```

If the banner says `advertises 127.0.0.1` while the bind address is `0.0.0.0`,
the server also warns: another device would be told to connect to itself.
