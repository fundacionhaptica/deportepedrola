FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/uploads/facturas /app/uploads/certificados-donacion

CMD ["node", "server.js"]
