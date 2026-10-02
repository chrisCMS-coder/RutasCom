# Rutas Comerciales

Application mobile (PWA) de fiches clients et de tournées de visites commerciales. Interface en espagnol, pensée pour Android, utilisable hors ligne.

## Ce que fait l'appli

- **Hoy** : tournée du jour (prochaine visite, « Iniciar visita » ouvre Google Maps), tâches du jour, alerte « sans commande depuis 6 mois », commandes du jour, ventes de l'année vs l'an dernier à période égale, état du portefeuille.
- **Clientes** : recherche, filtres par état (🔴 en retard, 🟡 bientôt, 🟢 à jour, 🔵 jamais visité), prospects, inactifs, « sin pedidos », zone (comarca automatique d'après le code postal, ou zones perso), chaîne. Fiche client : horaires du jour, téléphone / WhatsApp, tâches, notes, ventes (graphique 12 mois), historique des visites et de toutes les commandes.
- **Mapa** : tous les clients en couleur (prospects en losange, inactifs en anneau), filtre par zone, couleur par zone, « clientes cerca de mí ».
- **Rutas** : création d'une tournée (départ/arrivée, horaire, zone, « Rellenar mi día »), rendez-vous à heure fixe, ordre optimisé selon les horaires d'ouverture, **10 min jusqu'à la voiture** entre deux visites, **pause déjeuner** (journée continue si possible, ou 1 h au meilleur moment entre 13 h et 16 h), recalcul automatique des heures quand on valide une visite, message « Avisar » (WhatsApp/SMS pré-rempli, ES/CA) et « Avisar a todos ».
- **Pedidos** : saisie depuis la fiche, « Validar pedido », lecture puis « Modificar », export Excel de la sélection ou d'une commande (partage WhatsApp, Gmail, Drive…).
- **Tareas** : à faire avec date optionnelle et client, dictée, depuis la fiche ou la fenêtre « Registrar visita ».
- **Ventas** : import des colonnes mensuelles de l'Excel, totaux annuels, comparaison à période égale, graphique, par chaîne, par zone ; taille (petit/moyen/grand) et inactifs recalculés une fois par an.
- **Ajustes** : thème (auto/clair/sombre), import clients (une fois, au départ) et catalogue, directement dans l'écran, export, copie de sauvegarde et copie en ligne (Supabase), PIN, horaires par défaut, tournées, alertes, seuils de taille, textes des messages, zones, données de test.

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

- **Clients** : une ligne par client, première ligne = titres des colonnes (code client, nom, adresse, CP, localité, téléphone, portable, contact, CodAgrup, fréquence, dernière visite, notes). L'appli propose la correspondance automatiquement. Les **colonnes de mois** (« 01/2025 », « ene 2025 », « 2025-01 »…) sont reconnues seules comme ventes mensuelles. Un réimport **complète** : il ajoute les nouveaux mois, corrige les mois déjà connus et remplit les champs vides, sans toucher à ce qui a été saisi dans l'appli.
- **Catalogue** : référence/ISBN, titre, auteur, éditeur, prix.
- **Export commandes** : feuille « Líneas » (une ligne par article : date, client, code client, adresse, référence, titre, quantité, prix, montant) et feuille « Resumen » (une ligne par commande).

## Développement

Pas de build : ouvrir `index.html` via un petit serveur local (`python3 -m http.server`). Les librairies (Leaflet, Dexie, SheetJS, supabase-js) sont dans `vendor/`. Pour publier une nouvelle version, changer `VERSION` dans `sw.js`.
