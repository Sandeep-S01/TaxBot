FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY tailwind.config.cjs ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
