import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { StorageConfig } from './config/storage-config.js';
import { DatabaseService } from './database/database.service.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsService } from './projects/projects.service.js';
import { ProvidersController } from './providers/providers.controller.js';
import { ProviderService } from './providers/provider.service.js';

@Module({})
export class AppModule {
  static register(storage: StorageConfig, providers: ProviderService): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ProjectsController, ProvidersController],
      providers: [{ provide: StorageConfig, useValue: storage }, { provide: ProviderService, useValue: providers }, DatabaseService, ProjectsService],
    };
  }
}
