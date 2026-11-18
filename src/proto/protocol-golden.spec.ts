import { readFileSync } from 'fs';
import { join } from 'path';
import * as protobuf from 'protobufjs';

/**
 * Guards the wire contract of the grid-fight messages against accidental drift.
 *
 * The golden file is written by `node dev/tools/protocol-golden.js --write` from
 * the same .proto it is checked against. A regenerated protocol (version bump,
 * hand edit, different upstream dump) that renumbers a field, flips a wire type
 * or turns a repeated field into a single one then fails here instead of at the
 * client, where the symptom is an unresponsive button rather than an error.
 */
describe('protocol golden', () => {
    const root = join(__dirname, '..', '..');
    const golden = JSON.parse(readFileSync(join(__dirname, 'protocol-golden.json'), 'utf8')) as {
        messages: Record<string, { fields: Record<string, { id: number; type: string; repeated: boolean }> }>;
    };

    it('covers all client-native messages, including every command payload', () => {
        const names = Object.keys(golden.messages);
        expect(names).toHaveLength(4991);
        const commands = JSON.parse(readFileSync(join(root, 'src', 'proto', 'CmdId.json'), 'utf8'));
        for (const required of Object.keys(commands)) {
            expect(names).toContain(required);
        }
    });

    it('matches the field numbers and types in StarRail.proto', () => {
        const parsed = protobuf.parse(readFileSync(join(root, 'src', 'proto', 'StarRail.proto'), 'utf8'), {
            keepCase: true,
        });
        const types = new Map<string, protobuf.Type>();
        const walk = (namespace: protobuf.NamespaceBase) => {
            for (const nested of namespace.nestedArray) {
                if (nested instanceof protobuf.Type) {
                    if (!types.has(nested.name)) types.set(nested.name, nested);
                    walk(nested);
                } else if (nested instanceof protobuf.Namespace) {
                    walk(nested);
                }
            }
        };
        walk(parsed.root);

        const problems: string[] = [];
        for (const [name, expected] of Object.entries(golden.messages)) {
            const type = types.get(name);
            if (!type) {
                problems.push(`${name}: message missing from the proto`);
                continue;
            }
            for (const [fieldName, field] of Object.entries(expected.fields)) {
                const actual = type.fields[fieldName];
                if (!actual) {
                    problems.push(`${name}.${fieldName}: removed (was id ${field.id})`);
                    continue;
                }
                if (actual.id !== field.id) problems.push(`${name}.${fieldName}: id ${field.id} -> ${actual.id}`);
                if (actual.type !== field.type) problems.push(`${name}.${fieldName}: type ${field.type} -> ${actual.type}`);
                if (Boolean(actual.repeated) !== field.repeated) {
                    problems.push(`${name}.${fieldName}: repeated ${field.repeated} -> ${Boolean(actual.repeated)}`);
                }
            }
        }
        expect(problems).toEqual([]);
    });
});
