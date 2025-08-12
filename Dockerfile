# Stage 1: build
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
# You already copy env-specific config.json in CI before build
RUN npm run build -- --configuration=production

# Stage 2: Nginx
FROM nginx:alpine
# Copy built app
COPY --from=builder /app/dist/ai-product /usr/share/nginx/html

# Copy nginx template + entrypoint
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]