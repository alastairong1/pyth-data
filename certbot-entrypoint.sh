#!/bin/sh
set -e

DOMAIN="ops.st0x.io"
EMAIL="${CERTBOT_EMAIL:-alastair@st0x.io}"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "Starting certbot handler..."

# If certificate doesn't exist, obtain it
if [ ! -d "$CERT_PATH" ]; then
  echo "Certificate not found. Obtaining initial certificate for $DOMAIN..."
  certbot certonly \
    --standalone \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --preferred-challenges http \
    --http-01-port 80

  if [ $? -eq 0 ]; then
    echo "Certificate obtained successfully!"
  else
    echo "Failed to obtain certificate. Exiting."
    exit 1
  fi
else
  echo "Certificate already exists at $CERT_PATH"
fi

# Renewal loop
echo "Starting certificate renewal loop..."
trap exit TERM
while :; do
  sleep 12h
  echo "Running certificate renewal check..."
  certbot renew --quiet
done
