# Rutas Comerciales

Application mobile (PWA) de fiches clients et de tournées de visites commerciales. Interface en espagnol, pensée pour Android, utilisable hors ligne.

## Ce que fait l'appli

- **Hoy** : tournée du jour (prochaine visite, « Iniciar visita » ouvre Google Maps), commandes du jour, état du portefeuille.
- **Clientes** : recherche, filtres par état (🔴 en retard, 🟡 bientôt, 🟢 à jour, 🔵 jamais visité), fiche client avec « lleva X días sin visita », notes, historique, horaires d'ouverture.
- **Mapa** : tous les clients en couleur, « clientes cerca de mí » (10 km autour de toi).
- **Rutas** : création d'une tournée (départ/arrivée, horaire, sélection par zone ou « Rellenar mi día »), rendez-vous à heure fixe, ordre optimisé en respectant les horaires d'ouverture, recalcul en cours de journée, partage WhatsApp.
- **Pedidos** : saisie de commande depuis la fiche (catalogue importé depuis Excel), bouton « Enviar Excel » qui génère le fichier et ouvre le partage Android (WhatsApp, Gmail, Drive…).
- **Ajustes** : import clients Excel (avec correspondance des colonnes et placement sur la carte), import catalogue, export, copie de sauvegarde (fichier) et copie en ligne automatique (Supabase, optionnel), horaires par défaut, données de test.

## Mettre en ligne (une fois)

L'appli est un site statique : aucun serveur à gérer. Il faut juste l'héberger en HTTPS.

**GitHub Pages (recommandé, gratuit)**
1. Créer un dépôt GitHub (par ex. `rutas-comerciales`) et y pousser ce dossier.
2. Settings → Pages → Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. L'appli est disponible sur `https://<ton-compte>.github.io/rutas-comerciales/`.

**Netlify Drop (alternative)** : glisser le dossier sur https://app.netlify.com/drop.

## Installer sur le téléphone

1. Ouvrir l'adresse dans Chrome (Android).
2. Menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
3. L'icône « Rutas » apparaît comme une appli normale ; elle s'ouvre sans connexion.

## Données

- Tout est stocké sur le téléphone (IndexedDB). Rien ne part sur un serveur, sauf : les adresses envoyées au géocodeur (OpenStreetMap/Photon) et les coordonnées envoyées au calcul d'itinéraire (OSRM).
- **Sauvegarde** : Ajustes → « Guardar copia » (fichier JSON à envoyer sur Drive/mail). L'appli rappelle quand la dernière copie date de plus de 7 jours.
- **Copie en ligne automatique** : Ajustes → « Copia en línea » → coller l'URL et la clé publique d'un projet Supabase (gratuit), créer un compte e-mail/mot de passe. La table se crée avec le SQL affiché dans ce même écran. Ensuite chaque changement est copié automatiquement.

## Fichiers Excel

- **Clients** : une ligne par client, première ligne = titres des colonnes (nom, adresse, CP, localité, téléphone, contact, taille, fréquence, dernière visite, notes, code client). L'appli propose la correspondance automatiquement.
- **Catalogue** : référence/ISBN, titre, auteur, éditeur, prix.
- **Export commandes** : feuille « Líneas » (une ligne par article : date, client, code client, adresse, référence, titre, quantité, prix, montant) et feuille « Resumen » (une ligne par commande).

## Développement

Pas de build : ouvrir `index.html` via un petit serveur local (`python3 -m http.server`). Les librairies (Leaflet, Dexie, SheetJS, supabase-js) sont dans `vendor/`. Pour publier une nouvelle version, changer `VERSION` dans `sw.js`.
