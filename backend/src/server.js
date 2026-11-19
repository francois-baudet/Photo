const express = require('express');
const config = require('./config');
const apiRouter = require('./routes');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRouter);

app.use((req, res) => res.status(404).json({ error: 'introuvable' }));

// Gestion centralisée des erreurs (Express 5 transmet les erreurs des fonctions async)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'erreur_serveur' });
});

app.listen(config.port, () => {
  console.log(`API du club photo en écoute sur le port ${config.port}`);
});
