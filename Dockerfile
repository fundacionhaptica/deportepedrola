FROM node:20-alpine

# poppler-utils para pdftoppm/pdftotext (necesario para OCR de PDFs)
RUN apk add --no-cache poppler-utils

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/uploads/facturas /app/uploads/certificados-donacion

CMD ["sh", "-c", "npm run migrate && node server.js"]