import * as os from 'os';
import {
    buildSettings,
    defaultSettings,
    describeSettings,
    detectLanAddress,
    isLoopback,
    needsRemoteHint,
    resolvePublicHost,
} from './settings';

/**
 * These tests pin the portability contract: nothing that depends on the machine
 * may be a literal in the source, and the same checkout must be startable on
 * another host or another LAN address without editing code.
 */
describe('settings', () => {
    it('has device-independent defaults', () => {
        const settings = buildSettings({}, {});
        expect(settings.http.bindHost).toBe('0.0.0.0');
        expect(settings.game.bindHost).toBe('0.0.0.0');
        expect(settings.http.publicHost).toBe('auto');
        expect(settings.game.publicHost).toBe('auto');
        expect(settings.http.port).toBe(21000);
        expect(settings.game.port).toBe(23301);
        // Relative directories only: they resolve against the working directory.
        expect(settings.paths.data).toBe('src/data');
        expect(settings.paths.logs).toBe('logs');
    });

    it('reads the file and lets the environment override it', () => {
        const settings = buildSettings(
            {
                serverName: 'from-file',
                http: { port: 31000, publicHost: '192.168.1.9' },
                game: { port: 31001 },
                account: { uid: 4321 },
                paths: { logs: 'var/logs' },
            },
            { SASR_HTTP_PORT: '41000', SASR_GAME_PORT: '41001', SASR_UID: '99' },
        );

        expect(settings.serverName).toBe('from-file');
        expect(settings.http.port).toBe(41000);
        expect(settings.game.port).toBe(41001);
        expect(settings.http.publicHost).toBe('192.168.1.9');
        expect(settings.account.uid).toBe(99);
        expect(settings.paths.logs).toBe('var/logs');
    });

    it('rejects an out-of-range port instead of listening somewhere unexpected', () => {
        expect(() => buildSettings({}, { SASR_HTTP_PORT: '70000' })).toThrow(/invalid http port/);
        expect(() => buildSettings({ http: { port: 0 } }, {})).toThrow(/invalid http port/);
    });

    it('treats an empty string as "keep the default"', () => {
        const settings = buildSettings({ serverName: '  ' }, { SASR_GAME_HOST: '  ' });
        expect(settings.serverName).toBe('SilentAutumnSR');
        expect(settings.game.bindHost).toBe('0.0.0.0');
    });

    describe('LAN address detection', () => {
        const nic = (address: string, family: string | number = 'IPv4'): os.NetworkInterfaceInfo =>
            ({
                address,
                family,
                internal: false,
                mac: '00:00:00:00:00:00',
                netmask: '255.255.255.0',
                cidr: `${address}/24`,
            }) as os.NetworkInterfaceInfo;

        it('prefers a physical 192.168 adapter over virtual and other private ones', () => {
            const address = detectLanAddress({
                'vEthernet (WSL)': [nic('172.20.0.1')],
                'VMware Network Adapter VMnet1': [nic('192.168.220.1')],
                'Wi-Fi': [nic('192.168.1.23')],
                'Ethernet 2': [nic('10.0.0.5')],
            });
            expect(address).toBe('192.168.1.23');
        });

        it('ignores loopback, internal and IPv6 interfaces', () => {
            const address = detectLanAddress({
                Loopback: [{ ...nic('127.0.0.1'), internal: true }],
                'Wi-Fi': [nic('fe80::1', 'IPv6'), nic('192.168.5.7')],
            });
            expect(address).toBe('192.168.5.7');
        });

        it('returns undefined when the host has no usable interface', () => {
            expect(detectLanAddress({})).toBeUndefined();
            expect(detectLanAddress({ Loopback: [{ ...nic('127.0.0.1'), internal: true }] })).toBeUndefined();
        });
    });

    describe('advertised address', () => {
        it('auto follows the bind address: all interfaces -> detected LAN address', () => {
            expect(resolvePublicHost('auto', '0.0.0.0', () => '192.168.1.23')).toBe('192.168.1.23');
        });

        it('auto on a loopback bind stays loopback', () => {
            expect(resolvePublicHost('auto', '127.0.0.1', () => '192.168.1.23')).toBe('127.0.0.1');
            expect(resolvePublicHost('', '::1', () => '192.168.1.23')).toBe('::1');
        });

        it('falls back to loopback when no interface can be detected', () => {
            expect(resolvePublicHost('auto', '0.0.0.0', () => undefined)).toBe('127.0.0.1');
        });

        it('uses an explicit value verbatim', () => {
            expect(resolvePublicHost('hkrpg.example.lan', '0.0.0.0', () => '192.168.1.23')).toBe(
                'hkrpg.example.lan',
            );
        });

        it('knows loopback spellings', () => {
            expect(isLoopback('localhost')).toBe(true);
            expect(isLoopback('127.0.0.1')).toBe(true);
            expect(isLoopback('127.10.1.2')).toBe(true);
            expect(isLoopback('::1')).toBe(true);
            expect(isLoopback('192.168.1.23')).toBe(false);
        });

        it('warns only when the server is reachable but the answer points at loopback', () => {
            const local = { ...defaultSettings(), game: { ...defaultSettings().game, bindHost: '127.0.0.1' } };
            expect(needsRemoteHint(local)).toBe(false);

            const unreachable = {
                ...defaultSettings(),
                game: { bindHost: '0.0.0.0', port: 23301, publicHost: '127.0.0.1' },
            };
            expect(needsRemoteHint(unreachable)).toBe(true);
        });
    });

    it('describes both the bound and the advertised addresses', () => {
        const lines = describeSettings({
            ...defaultSettings(),
            serverName: 'test-server',
        });
        const text = lines.join('\n');
        expect(text).toContain('name=test-server');
        expect(text).toMatch(/http=0\.0\.0\.0:21000 \(advertises /);
        expect(text).toMatch(/game=0\.0\.0\.0:23301 \(advertises /);
    });
});
