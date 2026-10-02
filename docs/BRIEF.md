# Brief — prochaines évolutions de Rutas Comerciales

*Rédigé le 1er octobre 2026. Rien n'est encore codé : ce document fixe ce qui a été décidé avant de commencer.*

## Ordre de réalisation
0. **Mode sombre** : à faire en premier, pour que tous les écrans suivants soient construits directement avec le thème.
1. **Commandes et terrain** : commandes, historique et alerte 6 mois, horaires, WhatsApp, message pré-visite, organisation de la tournée.
2. **Tâches.**
3. **Ventes** : données de ventes (dès réception des en-têtes de l'Excel).
4. **Zones et graphique.**

Les sections marquées *Remarques de mise en œuvre* sont mes notes techniques : elles ne changent pas ce qui est demandé, elles signalent ce qu'il faut prévoir.

---

## 0 — Mode sombre

**Objectif :** lisibilité au volant le soir et dans un parking, sans éblouir.

**Comportement :**
- Trois réglages : **auto** (suit le système Android), **clair**, **sombre**. Défaut : auto.
- Le mode sombre n'est pas un simple inversé : fond gris très foncé (pas noir pur), texte cassé, et les trois couleurs de statut 🟢🟡🔴 restent reconnaissables et contrastées sur fond sombre. Tester au soleil et de nuit.
- La carte suit le thème : tuiles sombres (CartoDB Dark Matter, gratuit) en mode sombre, tuiles claires sinon.
- Gros boutons et contraste élevé dans les deux modes : c'est l'occasion de fixer les tailles de police une fois pour toutes.

**Technique :** variables CSS pour toutes les couleurs dès le premier écran, `prefers-color-scheme` + attribut `data-theme` forcé. Si on ajoute le thème après coup, on repasse sur tous les écrans : donc à faire au tout début.

**Hors périmètre :** thème personnalisé, bascule horaire manuelle.

**Fini quand :** je bascule le système en sombre, l'app et la carte suivent sans rechargement, et je lis un arrêt à 1 m de distance la nuit.

*Remarques de mise en œuvre :*
- Bon point de départ : `styles.css` définit déjà ses couleurs en variables sur `:root`. Il reste une dizaine de couleurs écrites en dur dans `styles.css` et quelques-unes directement dans le code des écrans (par exemple le fond de la carte « Próximo a vencer » dans la fiche) : à convertir.
- Il faut aussi des variantes sombres pour les couleurs de statut (vert, ambre, rouge, bleu) et les fonds « soft ».
- La barre d'état Android (`<meta name="theme-color">`) doit suivre le thème.
- Les tuiles CartoDB demandent la mention « © OpenStreetMap © CARTO » sur la carte. Le changement de tuiles se fait à chaud, en écoutant le changement de thème du système.

---

## 1 — Commandes, horaires, WhatsApp, message pré-visite, tournée

### 1.1 Commandes : enregistrer, pas envoyer
**Aujourd'hui :** l'appli suit l'envoi (« Pendiente / Enviado », onglet « Pendientes de enviar », « ¿Marcar como enviados? »), et toucher une commande l'ouvre directement en modification.

**Décidé :**
- Supprimer toute la notion d'envoi, partout : liste Pedidos, fiche client, écran Hoy.
- « Guardar pedido » devient **« Validar pedido »**. Une commande validée est terminée.
- Onglets de Pedidos : **Hoy / Esta semana / Todos**, plus une recherche par client.
- Une commande validée s'ouvre **en lecture seule** (client, date, lignes, quantités, total, note).
  - Bouton **« Modificar »** → mode édition → « Guardar cambios » ou « Cancelar ».
  - « Eliminar » seulement en mode édition.
  - Quitter sans enregistrer → « ¿Descartar cambios? ».
- **Modification possible à tout moment.** Une commande modifiée après validation affiche « Modificado el … ».
- **Export Excel conservé**, pour l'envoyer par WhatsApp ou mail via le partage du téléphone :
  - dans Pedidos, le bouton exporte les commandes de l'onglet affiché ;
  - dans le détail d'une commande, « Compartir este pedido ».
  - L'export ne marque plus rien.

### 1.2 Historique des commandes et alerte « 6 mois sans commande »
**Historique dans la fiche client**
- Aujourd'hui la fiche montre les 5 dernières commandes. On garde **tout l'historique** : les dernières en clair, puis « Ver todos (N) ».
- En haut de la fiche : « Último pedido hace X días / meses ».

**Alerte**
- Décidé : l'alerte se base **sur les commandes enregistrées dans l'appli**, pas sur l'Excel.
- Un client sans aucune commande depuis **6 mois** déclenche l'alerte « Sin pedidos desde hace 6 meses ».
- Elle apparaît sur l'écran Hoy (« X clientes sin pedidos desde hace 6 meses »), sur la fiche, et dans un filtre de Clientes.
- Pas d'alerte pour les **prospects** ni pour les **inactifs** (déjà affichés à part, voir 3.2).

*Remarques de mise en œuvre :*
- Un client qui n'a encore aucune commande dans l'appli : le compteur part de la **date où il a été ajouté dans l'appli**. Sinon tous les clients seraient en alerte dès le premier jour.
- Une commande passée par un autre canal (téléphone direct à l'éditeur, mail…) n'est pas dans l'appli : le client finira en alerte. Il suffit de l'enregistrer aussi dans l'appli.
- *Proposé :* délai réglable dans Ajustes (6 mois par défaut).

### 1.3 Horaires d'ouverture complets
**Aujourd'hui :** une seule ouverture/fermeture par client, pause de midi forcément celle d'Ajustes (13:30–17:00), quelques interrupteurs (lundi matin fermé, lundi fermé, samedi fermé). Le calcul des tournées sait déjà gérer une pause propre au client.

**Décidé** (modèle courant de Google Business, des applis de rendez-vous et des boutiques en ligne) : trois modes au choix dans la fiche.
1. **Horario habitual** : celui d'Ajustes (comportement actuel).
2. **Igual todos los días** : une plage Mañana + une plage Tarde, et on décoche les jours fermés.
3. **Por día** : 7 lignes du lundi au dimanche ; chacune avec Abierto/Cerrado, plage Mañana, plage Tarde optionnelle ; bouton **« Copiar a todos »**.

- Une plage Tarde vide = horaire continu ce jour-là.
- Les réglages actuels (lunesCerrado, lunesTodoCerrado, cierraSabado, cierraMediodia, abre/cierra) sont **convertis automatiquement** vers le nouveau modèle.
- Le calcul des tournées (`ROUTE.ventanas`) utilise le nouveau modèle.
- La fiche affiche **toujours** les horaires réels du jour (ex. « 9:30–14:00 · 16:30–20:00 »).

### 1.4 WhatsApp depuis la fiche client
- Toucher le téléphone → choix **Llamar** ou **WhatsApp**.
- WhatsApp ouvre directement la conversation (`wa.me`), indicatif **+34 ajouté automatiquement**, espaces et tirets retirés.
- Même règle de numéro que le message pré-visite (1.5) : WhatsApp seulement si le client a un portable.

### 1.5 Message pré-visite
**Objectif :** prévenir le client la veille ou le matin, en un tap, pour réduire les portes closes et les décideurs absents.

**Déclencheur :** depuis la tournée du jour ou du lendemain, un bouton **« Avisar »** sur chaque arrêt, et un bouton global **« Avisar a todos »** en haut de la tournée.

**Comportement :**
- Ouvre WhatsApp (`https://wa.me/<numéro>?text=...`) avec le message pré-rempli. Si pas de numéro WhatsApp : SMS. Si pas de numéro du tout : bouton grisé avec « sin teléfono ».
- Le message est généré à partir d'un modèle avec variables : `{nombre_contacto}`, `{hora}`, `{dia}` (hoy / mañana / jueves 9). Exemple : « Hola Marta, mañana paso por la librería sobre las 11h. ¿Te va bien? »
- Deux ou trois modèles au choix dans les réglages, modifiables : **standard**, **avec créneau approximatif** (« entre las 10h y las 12h »), **relance** (« ¿sigue bien para hoy? »). Langue par client : **ES ou CA**.
- L'envoi réel se fait dans WhatsApp ; l'app ne sait pas s'il est parti. On note **« avisado »** sur l'arrêt dès que le bouton a été pressé, avec possibilité d'annuler.

**Données :** numéro de téléphone et langue sur la fiche client (deux champs à ajouter), modèles de messages dans les réglages, flag `avisado` + horodatage sur l'arrêt de tournée.

**Hors périmètre :** pas d'envoi automatique, pas de lecture des réponses, pas d'API WhatsApp Business.

**Fini quand :** depuis une tournée de 8 arrêts, je préviens les 8 en moins d'une minute, sans taper un mot, et je vois qui a été prévenu.

*Remarques de mise en œuvre :*
- **Numéros :** la fiche a déjà un champ « Teléfono », souvent le fixe de la librairie, qui ne reçoit ni WhatsApp ni SMS. *Proposé :* le champ à ajouter est un **« Móvil »** distinct, avec un interrupteur « Tiene WhatsApp » (oui par défaut). Avec WhatsApp → WhatsApp ; portable sans WhatsApp → SMS (`sms:` avec le texte pré-rempli) ; pas de portable → « sin móvil » grisé. Le deuxième champ est la langue (ES / CA).
- **« Avisar a todos » :** le téléphone ne permet pas d'ouvrir 8 conversations WhatsApp d'un coup, chaque ouverture fait quitter l'appli. Déroulé proposé : le bouton ouvre le premier client ; au retour dans l'appli, un bandeau « Siguiente : Marta · Avisar » propose le suivant en un tap. Pour 8 arrêts, cela fait 8 × (Avisar → Enviar dans WhatsApp → retour), ce qui tient en moins d'une minute.
- **Variables :** `{hora}` vient de l'heure prévue de l'arrêt dans la tournée calculée ; le créneau approximatif l'encadre (par exemple ±1 h, arrondi à l'heure). `{dia}` est écrit dans la langue du client (« jueves 9 » / « dijous 9 »). Chaque modèle existe donc en ES et en CA. Si le contact n'a pas de prénom, le message commence par « Hola, ».
- **Recalcul de tournée :** si l'heure d'un arrêt déjà « avisado » bouge de plus de 30 min, l'arrêt l'indique (« hora cambiada desde el aviso ») et propose le modèle relance.

### 1.6 Organisation de la tournée

**a) Temps de trajet jusqu'à la voiture**
- Ajouter **10 min** à chaque trajet entre deux rendez-vous (sortir, rejoindre la voiture, se garer à l'arrivée).
- Réglable dans Ajustes (« Tiempo hasta el coche », 10 min par défaut) et modifiable pour une tournée donnée (en centre-ville piéton on peut mettre 0).
- *Proposé :* pas appliqué au départ de la maison ni au retour final (on part de la voiture et on y arrive).
- *Remarque :* l'estimation sans réseau ajoute déjà 3 min par trajet ; ces 3 min sont remplacées par ce réglage pour ne pas compter deux fois.

**b) Recalcul automatique quand on valide un rendez-vous**
- Quand on enregistre une visite (« Registrar », ou une commande depuis la tournée), les horaires des visites restantes sont **recalculés à partir de l'heure de validation**.
- Recalcul **dans le même ordre** (seules les heures bougent), pour ne pas changer la tournée sous les yeux du commercial. Réorganiser complètement reste le bouton « Recalcular ».
- Si le retard fait sortir une visite de l'horaire, ou met en danger un rendez-vous à heure fixe, un message le dit tout de suite (« Vas con 25 min de retraso: la cita de las 12:00 está en riesgo »), avec le bouton « Reorganizar ».
- Lien avec le message pré-visite (1.5) : un arrêt déjà « avisado » dont l'heure bouge de plus de 30 min le signale, comme prévu.
- *Remarque :* la base existe déjà depuis les corrections du 2 octobre (le recalcul repart de l'heure réelle de la dernière visite) ; il manque seulement le déclenchement automatique.

**c) Journée en deux tranches (pause déjeuner)**
- Option **« Pausa »** dans la tournée, avec une valeur par défaut dans Ajustes : par exemple 13:30–15:00.
- Pendant la pause : aucune visite et aucun trajet ne sont planifiés ; la tournée reprend à la fin de la pause depuis l'endroit où l'on se trouve.
- La pause apparaît dans la frise de la tournée (« Comida · 13:30–15:00 ») et dans le texte partagé.
- *Remarques :*
  - beaucoup de librairies ferment déjà à midi : la pause tombe souvent dans un créneau où il n'y a rien à faire, ce qui est le cas idéal ;
  - techniquement, la pause se traite comme un rendez-vous fixe « sans adresse » (pas de trajet pour y aller), ce que le planificateur sait déjà gérer pour les rendez-vous à heure fixe.

