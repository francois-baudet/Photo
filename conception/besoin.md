# Besoin : site de galerie photo pour un club de photographes

> Document de cadrage, basé sur `texte.txt` et les réponses du porteur du projet. Les points marqués **À CONFIRMER** attendent encore une réponse.

Written for : le porteur du projet, pour valider le périmètre avant de passer au développement.

## 1. Contexte

- Un club de photographes souhaite un site internet pour **déposer** et **visualiser** leurs photos.
- Les photos sont présentées sous forme de **galerie**.
- Le site inclut un **système de concours interne**.
- Environ **20 membres**, tous admis **sur invitation**.
- Site **responsive** (téléphone et ordinateur), interface **en français uniquement**.

## 2. Compétences et infrastructure du porteur

- Technologies connues : JavaScript, HTML, CSS, Node.js, Express, PostgreSQL.
- Serveur disponible avec **nginx** en **reverse proxy**.
- Stockage des fichiers **en local sur le serveur**, avec possibilité future de les déplacer vers un **NAS** ou un autre emplacement.

## 3. Utilisateurs, rôles et droits

- Connexion classique par **identifiant et mot de passe**.
- Accès uniquement sur **invitation**.
- Rôles de départ : **admin**, **membre**, **jury**, **visiteur**.
- Les rôles sont **modifiables par l'admin**. Le site se comporte donc **en fonction des rôles** : les droits d'un rôle sont configurables depuis le dashboard admin, et le code ne doit pas figer les rôles.

## 4. Galerie et visibilité

- Chaque membre **dépose ses photos** (format **RAW**).
- Les galeries ont **plusieurs niveaux de visibilité** (exemples donnés : public, membres, concours, …). Liste complète **À CONFIRMER**.
- Affichage **rapide** sur mobile et PC, grâce à des formats d'affichage optimisés (miniatures et aperçus).
- Une **landing page** publique présentant le club, avec sa publicité habituelle (voir section 9).

## 5. Concours interne

- Un concours est créé par l'admin. Les **membres invités** au concours y participent.
- Le **nombre de jurés** est défini à la création du concours.
- Chaque photo reçoit :
  - une **note de 0 à 20** de **chaque juré** ;
  - une **note de 0 à 20** de **chaque membre** invité.
- Au final, **deux classements** :
  1. classement par les **membres** ;
  2. classement par le **jury**.
- Calcul de chaque classement : **moyenne** des notes par défaut. Autres méthodes possibles plus tard.
- À la création du concours, l'admin choisit les options suivantes (**options** par concours) :
  - **Auto-notation** : un membre peut-il noter ses propres photos ? (oui / non)
  - **Visibilité des notes** : les notes sont-elles visibles pendant le concours ou seulement à la fin ? (pendant / à la fin)

## 6. Traitement des fichiers

- Stockage des fichiers **RAW** (originaux).
- Génération automatique de **miniatures** et d'**aperçus** à l'import, pour l'affichage rapide.
- Tailles retenues : **300 px** pour la liste (miniatures), **1200 px** pour l'affichage (aperçus).

## 7. Métadonnées

- Lecture des métadonnées des formats **Nikon, Canon, Sony, Fujifilm**, ainsi que des fichiers issus des logiciels **Adobe** et **DxO**.
- Toutes les métadonnées sont **gérées** : le porteur veut pouvoir tout afficher.
- Ce qui est **affiché** est **paramétrable** depuis le dashboard admin.

## 8. Dashboard admin

- Point central pour **tous les réglages** du site : rôles, droits, visibilité des galeries, métadonnées affichées, stockage, concours.
- Doit être **facile à utiliser**.

## 9. Landing page et billets

- Page publique présentant le club, avec sa **publicité habituelle**.
- Le contenu est organisé sous forme de **billets**.
- Le contenu doit être **administrable facilement**, depuis le dashboard admin.
- Le porteur fournira plus tard les **textes** et les **logos**. Ils serviront à définir la **charte graphique**.

## 10. Base de données

- **PostgreSQL** : utilisateurs, rôles, galeries, photos (références et métadonnées), concours, notes, billets.
- Les fichiers binaires (RAW, aperçus, miniatures) restent sur disque. La base ne stocke que leurs chemins et métadonnées.

## 11. Stack technique (provisoire)

| Couche | Choix proposé |
|---|---|
| Backend | Node.js + Express |
| Base de données | PostgreSQL |
| Frontend | HTML / CSS / JavaScript (responsive) |
| Serveur | nginx en reverse proxy (existant) |
| Stockage | Disque local, avec chemin configurable (NAS possible plus tard) |

## 12. Hors périmètre (provisoire)

- Pas de paiement ni de boutique.
- Pas d'application mobile native.
- Pas d'interface en langue autre que le français.

## 13. Questions ouvertes

- Liste complète des niveaux de visibilité des galeries.
- Méthode de calcul des classements : moyenne retenue par défaut, à réviser plus tard si besoin.
- Contenu de la landing page (textes, visuels, publicité) : à fournir plus tard.
