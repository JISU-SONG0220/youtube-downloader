# YouTube Video Downloader

YouTube 영상을 다양한 화질과 형식으로 다운로드할 수 있는 웹 애플리케이션입니다.

## 사전 요구사항

### 1. Node.js 설치
- https://nodejs.org 에서 LTS 버전 설치

### 2. yt-dlp 설치

**macOS (Homebrew):**
```bash
brew install yt-dlp
```

**macOS/Linux (직접 설치):**
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows:**
```powershell
winget install yt-dlp
```
또는 [yt-dlp 릴리즈 페이지](https://github.com/yt-dlp/yt-dlp/releases)에서 `yt-dlp.exe` 다운로드 후 PATH에 추가

### 3. FFmpeg 설치

**macOS (Homebrew):**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**Windows:**
```powershell
winget install ffmpeg
```
또는 [FFmpeg 공식 사이트](https://ffmpeg.org/download.html)에서 다운로드 후 PATH에 추가

### 설치 확인
```bash
yt-dlp --version
ffmpeg -version
```

---

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 서버 실행
npm start
```

브라우저에서 `http://localhost:3000` 접속

### 개발 모드 (파일 변경 시 자동 재시작)
```bash
npm run dev
```

---

## 사용 방법

1. YouTube 영상 URL을 입력창에 붙여넣기
2. **다운로드** 버튼 클릭
3. 영상 정보와 다운로드 옵션이 표시됨
4. 원하는 화질/형식의 **다운로드** 버튼 클릭
5. 파일이 자동으로 저장됨

---

## 프로젝트 구조

```
youtube-downloader/
├── server.js              # Express 서버
├── package.json
├── routes/
│   └── api.js             # API 엔드포인트
├── services/
│   └── ytdlp.js           # yt-dlp 래퍼
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── temp/                  # 임시 파일 (자동 정리)
```

---

## 주의사항

- 이 도구는 개인적인 용도로만 사용하세요.
- 저작권이 있는 콘텐츠를 무단으로 배포하거나 상업적으로 이용하는 것은 불법입니다.
- YouTube 이용약관을 준수하여 사용하세요.
