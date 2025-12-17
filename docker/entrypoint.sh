#!/usr/bin/env sh
set -e

# Required envs (set at run time or via orchestrator)
: "${KEYCLOAK_ORIGIN:?Set KEYCLOAK_ORIGIN, e.g. https://kc.example.com}"
: "${API_ORIGINS:=}"  # space-separated, e.g. "https://api.example.com https://files.example.com"
: "${CSP_REPORT_ONLY:=false}"  # "true" -> Report-Only

# Build connect-src list
CONNECT_SRC="'self'"
for o in $KEYCLOAK_ORIGIN $API_ORIGINS; do
  [ -n "$o" ] && CONNECT_SRC="$CONNECT_SRC $o"
done

# Build CSP string (single line, no backslashes)
CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https: data:; connect-src $CONNECT_SRC; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"

# Header name
if [ "$CSP_REPORT_ONLY" = "true" ]; then
  export CSP_HEADER_NAME="Content-Security-Policy-Report-Only"
else
  export CSP_HEADER_NAME="Content-Security-Policy"
fi

# Escape quotes for nginx (replace ' with \')
export CSP_VALUE=$(echo "$CSP" | sed "s/'/\\\\'/g")

# Render nginx conf from template
envsubst '\$CSP_HEADER_NAME \$CSP_VALUE' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start nginx
nginx -g "daemon off;"