# Code review — 1er octobre 2026

**Périmètre :** tout ce qui a été fait aujourd'hui, c'est-à-dire tout le dépôt (commits `31d3983` à `f753bc9`), hors librairies de `vendor/`.

**Méthode :**
- 3 relecteurs, chacun sur une zone : données, copie en ligne et sécurité / écrans, commandes et import Excel / tournées, géolocalisation et réglages.
- La plupart des constats ont été **reproduits** : dans Chromium sans écran (Playwright), avec un faux serveur Supabase pour la synchro, ou dans node pour la logique pure (calcul des tournées, import Excel avec la librairie SheetJS du dépôt).
- J'ai revérifié moi-même dans le code les constats critiques n° 1, 2, 3, 5 et 6 (le n° 6 en le réexécutant).

**Rien n'a été corrigé.** Ce document ne fait que rapporter.

**Bilan :** 51 constats, **45 après fusion des doublons** : 10 critiques, 16 moyens, 19 mineurs.

---

## À corriger en priorité

| # | Problème | Pourquoi c'est grave |
|---|---|---|
| 1 | Jours fermés traités comme ouverts | Le commercial est envoyé devant des boutiques fermées |
| 2 | Arrêts qui « ne rentrent pas » supprimés de la tournée | Des clients disparaissent de la tournée sans message |
| 3 | Revenir dans l'appli efface la commande en cours | Commande perdue après un appel ou un passage sur WhatsApp |
| 4 | La carte passe par-dessus le verrou PIN et les fenêtres | Fuite de données avec le verrou ; fenêtres et messages cachés sur la carte |
| 5 | Le géocodage en arrière-plan écrase les modifications | Visites et notes perdues, clients supprimés qui reviennent |
| 6 | Import Excel : mauvaise colonne prise pour le code client | Des clients différents fusionnés au réimport |
| 7 | Import Excel : jour et mois inversés | Dates de dernière visite fausses, alertes fausses |
| 11 | Après « Borrar todo » ou « PIN olvidado », la copie en ligne ne revient jamais | La copie en ligne ne sert plus à rien |

---

## Critiques

### 1. Jours fermés traités comme « ouvert toute la journée »
`js/route.js:20`
- **Ce qui se passe :** pour un jour fermé (dimanche, « sábado cerrado », « lunes cerrado todo el día »), le calcul des horaires renvoie une liste vide, mais le planificateur lit une liste vide comme « pas d'horaire = toujours ouvert ».
- **Exemple reproduit :** tournée du samedi 3 octobre avec un client « sábado cerrado » : il est placé à 08:33, sans alerte.
- **Piste :** distinguer « fermé » de « sans horaire » dans `proximaApertura`. À faire de toute façon avec le nouveau modèle d'horaires du brief (1.3).

### 2. Les arrêts « no caben » ou sans coordonnées sont retirés de la tournée, puis perdus
`js/app.js:160`
- **Ce qui se passe :** au recalcul, la tournée ne garde que les arrêts planifiés. Ceux qui ne rentrent pas dans l'horaire, ou sans position, sont seulement notés à part, et cette note est écrasée au recalcul suivant.
- **Exemple reproduit :** 8 clients avec une limite à 11:00 → 1 planifié, 7 « no caben ». On suit le conseil affiché (« amplía el límite »), limite à 20:00, on recalcule : les 7 clients ont disparu. Un « Recalcular » en fin de journée vide aussi la tournée, et Hoy affiche « Ruta completada ».
- **Piste :** garder tous les arrêts dans la tournée avec un marqueur « no cabe », et les replanifier à chaque recalcul.

### 3. Revenir dans l'appli redessine l'écran et efface la commande ou le formulaire en cours
`js/app.js:23`
- **Ce qui se passe :** à chaque retour au premier plan, l'écran est redessiné, sans la protection qui existe pour les formulaires en cours.
- **Exemple reproduit :** commande en cours de saisie, appel ou passage sur WhatsApp, retour en moins de 5 min : les lignes et la note sont vides. Même chose pour la fiche client en modification, la sélection de Nueva ruta et l'écran d'import (le sélecteur de fichier Android fait quitter la page).
- **Piste :** ne pas redessiner si un formulaire en cours est affiché, comme le fait déjà le rafraîchissement après une modification de données.

