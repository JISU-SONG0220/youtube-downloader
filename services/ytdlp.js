const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const FFMPEG_PATH = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';

// macOS: h264_videotoolbox (하드웨어), Linux: libx264 (소프트웨어)
const isMac = process.platform === 'darwin';
const VIDEO_ENCODER = isMac ? 'h264_videotoolbox' : 'libx264';

// YouTube 봇 차단 우회 옵션
const YTDLP_BYPASS_ARGS = [
  '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  '--extractor-args', 'youtube:player_client=web',
  '--no-check-certificates',
  '--js-runtime', 'nodejs',
];

// 동시 다운로드 제한
let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 3;

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [...YTDLP_BYPASS_ARGS, ...args]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });

    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `yt-dlp 오류 (코드: ${code})`));
      }
    });

    proc.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp가 설치되어 있지 않습니다. README.md를 참고하여 설치해주세요.'));
      } else {
        reject(err);
      }
    });
  });
}

function detectCodec(vcodec) {
  if (!vcodec || vcodec === 'none') return 'unknown';
  const v = vcodec.toLowerCase();
  if (v.startsWith('avc1') || v.startsWith('h264')) return 'H.264';
  if (v.startsWith('hvc1') || v.startsWith('hev1') || v.startsWith('hevc')) return 'HEVC';
  if (v.startsWith('vp9') || v.startsWith('vp09')) return 'VP9';
  if (v.startsWith('av01') || v.startsWith('av1')) return 'AV1';
  return vcodec.split('.')[0].toUpperCase();
}

function isMacCompat(codec) {
  return codec === 'H.264' || codec === 'HEVC';
}

async function getVideoInfo(url) {
  const jsonStr = await runYtDlp(['--dump-json', '--no-playlist', url]);
  const info = JSON.parse(jsonStr);

  // 사용 가능한 포맷 분류
  const formats = info.formats || [];

  // 영상에 실제 존재하는 해상도 중 480p 초과만 높은 순으로 추출
  const targetResolutions = [
    ...new Set(
      formats
        .filter(f => f.height && f.height > 480 && f.vcodec !== 'none')
        .map(f => f.height)
    )
  ].sort((a, b) => b - a);

  const videoOptions = [];

  // AAC 오디오 (Mac 호환) 우선, 없으면 최고 품질
  const bestAacAudio = formats.filter(f =>
    f.vcodec === 'none' && f.acodec !== 'none' &&
    (f.acodec.toLowerCase().startsWith('mp4a') || f.ext === 'm4a')
  ).sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  const bestAudio = formats.filter(f =>
    f.vcodec === 'none' && f.acodec !== 'none'
  ).sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  const audioFmt = bestAacAudio || bestAudio;

  for (const res of targetResolutions) {
    // 해당 해상도의 모든 video-only 포맷
    const videoOnlyFormats = formats.filter(f =>
      f.height === res && f.vcodec !== 'none' && f.acodec === 'none'
    );

    // 통합 포맷 (video+audio)
    const combined = formats.find(f =>
      f.height === res && f.vcodec !== 'none' && f.acodec !== 'none'
    );

    if (videoOnlyFormats.length === 0 && !combined) continue;

    // H.264 video-only 포맷 우선
    const h264VideoOnly = videoOnlyFormats
      .filter(f => detectCodec(f.vcodec) === 'H.264')
      .sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];

    // 최고 품질 video-only (코덱 무관)
    const bestVideoOnly = videoOnlyFormats
      .sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];

    const nativeFmt = h264VideoOnly || combined || bestVideoOnly;
    if (!nativeFmt) continue;

    const codec = detectCodec(nativeFmt.vcodec);
    const macCompat = isMacCompat(codec);
    // 선택된 포맷에 오디오가 없으면 오디오 트랙을 별도로 합침
    const needsMerge = !nativeFmt.acodec || nativeFmt.acodec === 'none';
    const filesize = nativeFmt.filesize || nativeFmt.filesize_approx;
    const formatId = needsMerge
      ? `${nativeFmt.format_id}+${audioFmt?.format_id || 'bestaudio'}`
      : nativeFmt.format_id;

    // Mac 미지원 코덱(VP9/AV1)이면 자동으로 H.264 재인코딩
    const willReencode = !macCompat;

    videoOptions.push({
      quality: `${res}p`,
      codec: willReencode ? 'H.264' : codec,
      macCompat: true,
      format: willReencode ? 'MP4 (H.264 변환)' : 'MP4',
      formatId: willReencode && bestVideoOnly
        ? `${bestVideoOnly.format_id}+${audioFmt?.format_id || 'bestaudio'}`
        : formatId,
      filesize: filesize ? formatBytes(filesize) : '알 수 없음',
      type: 'video',
      reencodeH264: willReencode
    });
  }

  // 오디오 전용 옵션
  const audioOptions = [
    {
      quality: '최고 품질',
      format: 'MP3 (320kbps)',
      formatId: 'bestaudio',
      audioQuality: '0',
      filesize: '알 수 없음',
      type: 'audio'
    },
    {
      quality: '표준 품질',
      format: 'MP3 (128kbps)',
      formatId: 'bestaudio',
      audioQuality: '5',
      filesize: '알 수 없음',
      type: 'audio'
    }
  ];

  return {
    title: info.title,
    thumbnail: info.thumbnail,
    duration: formatDuration(info.duration),
    videoOptions,
    audioOptions
  };
}

