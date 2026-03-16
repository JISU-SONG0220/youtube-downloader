const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// temp 폴더 없으면 생성
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 서버 시작 시 temp 폴더 정리
function cleanTempDir() {
  try {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      try {
        fs.unlinkSync(filePath);
      } catch {}
    });
  } catch {}
}
cleanTempDir();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

const server = app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});

// 긴 다운로드/변환 작업을 위해 타임아웃 비활성화
server.timeout = 0;
server.keepAliveTimeout = 0;