### 4. Les cartes passent par-dessus les fenêtres, les messages et le verrou PIN
`styles.css:240` (carte), `styles.css:294` (verrou)
- **Ce qui se passe :** la carte n'est pas isolée, ses couches s'empilent au-dessus de tout le reste.
- **Exemples reproduits, avec captures :**
  - Sur Mapa, la fenêtre « Añadir a ruta » est cachée sous la carte, et les messages (« Añadido a la ruta »…) sont invisibles.
  - Sur Hoy, la mini-carte cache le haut de « Registrar visita ».
  - Verrou PIN déclenché sur Mapa : la carte recouvre le pavé PIN, et un clic sur un marqueur ouvre la fiche du client. Le verrou ne protège plus rien.
  - Sous le verrou, l'appli reste lisible et utilisable avec TalkBack.
- **Piste :** isoler chaque carte (une ligne de CSS) et rendre l'appli inactive pendant le verrouillage.

### 5. Le géocodage en arrière-plan écrase les modifications et ne se synchronise pas
`js/app.js:185-194`
- **Ce qui se passe :** après un import, la recherche des adresses tourne environ 2 s par client, à partir d'une photo des fiches prise au départ, et réécrit chaque fiche entière.
- **Conséquences reproduites :**
  - une visite, une note, un changement d'adresse ou une position placée à la main pendant ce temps sont **écrasés** ;
  - un client supprimé pendant ce temps **réapparaît** ;
  - la date de modification n'est pas mise à jour, donc les positions trouvées **n'arrivent jamais sur les autres appareils**.
- **Piste :** relire la fiche juste avant d'écrire, ne modifier que la position, et mettre à jour la date de modification.

### 6. Import Excel : le « code client » vole la colonne du code postal ou de la localité
`js/xlsxio.js:21`
- **Ce qui se passe :** la correspondance automatique des colonnes cherche le code client en premier, avec des mots trop larges : « Código postal » commence par « código », et « Localidad » contient « id ».
- **Exemple reproduit :** colonnes [Nombre, Dirección, CP, Localidad] → « Localidad » devient le code client et la localité n'est pas importée. Au réimport, toutes les librairies d'une même ville ont le même « code » : une nouvelle librairie écrase une fiche existante, qui récupère au passage l'historique de visites et de commandes de l'autre.
- **Piste :** attribuer les colonnes globalement, en commençant par les meilleures correspondances, et chercher des mots entiers.

### 7. Import Excel : dates au format court lues avec jour et mois inversés
`js/xlsxio.js:8`
- **Ce qui se passe :** Excel enregistre les dates courtes espagnoles (jj/mm/aaaa) dans un format que la librairie relit en mois/jour.
- **Exemple reproduit :** 29/09/2026 devient « 2026-29-09 » (« Lleva -586 días sin visita »), 05/09/2026 devient le 9 mai. Une date invalide comme « 2026-29-09 » n'est ensuite plus jamais remplacée par une vraie visite : le client reste « Al día » pour toujours.
- **Piste :** lire les valeurs brutes de l'Excel (dates en vraies dates) au lieu du texte affiché ; rejeter un mois supérieur à 12.

### 8. Import du catalogue : ISBN lus en notation scientifique, le catalogue s'écrase
`js/xlsxio.js:107`
- **Ce qui se passe :** un ISBN saisi comme nombre est lu « 9.7884E+12 ». Comme la référence sert de clé, tous les livres qui commencent pareil s'écrasent.
- **Exemple reproduit :** 2000 livres en 9788… → il en reste quelques-uns, alors que le message affiche « 2000 artículos importados ». Même cause : un prix « 1,234.50 » devient 1,234 €.
- **Piste :** même correction que le n° 7 (valeurs brutes), et afficher le nombre réellement enregistré.