---

## 2 — Tâches

**Objectif :** noter un truc à faire sans l'oublier, sans quitter l'écran « Hoy ».

**Accès :** un bouton **« Tareas »** sur la page d'accueil, avec un badge du nombre de tâches en attente. C'est tout.

**Comportement :**
- Une tâche = un texte, une date optionnelle, un client optionnel. Saisie clavier ou dictée.
- Création depuis la liste ou depuis une fiche client (« rappeler Jordi » rattaché à Jordi).
- La liste : en retard en haut, puis aujourd'hui, puis sans date, puis futur. Une case à cocher : c'est fait, elle disparaît (archivée, pas supprimée).
- Les tâches du jour et en retard apparaissent aussi en haut de l'écran « Hoy », trois maximum, avec un lien vers la liste complète.
- Sur la fiche client, les tâches ouvertes le concernant s'affichent avant les notes.

**Données :** `id, texte, date, clientId, créée_le, faite_le`.

**Hors périmètre :** sous-tâches, priorités, récurrence, notifications push. Si une tâche doit vraiment sonner, elle va dans le calendrier du téléphone.

**Fini quand :** en sortant d'une visite je dicte « enviar presupuesto a Vic », elle est rattachée au client, elle me ressort demain matin sur l'accueil, et je la coche en un tap.

