#!/usr/bin/env sh
set -e

# Required envs (set at run time or via orchestrator)
: "${API_URL:?Set API_URL, e.g. https://acd.pxl-codit.com/api}"
: "${KEYCLOAK_URL:?Set KEYCLOAK_URL, e.g. https://keycloak.pxl-codit.com/}"
: "${ENVIRONMENT:=production}"
: "${CSP_REPORT_ONLY:=false}"

# Set COOP based on environment
if [ "$ENVIRONMENT" = "development" ]; then
  export COOP_VALUE="unsafe-none"
else
  export COOP_VALUE="same-origin"
fi

# Debug: print environment variables
echo "=== Runtime Environment ==="
echo "API_URL: ${API_URL}"
echo "KEYCLOAK_URL: ${KEYCLOAK_URL}"
echo "ENVIRONMENT: ${ENVIRONMENT}"
echo "=========================="

# Generate env-config.js from template using envsubst
echo "Generating runtime env-config.js..."
envsubst < /usr/share/nginx/html/env-config.template.js > /usr/share/nginx/html/env-config.js

# Verify generated file
echo "Generated env-config.js:"
cat /usr/share/nginx/html/env-config.js

# Build CSP connect-src list
CONNECT_SRC="'self'"
for url in $KEYCLOAK_URL $API_URL; do
  [ -n "$url" ] && CONNECT_SRC="$CONNECT_SRC $url"
done

# Build CSP string (single line)
CSP_VALUE="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https: data:; connect-src $CONNECT_SRC; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"

# Set CSP header name
if [ "$CSP_REPORT_ONLY" = "true" ]; then
  export CSP_HEADER="Content-Security-Policy-Report-Only"
else
  export CSP_HEADER="Content-Security-Policy"
fi

export CSP_VALUE

# Render nginx config from template
envsubst '${CSP_HEADER} ${CSP_VALUE} ${COOP_VALUE}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "✅ Runtime configuration complete"

# Start nginx
exec nginx -g 'daemon off;'