# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -- --configuration=production

# Stage 2: serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist/ai-product /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf