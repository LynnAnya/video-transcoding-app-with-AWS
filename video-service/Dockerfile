FROM node:18-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
CMD ["node", "app.js"]
EXPOSE 3001