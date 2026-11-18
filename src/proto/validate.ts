/**
 * Field-name guard for the generated protobuf types.
 *
 * protobufjs converts `snake_case` proto fields to `camelCase` JS properties, and
 * both `fromObject` and `encode` silently IGNORE keys that are not real fields.
 * Writing `{ asset_bundle_url: … }` therefore produces a valid but empty message
 * and the failure only shows up much later as a client behaving oddly.
 *
 * This module turns that silent drop into a loud, actionable error.
 */

const reported = new Set<string>();

/**
 * Known field names (camelCase) of a generated message type.
 *
 * The protobufjs *static* module ships no reflection metadata, so `type.fields`
 * is empty. The generated classes do declare every field on their prototype
 * (`PlayerGetTokenScRsp.prototype.retcode = 0`), which is exactly the set of
 * names `fromObject`/`encode` will accept.
 */
export function fieldNames(type: any): Set<string> {
    const names = new Set<string>();

    const fields = type?.fields;
    if (fields) {
        for (const key of Object.keys(fields)) names.add(key);
    }
    const oneofs = type?.oneofs;
    if (oneofs) {
        for (const key of Object.keys(oneofs)) names.add(key);
    }

    const proto = type?.prototype;
    if (proto) {
        for (const key of Object.getOwnPropertyNames(proto)) {
            if (key === 'constructor' || key === 'toJSON' || key === '$type') continue;
            names.add(key);
        }
    }
    return names;
}

export interface FieldCheckResult {
    unknown: string[];
    /** Suggested camelCase replacement for each unknown key. */
    suggestions: Map<string, string>;
}

function camelize(name: string): string {
    return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function checkFields(type: any, object: Record<string, any>): FieldCheckResult {
    const known = fieldNames(type);
    const unknown: string[] = [];
    const suggestions = new Map<string, string>();

    for (const key of Object.keys(object ?? {})) {
        if (known.has(key)) continue;
        if (key.startsWith('$')) continue;
        unknown.push(key);
        const guess = camelize(key);
        if (known.has(guess)) suggestions.set(key, guess);
    }
    return { unknown, suggestions };
}

/**
 * Log (or throw, when SASR_STRICT_FIELDS=1) about keys that are not fields of
 * `type`. Each (type, key) pair is reported only once per process.
 */
export function assertFields(typeName: string, type: any, object: Record<string, any>): void {
    const { unknown, suggestions } = checkFields(type, object);
    if (unknown.length === 0) return;

    const details = unknown
        .map((k) => (suggestions.has(k) ? `${k} (did you mean ${suggestions.get(k)}?)` : k))
        .join(', ');
    const message = `[proto] ${typeName}: ignoring unknown field(s): ${details}`;

    const cacheKey = `${typeName}:${unknown.join(',')}`;
    if (reported.has(cacheKey)) return;
    reported.add(cacheKey);

    if (process.env.SASR_STRICT_FIELDS === '1') {
        throw new Error(message);
    }
    console.warn(message);
}
