const { Readable } = require('stream');

const COBALT_API = 'https://api.cobalt.tools/';

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v');
  } catch { return null; }
}

async function getInfo(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('YouTube URL에서 영상 ID를 추출할 수 없습니다.');

  const res = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
  );
  if (!res.ok) throw new Error('영상 정보를 가져오지 못했습니다.');
  const oembed = await res.json();

  return {
    title: oembed.title,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    duration: '',
    videoOptions: [
      { quality: '최고 화질', codec: 'H.264', macCompat: true, format: 'MP4', formatId: 'cobalt:max',  filesize: '알 수 없음', reencodeH264: false },
      { quality: '1080p',    codec: 'H.264', macCompat: true, format: 'MP4', formatId: 'cobalt:1080', filesize: '알 수 없음', reencodeH264: false },
      { quality: '720p',     codec: 'H.264', macCompat: true, format: 'MP4', formatId: 'cobalt:720',  filesize: '알 수 없음', reencodeH264: false },
      { quality: '480p',     codec: 'H.264', macCompat: true, format: 'MP4', formatId: 'cobalt:480',  filesize: '알 수 없음', reencodeH264: false },
    ],
    audioOptions: [
      { quality: '최고 품질', format: 'MP3', formatId: 'cobalt:audio', audioQuality: '0', filesize: '알 수 없음' },
    ],
  };
}

// cobalt API v10 사양에 맞게 요청
async function getStreamUrl(youtubeUrl, { quality, isAudio = false, audioFormat = 'mp3' } = {}) {
  const body = isAudio
    ? { url: youtubeUrl, downloadMode: 'audio', audioFormat }
    : { url: youtubeUrl, videoQuality: quality || 'max' };

  const res = await fetch(COBALT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`cobalt API 오류 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(data.error?.code || JSON.stringify(data.error) || 'cobalt 오류');
  }

  // redirect / tunnel → 직접 URL
  if (data.status === 'redirect' || data.status === 'tunnel') {
    if (!data.url) throw new Error('cobalt에서 URL을 받지 못했습니다.');
    return { url: data.url, filename: data.filename || 'video.mp4' };
  }

  // picker → 첫 번째 항목 사용
  if (data.status === 'picker') {
    const first = data.picker?.[0];
    if (!first?.url) throw new Error('cobalt picker에서 항목을 찾을 수 없습니다.');
    return { url: first.url, filename: data.filename || 'video.mp4' };
  }

  throw new Error(`알 수 없는 cobalt 응답 상태: ${data.status}`);
}

async function proxyStream(streamUrl, res) {
  const streamRes = await fetch(streamUrl);
  if (!streamRes.ok) throw new Error(`cobalt 스트림 오류: ${streamRes.status}`);

  const contentLength = streamRes.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  Readable.fromWeb(streamRes.body).pipe(res);
}

module.exports = { getInfo, getStreamUrl, proxyStream };
