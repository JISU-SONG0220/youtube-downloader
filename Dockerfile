FROM node:20-slim

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp 최신 버전 설치
RUN pip3 install --break-system-packages --upgrade yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# temp 폴더 생성
RUN mkdir -p temp

ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV NODE_ENV=production
# yt-dlp JS 런타임으로 Node.js 사용
ENV YTDLP_JS_RUNTIME=node
ENV PATH="/usr/local/bin:${PATH}"

EXPOSE 3000

CMD ["node", "server.js"]
