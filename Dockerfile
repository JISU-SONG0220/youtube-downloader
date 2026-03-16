FROM node:20-slim

# ffmpeg 및 curl 설치
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp 설치 (최신 바이너리)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# temp 폴더 생성
RUN mkdir -p temp

ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
