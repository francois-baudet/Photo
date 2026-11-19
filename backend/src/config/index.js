// Configuration lue depuis l'environnement (fichier .env en local)
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  storageDir: process.env.STORAGE_DIR || '../storage',
};