*Remarques de mise en œuvre :*
- **Date par défaut :** une tâche sans date tombe dans « sans date » et ne remonte pas sur l'accueil. Pour que « elle me ressort demain matin » marche sans rien taper, *proposé :* trois boutons Hoy / **Mañana** / Sin fecha, avec **Mañana présélectionné** quand la tâche est créée depuis une fiche ou après une visite.
- **Rattachement au client :** il se fait par le contexte (création depuis la fiche ou depuis la fenêtre « Registrar visita », où l'on ajoute un bouton « + Tarea »). L'appli ne devine pas le client à partir du texte dicté (« a Vic »).
- **Données :** nouvelle table locale `tareas`, avec des noms de champs alignés sur le reste du code (`id, texto, fecha, clienteId, createdAt, hechaAt`). La copie en ligne Supabase la prend automatiquement (aucun changement de table) ; il faut en revanche l'ajouter à la sauvegarde fichier, à la restauration et à l'effacement des données.

---

## 3 — Données de ventes (import Excel)

L'ERP n'est pas connectable : tout passe par l'import Excel, réimportable quand on veut. **Les en-têtes de colonnes seront fournis** avant de commencer ce lot.

### 3.1 Ventes mensuelles et annuelles
- L'Excel contient **une colonne par mois**, de **01/2025 à 07/2026** pour le premier fichier.
- L'appli calcule elle-même :
  - le **total annuel 2025** ;
  - le **total 2026** (année en cours, partielle) ;
  - le **détail par mois**.
- Comparaison honnête : **« 2026 (ene–jul) vs 2025 mismo periodo : +x % »**, jamais une année partielle contre une année complète.
- Un nouveau mois dans l'Excel est **détecté automatiquement** (pas de réglage).
- Les clients sont mis à jour par le **code client**, qui doit être présent dans le fichier.

**Réimport = compléter, pas tout refaire.**
- Un réimport **ajoute ce qui manque** (par exemple les ventes du mois dernier) et remplit les champs vides.
- Il **ne recrée pas** les clients et **n'écrase pas** ce qui a été saisi ou modifié dans l'appli (catégories, horaires, notes, coordonnées, cadena…).
- **Mois déjà connus :** si le fichier donne un chiffre différent pour un mois déjà importé (dévolution enregistrée en retard, correction comptable), **on prend le nouveau chiffre**.
- Il **ne reclasse pas** les clients (voir 3.3) : seule exception, un prospect qui a des ventes passe en client (voir 3.2).

### 3.2 Inactifs et Prospects : deux catégories distinctes
**Inactif (automatique, d'après les ventes)**

| Total des ventes sur l'année de référence | Statut |
|---|---|
| Négatif | Actif (une dévolution = relation commerciale) |
| 0 ou vide, colonnes présentes dans l'import | **Inactif** |
| Colonnes de ventes absentes de l'import | « Sans donnée » (aucun statut) |

- Les inactifs **sortent des alertes** (visites et 6 mois sans commande).
- Ils sont affichés **à part** : groupe et filtre « Inactivos », couleur distincte sur la carte.
- On peut toujours les ajouter à une tournée à la main.
- Recalculé **une fois par an**, avec la taille (voir 3.3).

**Prospect (manuel)**
- Catégorie **à part** : un interrupteur « Prospecto » dans la fiche client, posé à la main.
- Un inactif n'est pas un prospect : l'inactif est un client enregistré sans ventes, le prospect est quelqu'un qu'on démarche.
- **Aucune alerte** sur un prospect tant qu'il n'est pas devenu client.
- **Un prospect qui commence à acheter passe automatiquement en client** (dès que des ventes apparaissent à l'import).
- Filtre et groupe « Prospectos » dans Clientes, Mapa et Nueva ruta.

### 3.3 Taille calculée automatiquement
- **Petit ≤ 900 € / Moyen 900–2500 € / Grand > 2500 €.**
- Seuils **réglables dans Ajustes** (900 / 2500 par défaut).
- Un total négatif est classé « petit ».
- La taille saisie à la main ne sert plus que pour les clients sans donnée de ventes.
- **Recalcul une fois par an, début janvier**, en même temps que le statut inactif. Entre deux recalculs, les réimports complètent les ventes sans changer la taille ni le statut.

*Remarques de mise en œuvre :*
- **Base de calcul :** l'année civile qui vient de se terminer. Au premier import (maintenant), le calcul se fait donc sur **2025**.
- **Déclenchement :** les ventes de décembre n'arrivent qu'avec l'import de janvier. *Proposé :* le recalcul se fait au **premier import qui contient décembre de l'année écoulée**, avec un message « Clasificación 2026 actualizada : X clientes cambian de tamaño ».

### 3.4 Cadena
- On stocke le **code CodAgrup** lui-même ; la case **« Cadena »** se coche automatiquement s'il y a un code.
- `0`, `-` et les cellules vides ou blanches = pas de chaîne.
- Affichage « Cadena · *code* », filtre par chaîne, total des ventes d'une chaîne.
- Au réimport, la case n'est remplie que si elle est vide : une case modifiée à la main n'est **pas écrasée** (voir « Réimport = compléter » en 3.1).

---

## 4 — Zones et graphique

### 4.1 Zones géographiques (Catalogne uniquement)
- **Comarca remplie automatiquement d'après le code postal**, grâce à une table intégrée à l'appli (fonctionne hors ligne).
- **Zones personnalisées** dans Ajustes : on regroupe des comarcas ou des localités (ex. « Zona Norte » = Maresme + Vallès Oriental).
- **Filtre par zone** dans Clientes, Mapa et Nueva ruta ; option de couleur par zone sur la carte.
- Pas de regroupement automatique par GPS (zones instables et peu parlantes).

### 4.2 Graphique des ventes par mois
- Source : les colonnes mensuelles de l'Excel (pas les commandes de l'appli, dont les prix peuvent manquer et qui ne sont pas des ventes facturées).
- **Barres**, pas une courbe :
  - ligne zéro bien visible ;
  - mois négatifs (dévolutions) en barres vers le bas, d'une autre couleur ;
  - montant au toucher ;
  - en option, l'année précédente en gris clair.
- **Deux emplacements :**
  - fiche client : petit graphique des 12 derniers mois + totaux 2025 / 2026 ;
  - vue globale du portefeuille, filtrable par zone et par chaîne.
- Dessiné en SVG dans l'appli, sans librairie ajoutée : fonctionne hors ligne. Couleurs prises dans les variables du thème, pour suivre le mode sombre.

---

## Notes techniques
- **Supabase : aucun changement de table.** Les fiches (et la future table des tâches) sont copiées en JSON telles quelles ; les nouveaux champs suivent automatiquement.
- À chaque mise en ligne, changer `VERSION` dans `sw.js` pour que les téléphones prennent la nouvelle version.

## Points encore ouverts
1. **En-têtes de colonnes de l'Excel** (code client, ventes mensuelles, CodAgrup) : nécessaires pour la partie 3 (ventes).
2. **Numéros de téléphone :** un champ « Móvil » distinct du fixe, avec « Tiene WhatsApp » (proposé en 1.5) ?
3. **Inactif qui recommence à acheter en cours d'année :** il redevient actif tout de suite, comme un prospect (proposé), ou il attend le recalcul de janvier ?
4. **Recalcul annuel :** déclenché au premier import contenant décembre (proposé en 3.3) ?
5. **Alerte 6 mois :** délai réglable dans Ajustes (proposé) ?
6. **Tâches :** « Mañana » présélectionné quand la tâche est créée depuis une fiche ou après une visite (proposé) ?
7. **Temps jusqu'à la voiture :** pas compté au départ de la maison ni au retour final (proposé) ?
8. **Pause déjeuner :** horaire fixe (ex. 13:30–15:00, proposé) ou souple (« 1 h entre 13:00 et 15:00 », placée au meilleur moment par l'appli) ?
