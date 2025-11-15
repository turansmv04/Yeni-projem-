FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npx playwright install chromium

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
