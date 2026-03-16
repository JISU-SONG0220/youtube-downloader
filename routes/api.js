const express = require('express');
const router = express.Router();
const invidious = require('../services/invidious');

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

  try {
    const info = await invidious.getVideoInfo(url);
    res.json(info);
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: '영상 정보를 가져오는 데 실패했습니다: ' + err.message });
  }
});

// POST /api/download - 파일 다운로드
router.post('/download', async (req, res) => {
  const { url, formatId, type, title } = req.body;

  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: '유효한 YouTube URL을 입력해주세요.' });
  }
  if (!formatId || !type) {
    return res.status(400).json({ error: '다운로드 옵션이 올바르지 않습니다.' });
  }

  try {
    const { streamUrl, ext } = await invidious.getStreamUrl(url, formatId);

    const safeTitle = (title || 'video').replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    const filename = `${safeTitle}.${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', type === 'audio'
      ? (ext === 'm4a' ? 'audio/mp4' : 'audio/webm')
      : 'video/mp4');

    await invidious.proxyStream(streamUrl, res);
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '다운로드 실패: ' + err.message });
    }
  }
});

module.exports = router;
