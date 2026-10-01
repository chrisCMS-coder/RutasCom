# Brief — prochaines évolutions de Rutas Comerciales

*Rédigé le 1er octobre 2026. Rien n'est encore codé : ce document fixe ce qui a été décidé avant de commencer.*

Ordre de réalisation : **Lot 1 + WhatsApp** → **Lot 2** → **Lot 3**.

---

## Lot 1 — Commandes et horaires

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

### 1.2 Horaires d'ouverture complets
**Aujourd'hui :** une seule ouverture/fermeture par client, pause de midi forcément celle d'Ajustes (13:30–17:00), quelques interrupteurs (lundi matin fermé, lundi fermé, samedi fermé). Le calcul des tournées sait déjà gérer une pause propre au client.

**Décidé** (modèle courant de Google Business, des applis de rendez-vous et des boutiques en ligne) : trois modes au choix dans la fiche.
1. **Horario habitual** : celui d'Ajustes (comportement actuel).
2. **Igual todos los días** : une plage Mañana + une plage Tarde, et on décoche les jours fermés.
3. **Por día** : 7 lignes du lundi au dimanche ; chacune avec Abierto/Cerrado, plage Mañana, plage Tarde optionnelle ; bouton **« Copiar a todos »**.

- Une plage Tarde vide = horaire continu ce jour-là.
- Les réglages actuels (lunesCerrado, lunesTodoCerrado, cierraSabado, cierraMediodia, abre/cierra) sont **convertis automatiquement** vers le nouveau modèle.
- Le calcul des tournées (`ROUTE.ventanas`) utilise le nouveau modèle.
- La fiche affiche **toujours** les horaires réels du jour (ex. « 9:30–14:00 · 16:30–20:00 »).

### 1.3 WhatsApp depuis la fiche client
- Toucher le téléphone → choix **Llamar** ou **WhatsApp**.
- WhatsApp ouvre directement la conversation (`wa.me`), indicatif **+34 ajouté automatiquement**, espaces et tirets retirés.
- *Proposé, à confirmer :* bouton WhatsApp affiché seulement pour les portables (numéros commençant par 6 ou 7).

---

## Lot 2 — Données de ventes (import Excel)

L'ERP n'est pas connectable : tout passe par l'import Excel, réimportable quand on veut. **Les en-têtes de colonnes seront fournis** avant de commencer ce lot.

### 2.1 Ventes mensuelles et annuelles
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
- Il **ne reclasse pas** les clients : seule exception, un prospect qui a des ventes passe en client (voir 2.2).

