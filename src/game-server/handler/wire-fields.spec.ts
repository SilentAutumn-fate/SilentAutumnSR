import * as fs from 'fs';
import * as path from 'path';

describe('handler wire field names', () => {
    it('reads decoded request fields by their camelCase wire names', () => {
        // 服务器用 protobufjs 解码（`keepCase = false`），`trait_id` 这类字段在
        // 解码后的对象上是 `traitId`。运行时类型是 `any`，写成 snake_case 不会报错，
        // 只会在真机/联调时静默读到 undefined —— 这里把这类写法拦在单测里。
        const dir = __dirname;
        const offenders: string[] = [];
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
            const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
            lines.forEach((line, index) => {
                const pattern = /request\.([a-z][a-z0-9]*_[a-z0-9_]+)/g;
                let match: RegExpExecArray | null;
                while ((match = pattern.exec(line)) !== null) {
                    offenders.push(`${file}:${index + 1} reads request.${match[1]}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});
