/**
 * 작은 로컬 앱의 명시적인 의존성 그래프다. DB·작업 관리자·스토리지는 앱 인스턴스마다 하나씩 공유한다.
 * 테스트 대역도 같은 주입 경계를 통과하므로 HTTP/서비스 테스트가 운영 조립 방식과 어긋나지 않는다.
 */
import { KnowledgeController } from './knowledge/knowledge.controller.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { APP_GUARD } from '@nestjs/core';
import { MembersService } from './members/members.service.js';
import { MembersController } from './members/members.controller.js';
import { MembersGuard } from './members/members.guard.js';
import { ArrangementsController } from './arrangements/arrangements.controller.js';
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
import { GENERATION_RUNTIME, JobManager } from './generations/job-manager.js';
import { StorageService } from './storage/storage.service.js';
import type { ApplicationOptions } from './app.js';
import { TracksController } from './tracks/tracks.controller.js';
import { TracksService } from './tracks/tracks.service.js';

@Module({})
export class AppModule {
  // 설정 객체를 useValue로 공유하고, 실제 공급자에 맞는 전체 생성 제한 시간을 작업 관리자에 전달한다.
  static register(storage: StorageConfig, providers: ProviderService, options: ApplicationOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, ProjectsController, ProvidersController, GenerationsController, TracksController, MembersController, ArrangementsController, KnowledgeController],
      providers: [
        { provide: StorageConfig, useValue: storage }, { provide: ProviderService, useValue: providers },
        { provide: GENERATION_RUNTIME, useValue: { timeoutMs: options.generationTimeoutMs ?? providers.timeoutMs } },
        options.storageOverride ? { provide: StorageService, useValue: options.storageOverride } : StorageService,
        KnowledgeService, MembersService, { provide: APP_GUARD, useClass: MembersGuard }, DatabaseService, ProjectsService, GenerationsService, JobManager, TracksService,
      ],
    };
  }
}
