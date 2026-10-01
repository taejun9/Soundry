import { Controller, Get, Head, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { audioDisposition, parseAudioRange } from './audio-headers.js';
import { TracksService } from './tracks.service.js';

@Controller('tracks')
export class TracksController {
  constructor(@Inject(TracksService) private readonly tracks: TracksService) {}

  @Head(':id/audio')
  headAudio(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<void> { return this.send(id, request, response, false); }

  @Get(':id/audio')
  audio(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<void> { return this.send(id, request, response, false); }

  @Head(':id/download')
  headDownload(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<void> { return this.send(id, request, response, true); }

  @Get(':id/download')
  download(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<void> { return this.send(id, request, response, true); }

  private async send(id: string, request: Request, response: Response, attachment: boolean): Promise<void> {
    const audio = this.tracks.openAudio(id);
    try {
      if (request.aborted || response.destroyed) return;
      // HEAD ignores Range; without validators an If-Range condition cannot match.
      const range = parseAudioRange(request.method === 'HEAD' || request.headers['if-range'] !== undefined ? undefined : request.headers.range, audio.size);
      response.setHeader('Accept-Ranges', 'bytes');
      if (range.kind === 'unsatisfiable') {
        response.setHeader('Content-Range', `bytes */${audio.size}`);
        response.status(416).json({ error: { code: 'RANGE_NOT_SATISFIABLE', message: '요청한 음원 범위를 읽을 수 없습니다.' } });
        return;
      }
      const start = range.kind === 'partial' ? range.start : 0;
      const end = range.kind === 'partial' ? range.end : audio.size - 1;
      response.status(range.kind === 'partial' ? 206 : 200);
      response.setHeader('Content-Type', audio.mediaType);
      response.setHeader('Content-Length', String(end - start + 1));
      response.setHeader('Content-Disposition', audioDisposition(audio.title, attachment, audio.extension));
      if (range.kind === 'partial') response.setHeader('Content-Range', `bytes ${start}-${end}/${audio.size}`);
      if (request.method === 'HEAD') { response.end(); return; }
      const source = audio.stream(start, end);
      try {
        // Backpressure and client disconnects destroy the stream and close its owned FD.
        await pipeline(source, response);
      } catch {
        // Headers may already be on the wire; never append JSON/private I/O errors to audio.
        if (!response.destroyed) response.destroy();
      }
    } finally { audio.close(); }
  }
}
