import { Type, Field } from 'protobufjs';

/** Wire numbers verified against OSBETAWin4.7.51, seed d2fa30768e.
 * Dispatch retains its layout; only the gateway envelope changed.
 * Keep this separate from the legacy GateServer used by 4.5/4.6 clients.
 */
export const Gateway47 = new Type('Gateway47');
for (const [name, id, type] of [
 ['retcode', 1, 'uint32'], ['port', 5, 'uint32'], ['unk1', 6, 'bool'],
 ['exResourceUrl', 8, 'string'], ['luaUrl', 9, 'string'], ['regionName', 10, 'string'],
 ['assetBundleUrl', 13, 'string'], ['unk2', 14, 'bool'], ['ip', 15, 'string'],
 ['unk3', 247, 'bool'], ['unk4', 410, 'bool'], ['unk5', 809, 'bool'],
 ['unk6', 984, 'bool'], ['unk7', 1293, 'bool'],
 ['unk8', 1140, 'bool'],
 ['baseAssetBundleUrl', 1507, 'string'],
 ['ifixUrl', 1895, 'string'], ['ifixVersion', 1988, 'string'], ['luaVersion', 2011, 'string'],
] as [string, number, string][]) Gateway47.add(new Field(name, id, type));

export function usesGateway47(version: string): boolean {
 return /^(?:CN|OS)BETAWin4\.7\./.test(version);
}
