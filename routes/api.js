const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getVideoInfo, downloadVideo, downloadAudio, cleanFile, TEMP_DIR } = require('../services/ytdlp');
const cobalt = require('../services/cobalt');

function isValidYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    const validHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'];
    return validHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// POST /api/info - 영상 정보 조회
router.post('/info', async (req, res) => {
  const { url } = req.body;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: '유효한 YouTube URL을 입력해주세요.' });
  }

  // 1차: yt-dlp 시도
  try {
    const info = await getVideoInfo(url);
    return res.json(info);
  } catch (ytErr) {
    console.error('yt-dlp 실패, cobalt으로 전환:', ytErr.message);
  }

  // 2차: cobalt fallback
  try {
    const info = await cobalt.getInfo(url);
    return res.json(info);
  } catch (cobaltErr) {
    console.error('cobalt 실패:', cobaltErr.message);
    return res.status(500).json({ error: '영상 정보를 가져오는 데 실패했습니다.' });
  }
});

// POST /api/download - 파일 다운로드
router.post('/download', async (req, res) => {
  const { url, formatId, type, audioQuality, title, reencodeH264, outputFormat } = req.body;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: '유효한 YouTube URL을 입력해주세요.' });
  }
  if (!formatId || !type) {
    return res.status(400).json({ error: '다운로드 옵션이 올바르지 않습니다.' });
  }

  const validVideoFormats = ['mp4', 'mkv', 'webm'];
  const validAudioFormats = ['mp3', 'm4a', 'wav', 'ogg'];
  const ext = type === 'audio'
    ? (validAudioFormats.includes(outputFormat) ? outputFormat : 'mp3')
    : (validVideoFormats.includes(outputFormat) ? outputFormat : 'mp4');

  const safeTitle = (title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  const filename = `${safeTitle}.${ext}`;

  // ── cobalt 경로 (formatId가 'cobalt:'로 시작하는 경우) ──
  if (formatId.startsWith('cobalt:')) {
    try {
      const cobaltOpts = type === 'audio'
        ? { isAudio: true, audioFormat: validAudioFormats.includes(outputFormat) ? outputFormat : 'mp3' }
        : { quality: formatId.replace('cobalt:', '') || 'max' };

      const { url: streamUrl } = await cobalt.getStreamUrl(url, cobaltOpts);

      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Type', type === 'audio' ? 'audio/mpeg' : 'video/mp4');

      await cobalt.proxyStream(streamUrl, res);
    } catch (err) {
      console.error('cobalt 다운로드 오류:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'cobalt 다운로드 실패: ' + err.message });
    }
    return;
  }

  // ── yt-dlp 경로 ──
  const fileId = uuidv4();
  const outputPath = path.join(TEMP_DIR, `${fileId}.${ext}`);
  const outputTemplate = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

  try {
    if (type === 'audio') {
      await downloadAudio(url, audioQuality || '0', outputTemplate, ext);
    } else {
      await downloadVideo(url, formatId, outputTemplate, !!reencodeH264, ext);
    }

    let actualFile = outputPath;
    if (!fs.existsSync(actualFile)) {
      const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
      if (files.length === 0) return res.status(500).json({ error: '다운로드된 파일을 찾을 수 없습니다.' });
      actualFile = path.join(TEMP_DIR, files[0]);
    }

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');

    const stat = fs.statSync(actualFile);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(actualFile);
    stream.pipe(res);
    stream.on('end', () => cleanFile(actualFile));
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      cleanFile(actualFile);
      if (!res.headersSent) res.status(500).json({ error: '파일 전송 중 오류가 발생했습니다.' });
    });
    res.on('close', () => cleanFile(actualFile));

  } catch (err) {
    cleanFile(outputPath);
    console.error('Download error:', err.message);
    if (err.message.includes('yt-dlp가 설치')) {
      res.status(503).json({ error: err.message });
    } else if (err.message.includes('너무 많습니다')) {
      res.status(429).json({ error: err.message });
    } else {
      res.status(500).json({ error: '다운로드 실패: ' + err.message });
    }
  }
});

module.exports = router;
