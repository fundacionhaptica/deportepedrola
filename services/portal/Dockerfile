# Dockerfile opcional. Por defecto el docker-compose.yml usa nginx:alpine
# directamente con un bind mount de ./html. Este Dockerfile solo se usaría
# si en el futuro queremos una imagen propia con el HTML embebido (más
# portable, menos rebote disco).
#
# Para activarlo, cambiar en docker-compose.yml:
#   image: nginx:alpine
# por:
#   build: .

FROM nginx:alpine

COPY html/ /usr/share/nginx/html/