### 9. Copie en ligne : les modifications envoyées en retard ne redescendent jamais sur les autres appareils
`js/sync.js:86`
- **Ce qui se passe :** le serveur range les modifications par l'heure du téléphone qui les a faites, et chaque appareil ne demande que ce qui est plus récent que ce qu'il a déjà vu.
- **Exemple reproduit avec deux navigateurs :** le téléphone A modifie une note hors ligne à 10:00 ; la tablette B synchronise à 11:00 ; A revient en ligne et envoie sa modif datée de 10:00 ; B ne la reçoit jamais. Une horloge de téléphone en avance fait le même effet.
- **Piste :** dater les lignes côté serveur (une règle automatique dans Supabase).

### 10. Copie en ligne : une version plus ancienne écrase une plus récente sur le serveur
`js/sync.js:89`
- **Ce qui se passe :** l'envoi remplace toujours la ligne du serveur, même si celle-ci est plus récente. Le « dernier qui écrit gagne » annoncé n'est pas vérifié.
- **Exemple reproduit :** A (hors ligne) change le téléphone d'un client, B change sa note et synchronise, A revient : la note de B disparaît du serveur, et les deux appareils restent différents sans aucun avertissement. Même risque pour la date de dernière visite.
- **Piste :** n'accepter côté serveur qu'une version plus récente que celle déjà enregistrée.

> Les n° 9 et 10 ne concernent que l'usage sur **plusieurs appareils** (téléphone + tablette, ou nouveau téléphone pendant que l'ancien a encore des modifs non envoyées).

---

## Moyens

### Copie en ligne, connexion et verrou PIN
11. **Après « Borrar todo » ou « PIN olvidado », la copie en ligne ne revient jamais** (`js/db.js:102`). L'effacement garde le repère « déjà synchronisé jusqu'à… », donc l'appli ne retélécharge rien : 0 client en local alors que tout est sur le serveur. Se déconnecter et se reconnecter n'y change rien, et réimporter l'Excel crée des doublons. *Piste : remettre ce repère à zéro lors d'un effacement.*
12. **Se connecter avec un autre compte efface tout, y compris ce qui n'a pas encore été envoyé** (`js/sync.js:56`). Par exemple, une faute de frappe dans l'e-mail après expiration de la session, alors qu'on a travaillé hors ligne : visites et commandes perdues, sans confirmation. *Piste : refuser ou demander confirmation s'il reste des envois en attente, avec une copie fichier automatique.*
13. **Connexion obligatoire, sans création de compte ni mode sans compte** (`js/app.js:27`). Un nouveau téléphone en ligne sans compte ne peut pas entrer dans l'appli (la création de compte est dans Ajustes, inaccessible). Le README dit encore « rien ne part sur un serveur » et « copie en ligne optionnelle », ce qui n'est plus vrai.
14. **Après « Cerrar sesión », les données restent accessibles hors ligne** (`js/sync.js:46`). En mode avion, l'écran de connexion propose « seguir con los datos de este dispositivo » sans aucun identifiant : clients, commandes et notes visibles par la personne qui tient le téléphone.
15. **« PIN olvidado » efface les données locales mais reste connecté au compte** (`js/app.js:92`). Une personne qui a volé le téléphone efface, reste connectée au compte du commercial, et reçoit tout ce qu'il saisit sur ses autres appareils. *Piste : déconnecter le compte dans ce chemin.*
16. **« ¿Has olvidado el PIN? » ouvre une fenêtre invisible**, cachée sous le verrou (`js/app.js:89`, `styles.css:225`). Quelqu'un qui a oublié son PIN n'a aucune issue dans l'appli.
17. **Mise à jour de l'appli fragile** (`sw.js:15`). Si un fichier échoue à télécharger pendant la mise à jour (3G instable), la nouvelle version s'installe quand même incomplète et l'ancienne est supprimée : l'appli peut casser hors ligne le lendemain. Deux mises en ligne à moins de 10 min d'écart peuvent aussi laisser l'ancien code sous le nouveau numéro.

