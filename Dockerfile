# Stage 1
FROM node:18-alpine AS appbuild

WORKDIR /app
COPY package*.json ./
RUN npm install
# RUN npm ci --only=production
COPY . .
RUN npm run build
# RUN npm run test

# # Stage 2
# FROM node:16-alpine
# WORKDIR /app
# # COPY --from=appbuild /app/node_modules ./node_modules
# COPY --from=appbuild /app/dist .

# Stage 2
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
# COPY .npmrc ./
COPY --from=appbuild /app/node_modules ./node_modules
COPY --from=appbuild /app/dist .

EXPOSE 3000
# CMD [ "node", "index.js" ]
CMD [ "node", "main.js" ]
