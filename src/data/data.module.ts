import { Global, Module } from '@nestjs/common';
import { DataService } from './data.service';
import { HotfixService } from './hotfix.service';
import { ConfigManager, configManager } from '../game-server/manager/config_mgr';

/**
 * Global so every feature module (http-server, game-server) can inject
 * DataService / ConfigManager without re-importing.
 */
@Global()
@Module({
    providers: [
        { provide: ConfigManager, useValue: configManager },
        DataService,
        HotfixService,
    ],
    exports: [DataService, HotfixService, ConfigManager],
})
export class DataModule {}