### Import Excel
18. **Le réimport écrase la taille, la fréquence et la dernière visite** (`js/xlsxio.js:86`, `js/screens2.js:407`). Sans colonnes Taille et Fréquence, ce sont les valeurs par défaut qui écrasent celles réglées dans l'appli ; une dernière visite plus ancienne dans l'Excel remplace la vraie. *Couvert par le brief (« réimport = compléter »).*
19. **Un réimport sans colonnes d'adresse efface la position de tous les clients** (`js/screens2.js:406`). L'adresse ne change pas, mais les positions sont remises à zéro ; hors ligne, ces clients sortent des tournées.
20. **CSV en UTF-8 sans BOM importé avec des caractères cassés** (`js/xlsxio.js:6`) : « Gràcia » devient « GrÃ cia », ce qui fait aussi échouer la recherche d'adresse. Fréquent avec les CSV de Google Sheets et LibreOffice.

### Commandes
21. **Heure et jour des commandes en heure UTC** (`js/xlsxio.js:123`, `js/screens.js:273-278`). Une commande passée à 10:30 sort « 08:30 » dans l'Excel ; une commande passée à 01:15 est classée la veille et n'apparaît pas dans « Hoy ». *À corriger avec le brief (onglets Hoy / Esta semana, alerte 6 mois).*
22. **Une commande déjà envoyée puis modifiée n'est jamais renvoyée** (`js/screens.js:258`). *Disparaît avec le brief (plus de notion d'envoi).*

### Tournées et géolocalisation
23. **Le recalcul en cours de journée repart de l'heure de fin prévue, pas de l'heure réelle** (`js/app.js:151`). Si on fait les visites dans un autre ordre, le reste est décalé à tort, et des clients passent en « no caben » (puis disparaissent, voir n° 2).
24. **Ajouter, retirer ou mettre une heure fixe sur la tournée du jour la recalcule depuis l'heure de départ du matin** (`js/app.js:177`). À 16:30, un client ajouté est placé à 10:15, sans alerte « no cabe ».
25. **Nueva ruta : après avoir tapé une ville de départ, les distances sont calculées depuis le golfe de Guinée** (`js/screens2.js:58`). La position de départ est vidée tant qu'elle n'est pas cherchée ; « Rellenar mi día » remplit la journée autour du mauvais endroit, et la liste affiche « 4574 km ».
26. **Une coupure réseau passagère marque une adresse « introuvable » pour toujours** (`js/app.js:192`). Le bouton « Buscar direcciones » d'Ajustes ne relance pas ces clients : il faut les placer un par un à la main.

---

## Mineurs

