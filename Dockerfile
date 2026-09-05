# Stage 1: Build the UI application
FROM node:lts-alpine as build-stage

WORKDIR /app

RUN apk add --no-cache git

# Copy package configurations
COPY package*.json ./
COPY ui/package*.json ./ui/

# Install UI dependencies
WORKDIR /app/ui
RUN npm install

# Copy application source
WORKDIR /app
COPY . .

# Build Vite application for production
WORKDIR /app/ui
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine as production-stage

COPY --from=build-stage /app/ui/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
