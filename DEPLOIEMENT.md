# Déploiement avec Docker

Written for : le porteur du projet, qui déploie et met à jour le club photo sur son serveur Proxmox.

## Architecture

```
Réseau local ─► conteneur web (nginx, port 80) ─┬─► /      → fichiers statiques du front (frontend/)
                                                 └─► /api/  → conteneur api (Node.js, port 3000)
                                                              │
                                                              ▼ réseau Docker interne
                                                        conteneur db (PostgreSQL 16)
                                                        volume db_data

                                          conteneur api ─► STORAGE_HOST_DIR (hôte, ou NAS)
```

- La base n'est accessible que depuis le réseau Docker. Aucun port publié.
- L'API n'écoute que sur `127.0.0.1:3000` (seul l'hôte peut la joindre directement).
- Le conteneur `web` est la seule porte d'entrée HTTP (port 80).
- Les fichiers photo sont sur le disque de l'hôte (`STORAGE_HOST_DIR`), pas dans un conteneur.

---

## 1. Prérequis sur le serveur

- Debian 12 dans un conteneur LXC ou une VM Proxmox.
- Docker Engine et le plugin Compose : suivre la doc officielle <https://docs.docker.com/engine/install/debian/>.
- Une clé SSH autorisée sur GitHub (ou une *deploy key* sur le dépôt `francois-baudet/Photo`).

Vérifier :

```bash
docker --version
docker compose version
```

---

## 2. Récupérer le projet

```bash
sudo mkdir -p /opt/photo
sudo chown "$USER":"$USER" /opt/photo
git clone -b dev git@github.com:francois-baudet/Photo.git /opt/photo
cd /opt/photo
```

---

## 3. Configurer les secrets

```bash
cp .env.example .env
```

Générer les valeurs à coller dans `.env` :

```bash
openssl rand -hex 48     # → JWT_SECRET
openssl rand -hex 24     # → DB_PASSWORD (hexadécimal : pas de caractère à encoder)
```

Éditer `.env` :

```bash
nano .env
```

| Variable | Rôle |
|---|---|
| `DB_PASSWORD` | Mot de passe PostgreSQL |
| `JWT_SECRET` | Clé de signature des connexions |
| `STORAGE_HOST_DIR` | Dossier des photos sur l'hôte (`./storage` par défaut, ou `/mnt/nas/photo`) |

Vérifier que `.env` n'est pas suivi par git :

```bash
git status --short     # .env ne doit pas apparaître
```

---

## 4. Préparer le dossier de stockage

Le conteneur `api` tourne avec l'utilisateur `node` (uid 1000). Le dossier de stockage doit lui appartenir :

```bash
sudo chown -R 1000:1000 /opt/photo/storage
# Si STORAGE_HOST_DIR pointe vers le NAS, faire la même chose sur ce dossier :
# sudo chown -R 1000:1000 /mnt/nas/photo
```

---

## 5. Construire et démarrer

```bash
docker compose build
docker compose up -d db
docker compose ps                      # attendre que db soit "healthy"
```

Appliquer les migrations (une seule fois, puis à chaque mise à jour du schéma) :

```bash
docker compose run --rm api node src/db/migrate.js
```

Démarrer l'API :

```bash
docker compose up -d
docker compose ps
```

Vérifier que l'API répond :

```bash
curl -s http://127.0.0.1:3000/health            # {"status":"ok"}
curl -s http://127.0.0.1:3000/api/galleries      # {"galleries":[]} ou la liste visible
```

---

## 6. Créer le premier administrateur

Il n'existe pas encore d'interface d'inscription : le premier compte admin se crée en base. Le mot de passe est haché avec bcrypt. Pour le générer, utilise l'API Node du conteneur :

```bash
docker compose run --rm api node -e "console.log(require('bcryptjs').hashSync('MOT_DE_PASSE', 10))"
```

Puis insérer l'utilisateur (remplacer `HASH` par la sortie précédente, entre guillemets simples) :

```bash
docker compose exec db psql -U photo -d photo -c "
INSERT INTO users (username, display_name, password_hash, role_id)
VALUES ('admin', 'Administrateur', 'HASH', (SELECT id FROM roles WHERE name = 'admin'));"
```

Tester la connexion :

```bash
curl -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"MOT_DE_PASSE"}'
```

---

## 7. Front et proxy (service `web`)

nginx tourne dans un conteneur (`web`) défini dans `docker-compose.yml`. Il sert le dossier `frontend/` et redirige `/api/` vers le conteneur `api`. La configuration est dans `deploy/nginx/default.conf`.

Le port 80 est publié sur le réseau local. Aucun nginx n'est à installer sur l'hôte.

Vérifier après démarrage :

```bash
docker compose up -d web
curl -sI http://127.0.0.1/ | head -1          # HTTP/1.1 200 OK
curl -s http://127.0.0.1/api/galleries        # {"galleries":[]}
```

Pour le HTTPS, il faudra un certificat et un second bloc `listen 443 ssl` dans `deploy/nginx/default.conf`. Ce n'est pas encore fait.

---

## 8. Mettre à jour

```bash
cd /opt/photo
git pull
docker compose build api
docker compose run --rm api node src/db/migrate.js   # ne fait rien si aucune nouvelle migration
docker compose up -d
docker compose ps
```

---

## 9. Commandes utiles

| Action | Commande |
|---|---|
| État des conteneurs | `docker compose ps` |
| Logs de l'API (suivi) | `docker compose logs -f api` |
| Logs de la base | `docker compose logs -f db` |
| Redémarrer l'API | `docker compose restart api` |
| Arrêter tout (données conservées) | `docker compose down` |
| Shell dans l'API | `docker compose exec api sh` |
| Console PostgreSQL | `docker compose exec db psql -U photo -d photo` |
| Espace disque des volumes | `docker system df -v` |

Ne pas utiliser `docker compose down -v` : l'option `-v` supprime le volume de la base.

---

## 10. Sauvegardes

### Base de données

Sauvegarde au format compressé :

```bash
mkdir -p /opt/photo/backups
docker compose exec -T db pg_dump -U photo -Fc photo > /opt/photo/backups/photo_$(date +%F).dump
```

Restauration (base vide ou à écraser ; `--clean` supprime les objets avant de les recréer) :

```bash
docker compose exec -T db pg_restore -U photo -d photo --clean --if-exists < /opt/photo/backups/photo_AAAA-MM-JJ.dump
```

Sauvegarde automatique quotidienne à 3 h (`crontab -e`) :

```cron
0 3 * * * cd /opt/photo && docker compose exec -T db pg_dump -U photo -Fc photo > /opt/photo/backups/photo_$(date +\%F).dump
```

Dans une crontab, le `%` doit être échappé en `\%`.

### Fichiers photo

Le dossier `STORAGE_HOST_DIR` n'est pas dans la base. Le sauvegarder séparément (rsync vers le NAS, par exemple) :

```bash
rsync -a /opt/photo/storage/ /mnt/sauvegardes/photo-storage/
```

### Conteneur entier

Proxmox : sauvegarde `vzdump` du conteneur LXC (ou snapshot de la VM). Elle couvre le système, Docker, le code et les volumes Docker. Elle ne couvre pas un NAS monté via un point de montage.

---

## 11. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `DB_PASSWORD manquant dans .env` | `.env` absent ou variable vide | Vérifier `.env` à la racine |
| `api` redémarre en boucle | Mauvais `DATABASE_URL` ou base pas prête | `docker compose logs api` ; vérifier que `db` est `healthy` |
| `password authentication failed` | `DB_PASSWORD` changé après le premier démarrage | Le mot de passe est enregistré dans le volume : le modifier en base avec `ALTER ROLE photo PASSWORD '...'`, puis mettre `.env` à jour |
| Erreur `EACCES` à l'import d'une photo | Dossier de stockage non accessible à uid 1000 | Relancer `sudo chown -R 1000:1000` sur `STORAGE_HOST_DIR` |
| `502 Bad Gateway` dans nginx | L'API ne tourne pas | `docker compose ps` puis `docker compose logs api` |
| Migration échoue | Schéma déjà partiellement modifié | Consulter les logs ; la transaction annule la migration en erreur |

---

## Notes

- Le premier démarrage ne crée aucun utilisateur : voir la section 6.
- Les routes concours, billets, admin et dépôt de photos renvoient encore `501` (non implémentées).
- Le front (`frontend/`) est une maquette statique : il n'est pas encore branché sur l'API.
