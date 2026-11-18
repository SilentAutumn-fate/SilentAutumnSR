import * as fs from 'fs';
import * as path from 'path';
import { Root, Type, Enum } from 'protobufjs';

function selectedVersion(): string {
 if (process.env.SASR_PROTOCOL_VERSION) return process.env.SASR_PROTOCOL_VERSION;
 try { return JSON.parse(fs.readFileSync(path.resolve(process.env.SASR_CONFIG || 'server.config.json'), 'utf8')).protocolVersion || '4.7.51'; }
 catch { return '4.7.51'; }
}
export const protocolVersion = selectedVersion();
if (protocolVersion !== '4.7.51') throw new Error('The primary protocol files target 4.7.51. Restore the matching files before selecting another version.');
export const isProtocol47 = protocolVersion === '4.7.51';
const profileDir = path.resolve(process.cwd(), 'src/proto/4.7.51');

export function protocolNamespace(legacy: any): any {
 const root = Root.fromJSON(JSON.parse(fs.readFileSync(path.join(profileDir, 'schema.json'), 'utf8')));
 root.resolveAll();
 const types: Record<string, any> = {};
 for (const child of root.nestedArray) {
  if (child instanceof Type) types[child.name] = child.ctor;
  else if (child instanceof Enum) types[child.name] = child.values;
 }
 // Enum names used by gameplay were deobfuscated in the old snapshot. Enum
 // fallback is safe; falling back to an old message schema is deliberately forbidden.
 for (const [name, value] of Object.entries(legacy)) {
  if (!types[name] && typeof value === 'object' && value && !('encode' in value)) types[name] = value;
 }
 return types;
}
export function protocolCommands(legacy: Record<string, number>): Record<string, number> {
 const known = JSON.parse(fs.readFileSync(path.join(profileDir, 'CmdId.json'), 'utf8'));
 const result: Record<string, number> = {};
 let unsupported = -1;
 for (const name of Object.keys(legacy)) result[name] = known[name.slice(3)] ?? unsupported--;
 for (const name of JSON.parse(fs.readFileSync(path.join(profileDir,'handler-commands.json'),'utf8'))) {
  if (result[name] === undefined) result[name] = known[name.slice(3)] ?? unsupported--;
 }
 for (const [name, id] of Object.entries(known)) result['Cmd'+name] = id as number;
 return result;
}
