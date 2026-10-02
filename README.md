# Rutas Comerciales

Application mobile (PWA) de fiches clients et de tournées de visites commerciales. Interface en espagnol, pensée pour Android, utilisable hors ligne.

## Ce que fait l'appli

- **Hoy** : tournée du jour (prochaine visite, « Iniciar visita » ouvre Google Maps), commandes du jour, état du portefeuille.
- **Clientes** : recherche, filtres par état (🔴 en retard, 🟡 bientôt, 🟢 à jour, 🔵 jamais visité), fiche client avec « lleva X días sin visita », notes, historique, horaires d'ouverture.
- **Mapa** : tous les clients en couleur, « clientes cerca de mí » (10 km autour de toi).
- **Rutas** : création d'une tournée (départ/arrivée, horaire, sélection par zone ou « Rellenar mi día »), rendez-vous à heure fixe, ordre optimisé en respectant les horaires d'ouverture, recalcul en cours de journée, partage WhatsApp.
- **Pedidos** : saisie de commande depuis la fiche (catalogue importé depuis Excel), bouton « Enviar Excel » qui génère le fichier et ouvre le partage Android (WhatsApp, Gmail, Drive…).
- **Ajustes** : import clients Excel (avec correspondance des colonnes et placement sur la carte), import catalogue, export, copie de sauvegarde (fichier) et copie en ligne automatique (Supabase, activée par défaut), code PIN, horaires par défaut, données de test.

## Mettre en ligne (une fois)

L'appli est un site statique : aucun serveur à gérer. Il faut juste l'héberger en HTTPS.

**GitHub Pages (recommandé, gratuit)**
1. Créer un dépôt GitHub (par ex. `rutas-comerciales`) et y pousser ce dossier.
2. Settings → Pages → Source : **GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie l'appli à chaque modification de la branche `main` (et seulement de `main` : le travail sur une autre branche ne change pas l'appli en ligne).
3. L'appli est disponible sur `https://<ton-compte>.github.io/rutas-comerciales/`.

**Netlify Drop (alternative)** : glisser le dossier sur https://app.netlify.com/drop.

## Installer sur le téléphone

1. Ouvrir l'adresse dans Chrome (Android).
2. Menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
3. L'icône « Rutas » apparaît comme une appli normale ; elle s'ouvre sans connexion.

## Données

- Tout est stocké sur le téléphone (IndexedDB), et l'appli fonctionne sans réseau.
- **Copie en ligne (activée par défaut)** : l'appli est préconfigurée avec un projet Supabase. À la première ouverture, on se connecte avec un e-mail et un mot de passe ; ensuite **toutes les fiches, visites, commandes et tournées sont copiées sur ce projet Supabase** dès qu'il y a du réseau, et reviennent sur un nouveau téléphone après connexion. Les inscriptions libres sont désactivées : les comptes se créent dans Supabase (Authentication → Users → Add user). Voir `supabase/GUIDE.md`.
- **Sans copie en ligne** : bouton « Usar sin copia en línea » sur l'écran de connexion. Les données restent alors uniquement sur le téléphone.
- Autres envois sur Internet : les adresses envoyées au géocodeur (OpenStreetMap/Photon) et les coordonnées envoyées au calcul d'itinéraire (OSRM).
- **Sauvegarde fichier** : Ajustes → « Guardar copia » (fichier JSON à envoyer sur Drive/mail). Sans copie en ligne, l'appli rappelle quand la dernière copie date de plus de 7 jours. Le fichier ne contient ni le PIN ni l'identité du compte.

## Fichiers Excel

- **Clients** : une ligne par client, première ligne = titres des colonnes (nom, adresse, CP, localité, téléphone, contact, taille, fréquence, dernière visite, notes, code client). L'appli propose la correspondance automatiquement.
- **Catalogue** : référence/ISBN, titre, auteur, éditeur, prix.
- **Export commandes** : feuille « Líneas » (une ligne par article : date, client, code client, adresse, référence, titre, quantité, prix, montant) et feuille « Resumen » (une ligne par commande).

## Développement

Pas de build : ouvrir `index.html` via un petit serveur local (`python3 -m http.server`). Les librairies (Leaflet, Dexie, SheetJS, supabase-js) sont dans `vendor/`. Pour publier une nouvelle version, changer `VERSION` dans `sw.js`.
