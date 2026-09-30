import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { StorageConfig } from './config/storage-config.js';
import { DatabaseService } from './database/database.service.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ProjectsService } from './projects/projects.service.js';

@Module({})
export class AppModule {
  static register(storage: StorageConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ProjectsController],
      providers: [{ provide: StorageConfig, useValue: storage }, DatabaseService, ProjectsService],
    };
  }
}