### 2.2 Inactifs et Prospects : deux catégories distinctes
**Inactif (automatique, d'après les ventes)**

| Total des ventes sur la période | Statut |
|---|---|
| Négatif | Actif (une dévolution = relation commerciale) |
| 0 ou vide, colonnes présentes dans l'import | **Inactif** |
| Colonnes de ventes absentes de l'import | « Sans donnée » (aucun statut) |

- Les inactifs **sortent des alertes de visite** (compteurs Hoy, « Fuera de plazo », « Rellenar mi día »).
- Ils sont affichés **à part** : groupe et filtre « Inactivos », couleur distincte sur la carte.
- On peut toujours les ajouter à une tournée à la main.

**Prospect (manuel)**
- Catégorie **à part** : un interrupteur « Prospecto » dans la fiche client, posé à la main.
- Un inactif n'est pas un prospect : l'inactif est un client enregistré sans ventes, le prospect est quelqu'un qu'on démarche.
- **Aucune alerte de visite** sur un prospect tant qu'il n'est pas devenu client.
- **Un prospect qui commence à acheter passe automatiquement en client** (dès que des ventes apparaissent à l'import).
- Filtre et groupe « Prospectos » dans Clientes, Mapa et Nueva ruta.

### 2.3 Alerte « 6 mois sans commande »
- Un client qui **ne commande rien pendant 6 mois** déclenche une alerte.
- C'est différent de l'inactif : l'inactif n'a rien acheté sur toute la période, l'alerte signale un client qui achetait et **s'est arrêté**.
- *Proposé, à confirmer :*
  - le calcul se fait sur les ventes mensuelles de l'Excel ; une commande saisie dans l'appli remet aussi le compteur à zéro ;
  - un mois avec seulement une dévolution (montant négatif) ne compte pas comme une commande ;
  - l'alerte apparaît sur l'écran Hoy (« X clientes sin compras desde hace 6 meses »), sur la fiche, et dans un filtre de Clientes ;
  - le délai de 6 mois est réglable dans Ajustes.

### 2.4 Taille calculée automatiquement
- **Petit ≤ 900 € / Moyen 900–2500 € / Grand > 2500 €.**
- Seuils **réglables dans Ajustes** (900 / 2500 par défaut).
- Un total négatif est classé « petit ».
- La taille saisie à la main ne sert plus que pour les clients sans donnée de ventes.
- *Proposé, à confirmer :* calcul sur les **12 derniers mois** disponibles (ex. août 2025 → juillet 2026), comparable toute l'année. Alternative : année 2025 complète.

### 2.5 Cadena
- On stocke le **code CodAgrup** lui-même ; la case **« Cadena »** se coche automatiquement s'il y a un code.
- `0`, `-` et les cellules vides ou blanches = pas de chaîne.
- Affichage « Cadena · *code* », filtre par chaîne, total des ventes d'une chaîne.
- Au réimport, la case n'est remplie que si elle est vide : une case modifiée à la main n'est **pas écrasée** (voir « Réimport = compléter » en 2.1).

---

## Lot 3 — Zones et graphique

### 3.1 Zones géographiques (Catalogne uniquement)
- **Comarca remplie automatiquement d'après le code postal**, grâce à une table intégrée à l'appli (fonctionne hors ligne).
- **Zones personnalisées** dans Ajustes : on regroupe des comarcas ou des localités (ex. « Zona Norte » = Maresme + Vallès Oriental).
- **Filtre par zone** dans Clientes, Mapa et Nueva ruta ; option de couleur par zone sur la carte.
- Pas de regroupement automatique par GPS (zones instables et peu parlantes).

### 3.2 Graphique des ventes par mois
- Source : les colonnes mensuelles de l'Excel (pas les commandes de l'appli, dont les prix peuvent manquer et qui ne sont pas des ventes facturées).
- **Barres**, pas une courbe :
  - ligne zéro bien visible ;
  - mois négatifs (dévolutions) en barres vers le bas, d'une autre couleur ;
  - montant au toucher ;
  - en option, l'année précédente en gris clair.
- **Deux emplacements :**
  - fiche client : petit graphique des 12 derniers mois + totaux 2025 / 2026 ;
  - vue globale du portefeuille, filtrable par zone et par chaîne.
- Dessiné en SVG dans l'appli, sans librairie ajoutée : fonctionne hors ligne.

---

## Notes techniques
- **Supabase : aucun changement de table.** Les fiches sont copiées en JSON telles quelles ; les nouveaux champs suivent automatiquement.
- À chaque mise en ligne, changer `VERSION` dans `sw.js` pour que les téléphones prennent la nouvelle version.

## Points encore ouverts
1. **En-têtes de colonnes de l'Excel** (codes client, ventes mensuelles, CodAgrup) — nécessaires pour le lot 2.
2. **Base de calcul de la taille** : 12 derniers mois (proposé) ou année 2025 ?
3. **WhatsApp** : seulement pour les portables (proposé) ou pour tous les numéros ?
4. **Alerte 6 mois** : calcul sur les ventes Excel + commandes de l'appli (proposé) ? Délai réglable ?
5. **Mois déjà importés** : si le nouveau fichier contient un chiffre différent pour un mois déjà connu (dévolution passée en retard, correction comptable), on garde l'ancien ou on prend le nouveau ? Proposé : on prend le nouveau, car c'est une donnée de l'ERP et pas une saisie.
6. **Taille et inactif au réimport** : ce sont des calculs à partir des ventes, pas des choix. Proposé : ils se recalculent quand les ventes sont complétées. Si tu préfères qu'ils restent figés, il faut le dire.
