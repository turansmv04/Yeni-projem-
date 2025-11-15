# Node base image
FROM node:18-bullseye

# Sistem paketlərini quraşdır (Playwright üçün lazımdır)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Package faylları kopyala
COPY package*.json ./

# Dependencies quraşdır
RUN npm ci

# Playwright Chromium quraşdır
RUN npx playwright install chromium

# Kod kopyala
COPY . .

# Next.js build
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]