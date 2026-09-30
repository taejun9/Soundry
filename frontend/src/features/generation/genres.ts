/** User-selectable writing prompts, not measured output metadata. */
export const GENRE_PRESETS = [
  { id: 'hip-hop', label: 'Hip-hop', concept: '비가 씻어낸 도시', prompt: 'Instrumental hip-hop for a rain-washed city street. Warm jazz piano, deep bass, swung drums, and a memorable original hook.' },
  { id: 'trap', label: 'Trap', concept: '한밤의 고속도로', prompt: 'Instrumental trap for a nighttime highway. Sliding 808 bass, metallic plucks, intricate hi-hats, and a spacious half-time groove.' },
  { id: 'rnb-soul', label: 'R&B / Soul', concept: '늦은 밤의 발코니', prompt: 'Instrumental R&B and soul for a late-night balcony. Warm Rhodes chords, a gentle bass line, intimate drums, and expressive melodies.' },
  { id: 'pop', label: 'Pop', concept: '바닷가 주말의 시작', prompt: 'Bright instrumental pop for the start of a seaside weekend. Sparkling guitars, an original synth hook, and an uplifting chorus.' },
  { id: 'rock', label: 'Rock', concept: '집으로 가는 막차', prompt: 'Energetic instrumental rock for the last train home. Live drums, driving original guitar riffs, a dynamic break, and a strong ending.' },
  { id: 'funk', label: 'Funk', concept: '롤러스케이트장의 오후', prompt: 'Playful instrumental funk in a roller rink. Slap bass, wah guitar, tight drums, and call-and-response brass phrases.' },
  { id: 'jazz', label: 'Jazz', concept: '문을 닫는 작은 재즈 바', prompt: 'Instrumental jazz in a small bar at closing time. Piano trio, brushed drums, warm saxophone, and an unhurried original melody.' },
  { id: 'house', label: 'House', concept: '옥상에서 맞는 해돋이', prompt: 'Instrumental house for a rooftop sunrise. Four-on-the-floor drums, warm piano chords, a rolling bass line, and a gradual melodic build.' },
  { id: 'techno', label: 'Techno', concept: '콘크리트 지하 공간', prompt: 'Instrumental techno in a concrete underground room. Tight kicks, evolving modular synth patterns, restrained tension, and a decisive final release.' },
  { id: 'drum-and-bass', label: 'Drum & Bass', concept: '심야 버스 창밖의 불빛', prompt: 'Liquid instrumental drum and bass for lights outside a night bus. Fluid pads, detailed breaks, a deep sub bass, and an emotional original motif.' },
  { id: 'ambient', label: 'Ambient', concept: '기억을 싣고 흐르는 조수', prompt: 'Ambient instrumental about a tide carrying memories. Slow evolving drones, felt piano, spacious textures, and a calm resolved ending.' },
  { id: 'cinematic', label: 'Cinematic', concept: '능선 너머 새로운 풍경', prompt: 'Cinematic instrumental about discovering a landscape beyond a ridge. Expansive strings, warm French horns, and gradually growing percussion.' },
  { id: 'acoustic-folk', label: 'Acoustic / Folk', concept: '햇살이 드는 창가 정원', prompt: 'Acoustic folk instrumental in a sunny window garden. Fingerstyle guitar, a light shaker, lyrical cello, and a warm natural atmosphere.' },
  { id: 'classical', label: 'Classical', concept: '종이로 만든 별자리', prompt: 'Original classical instrumental about paper constellations. Expressive piano and string quartet, a developing melodic theme, and a clear cadence.' },
  { id: 'latin', label: 'Latin', concept: '해 질 무렵의 시장', prompt: 'Latin instrumental at a market near sunset. Nylon-string guitar, lively hand percussion, syncopated bass, and a joyful original melody.' },
  { id: 'reggae-dub', label: 'Reggae / Dub', concept: '해안을 따라 걷는 산책', prompt: 'Reggae dub instrumental for a coastal walk. Offbeat guitar, deep rounded bass, spacious tape delays, and a relaxed original hook.' },
] as const;
