FROM nginx:alpine

COPY nginx.conf /etc/nginx/templates/default.conf.template
# Cache bust: v6-lazy-init
COPY src/ /usr/share/nginx/html/

EXPOSE 8080
