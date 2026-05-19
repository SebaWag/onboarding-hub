#!/bin/bash

DOMAIN="onboarding.wagnersolutionsai.com"
EMAIL="sebastian@konektor.cl"  # Cambia por tu email

echo "🔐 Iniciando configuración SSL para $DOMAIN"

# 1. Crear nginx temporal para el challenge
cat > /tmp/nginx-temp.conf << 'NGINX'
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}
NGINX

# 2. Copiar configuración temporal
docker exec onboarding-hub-frontend sh -c 'cat > /etc/nginx/conf.d/default.conf' < /tmp/nginx-temp.conf
docker exec onboarding-hub-frontend nginx -s reload

echo "⏳ Esperando 5 segundos..."
sleep 5

# 3. Obtener certificado
docker run --rm \
  -v onboarding-hub_certbot_www:/var/www/certbot \
  -v onboarding-hub_certbot_conf:/etc/letsencrypt \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $DOMAIN

if [ $? -eq 0 ]; then
    echo "✅ Certificado obtenido exitosamente"
    
    # 4. Actualizar nginx con SSL real
    ssh oracle-konektor "cat > ~/onboarding-hub/frontend/nginx.conf << 'NGINX'
server {
    listen 80;
    server_name $DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $DOMAIN;
    root /usr/share/nginx/html;
    index index.html;

    # Let's Encrypt SSL
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Handle React Router (SPA)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
NGINX"
    
    # 5. Reconstruir frontend
    cd ~/onboarding-hub
    docker-compose up -d --build frontend
    
    echo "🎉 ¡Configuración completada!"
    echo "🌐 Accede a: https://$DOMAIN"
else
    echo "❌ Error al obtener certificado"
    echo "Verifica que:"
    echo "  1. El DNS apunte a tu servidor"
    echo "  2. El puerto 80 esté accesible desde internet"
fi
