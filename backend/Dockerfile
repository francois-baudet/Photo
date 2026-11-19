# Image de l'API. Le contexte de build est la racine du dépôt (pour inclure db/migrations).
FROM node:20-bookworm-slim

WORKDIR /app

# Dépendances d'abord, pour profiter du cache Docker
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY backend/src ./src
# Migrations SQL : le script les cherche dans /db/migrations depuis /app/src/db
COPY db/migrations /db/migrations

ENV NODE_ENV=production
# Le dossier de stockage doit appartenir à l'utilisateur node (uid 1000) : voir DEPLOIEMENT.md
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
