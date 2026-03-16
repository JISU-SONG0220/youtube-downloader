const { Readable } = require('stream');

const INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.drgnz.club',
];

async function fetchFromInstances(path) {
  let lastError;
  for (const instance of INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvidiousClient/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`[Invidious] ${instance} 실패:`, e.message);
      lastError = e;
    }
  }
  throw new Error(`모든 Invidious 인스턴스 실패: ${lastError?.message}`);
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v');
  } catch { return null; }
}

function formatDuration(seconds) {
  if (!seconds) return '알 수 없음';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function getVideoInfo(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('YouTube URL에서 영상 ID를 추출할 수 없습니다.');

  const data = await fetchFromInstances(`/api/v1/videos/${videoId}`);

  // formatStreams: 영상+오디오 통합 스트림 (보통 720p 이하)
  const videoOptions = (data.formatStreams || [])
    .filter(f => parseInt(f.qualityLabel) > 480)
    .sort((a, b) => parseInt(b.qualityLabel) - parseInt(a.qualityLabel))
    .map(f => ({
      quality: f.qualityLabel,
      codec: 'H.264',
      macCompat: true,
      format: 'MP4',
      formatId: String(f.itag),
      filesize: '알 수 없음',
      reencodeH264: false,
    }));

  // adaptiveFormats: 오디오 전용 스트림
  const audioFormats = (data.adaptiveFormats || [])
    .filter(f => f.type?.startsWith('audio/') && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const audioOptions = audioFormats.length ? [
    {
      quality: '최고 품질',
      format: audioFormats[0].type?.includes('mp4') ? 'M4A' : 'WebM',
      formatId: `audio_${audioFormats[0].itag}`,
      audioQuality: '0',
      filesize: '알 수 없음',
    },
  ] : [];

  const thumbnail = data.videoThumbnails?.find(t => t.quality === 'maxres')?.url
    || data.videoThumbnails?.[0]?.url
    || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    title: data.title,
    thumbnail,
    duration: formatDuration(data.lengthSeconds),
    videoOptions,
    audioOptions,
  };
}

async function getStreamUrl(youtubeUrl, formatId) {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) throw new Error('YouTube URL에서 영상 ID를 추출할 수 없습니다.');

  const data = await fetchFromInstances(`/api/v1/videos/${videoId}`);

  const isAudio = formatId.startsWith('audio_');
  const itag = isAudio ? formatId.replace('audio_', '') : formatId;

  const allFormats = [...(data.formatStreams || []), ...(data.adaptiveFormats || [])];
  const fmt = allFormats.find(f => String(f.itag) === String(itag));
  if (!fmt?.url) throw new Error(`포맷을 찾을 수 없습니다. (itag: ${itag})`);

  const ext = isAudio
    ? (fmt.type?.includes('mp4') ? 'm4a' : 'webm')
    : 'mp4';

  return { streamUrl: fmt.url, ext };
}

async function proxyStream(streamUrl, res) {
  const streamRes = await fetch(streamUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
    },
  });

  if (!streamRes.ok) throw new Error(`스트림 응답 오류: ${streamRes.status}`);

  const contentLength = streamRes.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  Readable.fromWeb(streamRes.body).pipe(res);
}

module.exports = { getVideoInfo, getStreamUrl, proxyStream };