27. **Écran blanc jusqu'à 8 s au démarrage** avec un réseau faible, sans indicateur (`js/app.js:26`).
28. **Bouton retour désynchronisé** après « Hora fija » ou « Añadir cliente » sur une tournée : le correctif d'aujourd'hui (`f753bc9`) a oublié deux endroits (`js/screens2.js:148`, `159`).
29. **Ajustes compte les clients supprimés** : après « Eliminar clientes de prueba », il affiche toujours 166 clients (`js/db.js:106`).
30. **La copie de sauvegarde emporte et restaure le PIN et l'identifiant de synchro** (`js/db.js:97`). Restaurer une ancienne copie sur un nouveau téléphone peut déclencher l'effacement de la base locale (voir n° 12) et réactiver un ancien PIN.
31. **Import : un en-tête avec un retour à la ligne fait planter l'import** si on le choisit à la main (`js/screens2.js:384`).
32. **Hoy affiche « Ruta completada »** si le prochain arrêt est un client supprimé (`js/screens.js:38`).
33. **Une visite ou une commande enregistrée depuis la fiche ne coche pas l'arrêt de la tournée du jour** (`js/screens.js:151`).
34. **Fréquence importée sans tenir compte de l'unité** : « 2 semanas » donne 2 jours, « 1 año » 1 jour (`js/xlsxio.js:54`).
35. **Chaque affichage de Hoy ou Mapa laisse une carte en mémoire**, ce qui finit par alourdir l'appli si elle reste ouverte toute la journée (`js/screens.js:310`).
36. **La liste Clientes s'arrête à 400** sans le dire (`js/screens.js:107`).
37. **« Añadido a la ruta » s'affiche même si le client y était déjà**, et l'heure fixe choisie est ignorée (`js/screens.js:213`).
38. **Double envoi possible** sur « Enviar Excel » et « Guardar visita » en cas de double tap (`js/screens.js:287`, `181`).
39. **Il faut appuyer deux fois sur Retour** après avoir enregistré une commande ouverte depuis la fiche (`js/screens.js:260`).
40. **Une visite peut commencer juste avant la fermeture** et déborder sur la pause ou la fermeture du soir (`js/route.js:22`).
41. **Horaire client : impossible d'être plus ouvert que l'horaire d'Ajustes**, et « ferme à midi » est perdu à l'enregistrement de la fiche (`js/screens2.js:218`). *Disparaît avec le nouveau modèle d'horaires du brief.*
42. **« Guardar ubicación » sans déplacer le point** place le client au centre de la Catalogne, définitivement (`js/screens2.js:243`).
43. **Changement d'adresse d'un client placé à la main** : l'ancienne position est gardée sans avertissement (`js/screens2.js:220`).
44. **Import pendant une recherche d'adresses déjà en cours** : faux « Listo », et les nouveaux clients ne sont jamais cherchés (`js/screens2.js:419`).
45. **Ajustes : enregistrer le point de départ hors ligne** bloque le bouton sans message (`js/screens2.js:289`).

---

## Autres remarques (pas des défauts au sens strict)
- **Projet Supabase ouvert aux inscriptions :** n'importe qui peut y créer un compte et stocker des données, ce qui peut épuiser le quota gratuit et mettre le projet en pause. À désactiver dans Supabase (« Allow new users to sign up »).
- L'écran d'accueil annonce « 200 librerías » de démo, le fichier en contient 163.
- La date de dernière visite est calculée en UTC : sans effet en Espagne, sauf pour une visite enregistrée entre minuit et 2 h.

## Vérifié et solide
- **Sécurité des données en ligne :** les règles Supabase empêchent un utilisateur de lire les données d'un autre ; seule la clé publique est dans le dépôt, aucun secret.
- **Pas de faille d'injection (XSS) trouvée :** noms, notes, adresses, titres, en-têtes Excel sont tous échappés avant affichage, y compris dans les bulles de la carte.
- **Calcul des tournées :** testé sur 3000 tournées aléatoires (2 à 11 arrêts, heures fixes, horaires variés). Chaque arrêt apparaît une seule fois, les heures fixes sont respectées, et aucune visite libre ne tombe hors des horaires d'ouverture (en dehors du cas des jours fermés, n° 1).
- **Hors ligne :** le calcul des temps de trajet a bien une estimation de secours sans réseau.
- **Commandes :** quantités, totaux, lignes sans prix et références en double sont bien gérés ; codes postaux « 8012 », « 08012.0 » ou vides bien normalisés.
- **Correctif d'aujourd'hui** sur la suppression des clients de démo : correct (visites, commandes et arrêts de tournée nettoyés).
- **Copie en ligne :** pas de boucle de synchronisation infinie, et une erreur en cours de téléchargement ne fait pas perdre de données.

## Ce qui recoupe le brief
Certains constats seront corrigés naturellement en réalisant le brief, à condition d'y penser :
- n° 1 et 41 → nouveau modèle d'horaires (1.3) ;
- n° 18 → réimport qui complète (partie 3) ;
- n° 21 → onglets de Pedidos et alerte 6 mois (1.1, 1.2) ;
- n° 22 → suppression de la notion d'envoi (1.1) ;
- n° 4 → mode sombre (on touche déjà au CSS de la carte et du verrou).

