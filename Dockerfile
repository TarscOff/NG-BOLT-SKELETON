# Runtime-only image: Angular is already built by CI

FROM nginx:alpine

# Copy built Angular app (CI will provide dist/pxs-ng-skeleton)
COPY dist/pxs-ng-skeleton/browser /usr/share/nginx/html

# Copy env-config template (will be processed at runtime)
COPY public/env-config.template.js /usr/share/nginx/html/env-config.template.js

# Copy nginx template + entrypoint
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]