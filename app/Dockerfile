FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Application build
COPY --from=build /app/dist ./dist

# Runtime npm metadata and all dependencies, including devDependencies such as drizzle-kit
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules

# Drizzle CLI configuration and schema required by db:push
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/db ./db

EXPOSE 3000
CMD ["node", "dist/boot.js"]
