# AtomicNet — single-container deploy: Canton sandbox (JVM) + Node backend serving the
# React frontend on one origin. Builds the model DAR and the frontend in-image.
FROM eclipse-temurin:21-jdk-jammy

# System deps + Node 22 (for the backend + frontend build).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

ENV DPM_HOME=/root/.dpm
ENV PATH="/root/.dpm/bin:${PATH}"

# Install DPM + the pinned Canton/Daml SDK (cached layer — before any app code).
RUN curl -fsSL https://get.digitalasset.com/install/install.sh | sh
RUN dpm install 3.4.11

WORKDIR /app

# Build the model DAR (the sandbox runs this).
COPY daml ./daml
RUN cd daml && dpm build

# Build the frontend (static assets served by the backend).
COPY frontend ./frontend
RUN cd frontend && npm ci && npm run build

# Backend deps (hono) + tsx (global) to run the TypeScript directly.
RUN npm install -g tsx
COPY backend ./backend
RUN cd backend && npm install

COPY deploy/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV FRONTEND_DIST=/app/frontend/dist
ENV JSON_API_URL=http://localhost:7575
ENV SEED_DEMO=1
ENV PORT=8080
EXPOSE 8080
CMD ["./start.sh"]
