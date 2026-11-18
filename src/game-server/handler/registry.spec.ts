import { handlerList } from './registry';

describe('handler registry', () => {
    it('registers each command id at most once so no later module shadows a real handler', () => {
        // `NetSession` 用 `Map.set` 按顺序注册，后注册的会覆盖先注册的；同一模块里
        // 若既写了真处理器又留在 peripheral 空 ack 列表里，运行时就会静默退化成空回包。
        const seen = new Set<number>();
        const duplicates: number[] = [];
        for (const entry of handlerList) {
            if (seen.has(entry.cmdId)) duplicates.push(entry.cmdId);
            seen.add(entry.cmdId);
        }
        expect(duplicates).toEqual([]);
    });
});
