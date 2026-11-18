import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DataService } from './data/data.service';
import { HotfixService } from './data/hotfix.service';
import { requestLogger } from './http-server/request-logger';
import { installFileLogging } from './common/file-log';
import { HTTP_HOST, HTTP_PORT, SERVER_NAME } from './common/constants';
import { describeSettings, needsRemoteHint, settings as runtimeSettings } from './common/settings';

async function bootstrap(): Promise<void> {
    // Before anything else: the server is usually started in its own window by
    // run.bat, where its output is lost once it scrolls.
    installFileLogging();

    // Print the effective runtime configuration once: on a second machine the
    // usual failure is "listening, but the client dials an address that is not
    // this host", and this line answers that without reading any code.
    console.log(`[config] ${SERVER_NAME}`);
    for (const line of describeSettings()) console.log(`[config]   ${line}`);
    if (needsRemoteHint(runtimeSettings)) {
        console.warn(
            '[config] the client is told to dial a loopback address while the server binds ' +
                'all interfaces: another device cannot reach it. Set http/game publicHost ' +
                '(or SASR_HTTP_PUBLIC_HOST / SASR_GAME_PUBLIC_HOST) to this machine\'s LAN ' +
                'address or host name.',
        );
    }

    const app = await NestFactory.create(AppModule, { cors: true });
    app.use(json({ limit: '500mb' }));
    app.use(urlencoded({ limit: '500mb', extended: true }));
    // After the body parsers, so the logger can show what the client sent.
    app.use(requestLogger());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    // Load every table before the first client can connect.
    app.get(DataService).loadAll();

    // Import the local version-chain files (pearl-sr's hotfix.json included) so
    // a version the checkout already knows is answered without any network I/O.
    // Remote sources are fetched lazily, on the first /query_gateway for a
    // version that is still unknown; see docs/hotfix-chain.md.
    void app.get(HotfixService).warmup();

    // The bind address is configuration, not a literal: the default
    // `0.0.0.0` accepts both the local proxy and other devices, while a
    // loopback value deliberately restricts the server to this machine.
    await app.listen(HTTP_PORT, HTTP_HOST);
    console.log(`${SERVER_NAME} http/dispatch listening on ${HTTP_HOST}:${HTTP_PORT}`);
}

bootstrap().catch((err) => {
    const msg = String(err?.message ?? err);
    if (/EADDRINUSE/.test(msg)) {
        console.error(
            `\n[main] port already in use, server did not start: ${msg}\n` +
                '  A previous run is probably still alive. Kill the process holding ' +
                `${HTTP_PORT} / the game port, then start again.\n`,
        );
    } else {
        console.error(`\n[main] startup failed: ${msg}\n`, err?.stack ?? '');
    }
    process.exit(1);
});
