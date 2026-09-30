import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { StorageConfig } from './config/storage-config.js';
import { DatabaseService } from './database/database.service.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsService } from './projects/projects.service.js';
import { ProvidersController } from './providers/providers.controller.js';
import { ProviderService } from './providers/provider.service.js';
import { GenerationsController } from './generations/generations.controller.js';
import { GenerationsService } from './generations/generations.service.js';
import { DEFAULT_GENERATION_TIMEOUT_MS, GENERATION_RUNTIME, JobManager } from './generations/job-manager.js';
import { StorageService } from './storage/storage.service.js';
import type { ApplicationOptions } from './app.js';

@Module({})
export class AppModule {
  static register(storage: StorageConfig, providers: ProviderService, options: ApplicationOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ProjectsController, ProvidersController, GenerationsController],
      providers: [
        { provide: StorageConfig, useValue: storage }, { provide: ProviderService, useValue: providers },
        { provide: GENERATION_RUNTIME, useValue: { timeoutMs: options.generationTimeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS } },
        options.storageOverride ? { provide: StorageService, useValue: options.storageOverride } : StorageService,
        DatabaseService, ProjectsService, GenerationsService, JobManager,
      ],
    };
  }
}
