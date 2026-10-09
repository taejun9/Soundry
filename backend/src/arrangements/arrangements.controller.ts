import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import type { Arrangement } from '../../../shared/contracts.js';
import { DatabaseService } from '../database/database.service.js';
import { AppError } from '../api-errors.js';
import { projectId } from '../projects/project-input.js';
import { record } from '../members/members.service.js';
const invalid = () =>
  new AppError(
    400,
    'INVALID_ARRANGEMENT',
    '편집 구간과 행을 확인해 주세요. 최대 32행·128클립·600초까지 저장할 수 있습니다.',
  );
const num = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
@Controller('projects/:projectId/arrangement')
export class ArrangementsController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get() get(@Param('projectId') value: string): Arrangement {
    const id = projectId(value);
    this.exists(id);
    const row = this.database.client
      .prepare('SELECT content_json FROM arrangements WHERE project_id=?')
      .get(id) as { content_json: string } | undefined;
    return row
      ? (JSON.parse(row.content_json) as Arrangement)
      : { duration: 180, lanes: [{ id: randomUUID(), name: '행 1', muted: false, clips: [] }] };
  }
  @Put() save(@Param('projectId') value: string, @Body() body: unknown): Arrangement {
    const id = projectId(value);
    this.exists(id);
    const data = record(body, ['duration', 'lanes', 'bpm', 'snapBeats', 'masterVolume']);
    if (
      !num(data.duration, 1, 600) ||
      !Array.isArray(data.lanes) ||
      data.lanes.length < 1 ||
      data.lanes.length > 32
    )
      throw invalid();
    for (const [key, min, max] of [['bpm', 30, 300], ['snapBeats', 0, 4], ['masterVolume', 0, 1]] as const)
      if (data[key] !== undefined && !num(data[key], min, max)) throw invalid();
    if (data.snapBeats !== undefined && ![0, 0.25, 0.5, 1, 4].includes(data.snapBeats as number)) throw invalid();
    const ids = new Set<string>();
    let count = 0;
    for (const item of data.lanes) {
      const lane = record(item, ['id', 'name', 'muted', 'clips', 'volume', 'pan', 'solo', 'lowpassHz', 'delaySeconds', 'delayWet']);
      if (
        typeof lane.id !== 'string' ||
        ids.has(lane.id) ||
        typeof lane.name !== 'string' ||
        !lane.name.trim() ||
        lane.name.length > 80 ||
        typeof lane.muted !== 'boolean' ||
        !Array.isArray(lane.clips)
      )
        throw invalid();
      if (lane.solo !== undefined && typeof lane.solo !== 'boolean') throw invalid();
      for (const [key, min, max] of [['volume', 0, 1], ['pan', -1, 1], ['lowpassHz', 40, 20000], ['delaySeconds', 0, 2], ['delayWet', 0, 1]] as const)
        if (lane[key] !== undefined && !num(lane[key], min, max)) throw invalid();
      const laneId = projectId(lane.id);
      if (ids.has(laneId)) throw invalid();
      ids.add(laneId);
      lane.id = laneId;
      for (const item of lane.clips) {
        const c = record(item, ['id', 'trackId', 'label', 'start', 'offset', 'duration', 'volume', 'loop', 'fadeIn', 'fadeOut']);
        if (
          typeof c.id !== 'string' ||
          ids.has(c.id) ||
          typeof c.trackId !== 'string' ||
          typeof c.label !== 'string' ||
          !c.label.trim() ||
          c.label.length > 80 ||
          !num(c.start, 0, 600) ||
          !num(c.offset, 0, 600) ||
          !num(c.duration, 0.05, 600) ||
          !num(c.volume, 0, 1) ||
          typeof c.loop !== 'boolean' ||
          c.start + c.duration > data.duration
        )
          throw invalid();
        for (const key of ['fadeIn', 'fadeOut'])
          if (c[key] !== undefined && !num(c[key], 0, c.duration as number)) throw invalid();
        if (((c.fadeIn as number | undefined) ?? 0) + ((c.fadeOut as number | undefined) ?? 0) > (c.duration as number)) throw invalid();
        const clipId = projectId(c.id);
        if (ids.has(clipId)) throw invalid();
        ids.add(clipId);
        c.id = clipId;
        const trackId = projectId(c.trackId);
        c.trackId = trackId;
        const track = this.database.client
          .prepare(
            'SELECT t.duration_seconds FROM tracks t JOIN generations g ON g.id=t.generation_id WHERE t.id=? AND g.project_id=?',
          )
          .get(trackId, id) as { duration_seconds: number | null } | undefined;
        if (
          !track ||
          !track.duration_seconds ||
          c.offset >= track.duration_seconds ||
          (!c.loop && c.offset + c.duration > track.duration_seconds + 0.001)
        )
          throw invalid();
        if (++count > 128) throw invalid();
      }
    }
    this.database.client
      .transaction(() => {
        this.database.client
          .prepare(
            'INSERT INTO arrangements VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET content_json=excluded.content_json,updated_at=excluded.updated_at',
          )
          .run(id, JSON.stringify(data), new Date().toISOString());
        this.database.touchProject(id);
      })
      .immediate();
    return data as unknown as Arrangement;
  }
  private exists(id: string) {
    if (!this.database.client.prepare('SELECT 1 FROM projects WHERE id=?').get(id))
      throw new AppError(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }
}
