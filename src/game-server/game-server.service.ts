import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'net';
import { NetSession } from './NetSession';
import { DataService } from '../data/data.service';
import { ConfigManager } from './manager/config_mgr';

@Injectable()
export class GameServerService {
    private readonly logger = new Logger(GameServerService.name);

    constructor(
        private readonly dataService: DataService,
        private readonly config: ConfigManager,
    ) {}

    /** One NetSession per accepted client connection. */
    public handleConnection(socket: Socket): void {
        socket.setNoDelay(true);
        const session = new NetSession(socket, this.dataService, this.config);
        session.run().catch((err) => {
            this.logger.error(`session loop crashed: ${err?.stack ?? err}`);
        });
    }
}