// yt-dlp로 다운로드+병합
function ytDlpMerge(url, formatId, outputTemplate, mergeFormat) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '-f', formatId,
      '--merge-output-format', mergeFormat,
      '--ffmpeg-location', FFMPEG_PATH,
      '--concurrent-fragments', '4',
      ...YTDLP_BYPASS_ARGS,
      '-o', outputTemplate,
      '--newline',
      url,
    ];
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `다운로드 실패 (코드: ${code})`));
    });
    proc.on('error', err => {
      if (err.code === 'ENOENT') reject(new Error('yt-dlp가 설치되어 있지 않습니다.'));
      else reject(err);
    });
  });
}

// 단일 스트림 다운로드 (병합 없이)
function ytDlpDownloadOnly(url, formatId, outputTemplate) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '-f', formatId,
      '--concurrent-fragments', '4',
      ...YTDLP_BYPASS_ARGS,
      '-o', outputTemplate,
      '--newline',
      url,
    ];
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `다운로드 실패 (코드: ${code})`));
    });
    proc.on('error', err => {
      if (err.code === 'ENOENT') reject(new Error('yt-dlp가 설치되어 있지 않습니다.'));
      else reject(err);
    });
  });
}

// ffmpeg로 영상+오디오 병합 및 H.264 인코딩 (한 번에)
function ffmpegMergeEncode(videoFile, audioFile, outputFile) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoFile,
      '-i', audioFile,
      '-c:v', VIDEO_ENCODER,
      ...(isMac ? ['-b:v', '8000k', '-realtime', 'true'] : ['-preset', 'fast', '-crf', '23']),
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputFile,
    ];
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error('H.264 변환 실패: ' + stderr.slice(-300)));
    });
    proc.on('error', reject);
  });
}

async function downloadVideo(url, formatId, outputPath, reencodeH264, outputFormat) {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
    throw new Error('현재 다운로드가 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }
  activeDownloads++;

  const base = outputPath.replace('.%(ext)s', '');
  const fmt = outputFormat || 'mp4';

  try {
    if (reencodeH264) {
      // formatId = "videoFormatId+audioFormatId" 형태
      const [videoFmtId, audioFmtId = 'bestaudio'] = formatId.split('+');

      const videoTemplate = `${base}_v_tmp.%(ext)s`;
      const audioTemplate = `${base}_a_tmp.%(ext)s`;

      // 영상/오디오 스트림을 동시에 다운로드
      await Promise.all([
        ytDlpDownloadOnly(url, videoFmtId, videoTemplate),
        ytDlpDownloadOnly(url, audioFmtId, audioTemplate),
      ]);

      // 실제 생성된 파일 찾기
      const vFiles = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(path.basename(`${base}_v_tmp`)));
      const aFiles = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(path.basename(`${base}_a_tmp`)));
      if (!vFiles.length || !aFiles.length) throw new Error('다운로드된 스트림 파일을 찾을 수 없습니다.');

      const videoFile = path.join(TEMP_DIR, vFiles[0]);
      const audioFile = path.join(TEMP_DIR, aFiles[0]);
      const finalFile = `${base}.${fmt}`;

      try {
        // 병합 + H.264 인코딩을 한 번에 처리
        await ffmpegMergeEncode(videoFile, audioFile, finalFile);
      } finally {
        cleanFile(videoFile);
        cleanFile(audioFile);
      }
    } else {
      await ytDlpMerge(url, formatId, outputPath, fmt);
    }
  } finally {
    activeDownloads--;
  }
}

function downloadAudio(url, audioQuality, outputPath, outputFormat, onProgress) {
  return new Promise((resolve, reject) => {
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      return reject(new Error('현재 다운로드가 너무 많습니다. 잠시 후 다시 시도해주세요.'));
    }

    activeDownloads++;
    const fmt = outputFormat || 'mp3';

    const args = [
      '--no-playlist',
      '-f', 'bestaudio',
      '-x',
      '--audio-format', fmt,
      '--audio-quality', audioQuality,
      '--ffmpeg-location', FFMPEG_PATH,
      '--concurrent-fragments', '4',
      ...YTDLP_BYPASS_ARGS,
      '-o', outputPath,
      '--newline',
      url
    ];

    const proc = spawn('yt-dlp', args);
    let stderr = '';

    proc.stdout.on('data', data => {
      const line = data.toString();
      if (onProgress && line.includes('[download]')) {
        const match = line.match(/(\d+\.?\d*)%/);
        if (match) {
          onProgress(parseFloat(match[1]));
        }
      }
    });

    proc.stderr.on('data', data => { stderr += data.toString(); });

    proc.on('close', code => {
      activeDownloads--;
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `다운로드 실패 (코드: ${code})`));
      }
    });

    proc.on('error', err => {
      activeDownloads--;
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp가 설치되어 있지 않습니다.'));
      } else {
        reject(err);
      }
    });
  });
}

function formatDuration(seconds) {
  if (!seconds) return '알 수 없음';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '알 수 없음';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`;
  return `~${Math.round(mb)} MB`;
}

function cleanFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

module.exports = { getVideoInfo, downloadVideo, downloadAudio, cleanFile, TEMP_DIR };