---

## Suivi des corrections (2 octobre 2026)

Tous les constats sont corrigés sur la branche de travail, **sans publication** (rien n'arrive sur `main` ni sur l'appli en ligne tant que la pull request n'est pas fusionnée). Version de l'appli : 1.4.0.

| # | Correction |
|---|---|
| 1 | Un jour fermé n'est plus « ouvert toute la journée » ; « lunes mañana cerrado » marche aussi sans pause de midi |
| 2 | Les arrêts qui ne rentrent pas restent dans la tournée (marqués « no caben ») et sont replanifiés à chaque recalcul |
| 3 | Revenir dans l'appli ne redessine plus un formulaire en cours (commande, fiche, nouvelle tournée, import) |
| 4 | Les cartes ne passent plus au-dessus des fenêtres, des messages ni du verrou ; l'appli est inactive sous le verrou |
| 5 | Le géocodage relit la fiche avant d'écrire, ne touche qu'à la position, et la date de modification avance |
| 6 | Correspondance des colonnes globale et par mots entiers ; un code répété dans le fichier n'identifie plus un client |
| 7, 8 | L'import lit les valeurs réelles des cellules : dates justes, ISBN et codes longs complets, prix « 1.234,50 » compris |
| 9, 10 | Côté appli : la synchro relit 2 min en arrière. **Côté serveur : relancer `supabase/setup.sql` une fois dans Supabase** (date du serveur + « la version la plus récente gagne », testé sur Postgres) |
| 11 | « Borrar todo » et « PIN olvidado » remettent la synchro à zéro et ferment la session : tout revient à la reconnexion |
| 12 | Se connecter avec un autre compte alors qu'il reste des envois en attente demande une confirmation explicite ; le PIN de l'ancien compte est retiré |
| 13 | Bouton « Usar sin copia en línea » sur l'écran de connexion ; README et guide Supabase mis à jour |
| 14 | Après « Cerrar sesión », plus d'accès hors ligne sans identifiants |
| 15 | « PIN olvidado » ferme aussi la session de la copia en línea |
| 16 | La fenêtre « PIN olvidado » s'affiche au-dessus du verrou |
| 17 | Mise à jour « tout ou rien » : si un fichier manque, l'ancienne version reste en place ; service worker enregistré dès l'ouverture |
| 18 | Le réimport n'écrase plus taille, fréquence ni dernière visite par des valeurs par défaut ou plus anciennes |
| 19 | Un réimport sans colonnes d'adresse ne remet plus les positions à zéro |
| 20 | CSV en UTF-8 sans BOM lus correctement (repli Windows-1252 sinon) |
| 21 | Heures et jours des commandes en heure locale (déjà corrigé sur `main`) ; date de dernière visite aussi |
| 22 | Une commande « enviado » modifiée repasse en « pendiente de enviar » (provisoire : le brief supprime la notion d'envoi) |
| 23, 24 | Le recalcul repart de l'heure réelle de la dernière visite et jamais d'avant maintenant pour la tournée du jour |
| 25 | Nueva ruta : le point de départ tapé est cherché tout de suite, les distances ne partent plus de (0,0) |
| 26 | Une coupure réseau ne marque plus une adresse « introuvable » ; « Buscar direcciones » relance aussi les introuvables |
| 27 | Démarrage : attente de la session limitée à 2,5 s pour un utilisateur connu, message « cargando » |
| 28 | Bouton retour cohérent après « Hora fija » et « Añadir cliente » |
| 29 | Ajustes ne compte plus les fiches supprimées |
| 30 | La copie de sauvegarde n'emporte plus le PIN ni l'identité du compte ; le catalogue restauré est synchronisé |
| 31 | En-têtes avec retour à la ligne acceptés |
| 32 | Hoy ignore les clients supprimés ; supprimer un client le retire des tournées d'aujourd'hui et à venir |
| 33 | Une visite ou une commande enregistrée depuis la fiche coche l'arrêt de la tournée du jour |
| 34 | Fréquence importée avec son unité (« 2 semanas » = 14 jours, « 2 veces al mes » = 15…) |
| 35 | Les cartes sont détruites quand on quitte l'écran |
| 36 | Message « se muestran X de N » sur les listes Clientes, Nueva ruta et Pedidos |
| 37 | Ajouter un client déjà présent met à jour son heure fixe et sa durée, avec le bon message |
| 38 | Plus de double envoi sur « Enviar Excel », « Guardar visita » et les autres boutons à icône |
| 39 | Après une commande ouverte depuis la fiche, un seul « Atrás » suffit |
| 40 | Une visite ne peut plus commencer si elle déborde sur la pause ou la fermeture |
| 41 | Horaire client : la fiche montre l'horaire effectif et enregistre les écarts dans les deux sens |
| 42 | « Guardar ubicación » exige d'avoir déplacé le point ou trouvé l'adresse |
| 43 | Adresse modifiée sur un client placé à la main : l'appli demande s'il faut chercher la nouvelle |
| 44 | Un import pendant une recherche d'adresses en cours est pris en compte ; message final juste (introuvables / restant à chercher) |
| 45 | Ajustes : enregistrer le point de départ hors ligne affiche un message et ne bloque plus le bouton |

Autres : texte « 200 librerías » corrigé, message d'erreur de synchro échappé, écouteurs de synchro enregistrés une seule fois. Inscriptions Supabase désactivées par le propriétaire du projet.

**Vérification** : 37 contrôles automatiques dans Chromium (fuseau Europe/Madrid, réseau coupé vers Supabase et les cartes), 2000 tournées aléatoires pour le planificateur, SQL testé sur Postgres 16 (relance sans erreur, ancienne version refusée, date du serveur).

---

## Deuxième review (2 octobre 2026) et corrections

Review de tout ce qui n'est pas encore publié (corrections + brief). Les 10 constats sont corrigés :

| # | Problème | Correction |
|---|---|---|
| 1 | « Borrar todo » / « PIN olvidado » pouvaient perdre les changements non envoyés, et une synchro en cours pouvait réécrire après l'effacement | On attend la synchro en cours ; s'il reste des envois, l'appli demande confirmation ; une synchro lancée avant l'effacement n'écrit plus rien après |
| 2 | Avec la règle serveur, une modif faite sur un téléphone à l'horloge en retard pouvait être ignorée | La date de modification est toujours postérieure à la version précédente |
| 3 | Un nouveau client qui n'achète que depuis cette année était classé « Inactif » | Il n'est inactif que s'il n'a aucune vente, ni l'année de référence ni après |
| 4 | « Subir / Bajar » faisait disparaître la pause fixe | Même recalcul qu'à la validation (pause et clients qui ne rentrent pas conservés) |
| 5 | Pause « 1 h » : une journée finie le matin attendait 13 h avant de rentrer | La pause n'est placée qu'entre deux visites ; sinon on rentre directement |
| 6 | CSV : « 1.234 » lu 1,234 € | Point de milliers reconnu (« 1.234 », « 12.500 ») |
| 7 | Un service de recherche d'adresses saturé arrêtait toute la recherche | « Sans connexion » seulement si aucun service n'a répondu |
| 8 | Un rendez-vous déjà manqué relançait l'alerte à chaque visite | Traité comme une visite normale, sans alerte |
| 9 | Un autre utilisateur héritait des réglages du précédent | Réglages remis à zéro au changement de compte (sauf le thème) |
| 10 | La recherche de Pedidos redessinait tout l'écran | Filtre en mémoire, seule la liste change |

Vérification : 11 nouveaux contrôles automatiques (en plus des 66 existants), tous verts.
