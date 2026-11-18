import { Reader } from 'protobufjs';
import { HttpServerService } from './http-server.service';
import { fetchOfficialChain } from '../data/hotfix-sources';

const entry = {
 asset_bundle_url: 'https://assets.example/asb', ex_resource_url: 'https://assets.example/design',
 lua_url: 'https://assets.example/lua', lua_version: '17099231',
 ifixUrl: 'https://assets.example/ifix', ifix_version: '17102685',
 base_asset_bundle_url: 'https://assets.example/base-asb',
};
function fields(bytes: Uint8Array): Record<number, any> {
 const reader = Reader.create(bytes), values = {};
 while (reader.pos < reader.len) {
  const tag = reader.uint32();
  if ((tag & 7) === 2) values[tag >>> 3] = reader.string();
  else if ((tag & 7) === 0) values[tag >>> 3] = reader.uint32();
  else reader.skipType(tag & 7);
 }
 return values;
}
describe('4.7.51 gateway wire format', () => {
 it('does not resolve a hotfix for a versionless HEAD probe', async () => {
  const resolve = jest.fn();
  expect(await new HttpServerService({resolve} as any).getGatewayService(undefined)).toBe('');
  expect(resolve).not.toHaveBeenCalled();
 });
 it('uses the field numbers captured from the seeded 4.7.51 official response', async () => {
  const service = new HttpServerService({ resolve: async () => ({ entry }) } as any);
  const wire = fields(Buffer.from(await service.getGatewayService('OSBETAWin4.7.51'), 'base64'));
  expect(wire[5]).toBe(23301);
  expect(wire[15]).toEqual(expect.any(String));
  expect(wire[8]).toBe(entry.ex_resource_url);
  expect(wire[9]).toBe(entry.lua_url);
  expect(wire[13]).toBe(entry.asset_bundle_url);
  expect(wire[1895]).toBe(entry.ifixUrl);
  expect(wire[1988]).toBe(entry.ifix_version);
  expect(wire[2011]).toBe(entry.lua_version);
  expect(wire[1507]).toBe(entry.base_asset_bundle_url);
 });
 it('decodes the new format on official lookup and sends the beta platform and seed', async () => {
  // Independent captured field numbers, deliberately not encoded with the production schema.
  const { Writer } = require('protobufjs');
  const body = Writer.create().uint32(66).string(entry.ex_resource_url)
   .uint32(74).string(entry.lua_url).uint32(106).string(entry.asset_bundle_url)
   .uint32(15162).string(entry.ifixUrl).uint32(15906).string(entry.ifix_version)
   .uint32(16090).string(entry.lua_version).uint32(12058).string(entry.base_asset_bundle_url).finish();
  const original = global.fetch;
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => Buffer.from(body).toString('base64') });
  global.fetch = fetchMock;
  try {
   expect(await fetchOfficialChain('OSBETAWin4.7.51', 'd2fa30768e', { attempts: 1 })).toEqual(entry);
   expect(fetchMock.mock.calls[0][0]).toContain('platform_type=3');
   expect(fetchMock.mock.calls[0][0]).toContain('dispatch_seed=d2fa30768e');
  } finally { global.fetch = original; }
 });
});
