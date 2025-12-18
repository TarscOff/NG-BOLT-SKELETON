# Runtime-only image: Angular is already built by CI

FROM nginx:alpine

# Accept build argument
ARG ENVIRONMENT=production
ENV ENVIRONMENT=${ENVIRONMENT}

# Copy built Angular app (CI will provide dist/psx-ng-skeleton)
COPY dist/psx-ng-skeleton/browser /usr/share/nginx/html

# Copy nginx template + entrypoint
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]