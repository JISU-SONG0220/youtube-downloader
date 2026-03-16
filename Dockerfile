FROM node:20-slim

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp 설치
RUN pip3 install --break-system-packages yt-dlp

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
