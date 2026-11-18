import { Injectable } from '@nestjs/common';
import { GAME_PORT, HTTP_PORT, SERVER_NAME } from './common/constants';
import { DataService } from './data/data.service';

@Injectable()
export class AppService {
    constructor(private readonly dataService: DataService) {}

    /** Plain-text status page; useful to confirm which port answered. */
    getStatus(): string {
        const versions = Object.keys(this.dataService.getVersionData());
        return (
            `${SERVER_NAME} is running.\n` +
            `dispatch/http : ${HTTP_PORT}\n` +
            `game (tcp)    : ${GAME_PORT}\n` +
            `versions      : ${versions.join(', ') || '(none)'}\n`
        );
    }
}
