import { Module } from '@nestjs/common';
import * as net from 'net';
import { GameServerService } from './game-server.service';
import { GAME_HOST, GAME_PORT, GATEWAY_HOST } from '../common/constants';
import { startKcpTransport } from './kcp-transport';

/**
 * The game (TCP) server. The client is pointed here by query_gateway.
 */
@Module({
    providers: [
        GameServerService,
        {
            provide: 'TcpServerService',
            useFactory: (gameServerService: GameServerService) => {
                const server = net.createServer((socket) => {
                    gameServerService.handleConnection(socket);
                });

                server.on('error', (err) => {
                    console.error(`[game-server] fatal: ${err.message}`);
                    process.exit(1);
                });

                server.listen(GAME_PORT, GAME_HOST, () => {
                    startKcpTransport(GAME_HOST, GAME_PORT);
                    // Say both what was bound and what the client is told to
                    // dial: on a multi-homed host those are different, and a
                    // mismatch is the usual reason a second device cannot log in.
                    console.log(
                        `Game server listening on ${GAME_HOST}:${GAME_PORT} ` +
                            `(client is told ${GATEWAY_HOST}:${GAME_PORT})`,
                    );
                });

                return server;
            },
            inject: [GameServerService],
        },
    ],
})
export class GameServerModule {}
