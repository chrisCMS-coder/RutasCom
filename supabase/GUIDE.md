# Copie en ligne (Supabase)

L'appli est **déjà préconfigurée** avec un projet Supabase (URL et clé publique dans `js/sync.js`). Elle sert à ne jamais perdre les données (téléphone perdu, changement de téléphone) : chaque modification est copiée dès qu'il y a du réseau.

## Avec le projet préconfiguré
- **Comptes** : les inscriptions libres sont désactivées (Authentication → Sign In / Providers → « Allow new users to sign up » désactivé). Pour ajouter un utilisateur : Supabase → **Authentication** → **Users** → **Add user** (e-mail + mot de passe), puis se connecter dans l'appli.
- **Mise à jour du SQL (octobre 2026, une seule fois)** : SQL Editor → New query → coller tout `setup.sql` → Run. Le script peut être relancé sans risque. Il ajoute la date d'écriture côté serveur et la règle « la version la plus récente gagne » : sans cette mise à jour, une modification faite hors ligne sur un appareil peut ne jamais arriver sur un autre.
- **Sans copie en ligne** : bouton « Usar sin copia en línea » sur l'écran de connexion.

## Utiliser son propre projet Supabase (optionnel) — 10 minutes

## 1. Créer le compte et le projet
1. Va sur https://supabase.com → **Start your project** → crée un compte (e-mail ou GitHub).
2. **New project** : nom `rutas-comerciales`, région **West EU (Paris)**, mot de passe de base de données (garde-le quelque part, il ne sert pas dans l'appli). Plan **Free**.
3. Attends 1 à 2 minutes que le projet soit prêt.

## 2. Créer la table
1. Menu de gauche → **SQL Editor** → **New query**.
2. Colle le contenu de `setup.sql` (ce dossier) et clique **Run**. Le message « Success » suffit.

## 3. Récupérer les deux identifiants
Menu **Project Settings** (roue dentée) → **API** :
- **Project URL** (ressemble à `https://abcdefgh.supabase.co`)
- **anon public** key (ou « publishable key », longue chaîne de caractères)

## 4. Dans l'appli
Ajustes → **Copia en línea automática** → **Gestionar** → **Desactivar**, puis **Configurar** :
1. Colle l'URL et la clé.
2. Entre un e-mail et un mot de passe, puis **Crear cuenta**.
3. Si Supabase demande une confirmation par e-mail, clique le lien reçu, puis reviens dans l'appli et fais **Iniciar sesión**.
   (Pour éviter cette étape : Supabase → **Authentication** → **Providers** → **Email** → désactiver **Confirm email**.)

Dès lors, l'écran Ajustes affiche « Al día · date », et l'appli n'affiche plus le rappel de sauvegarde.

## Sur un nouveau téléphone
Installer l'appli et se connecter avec le même e-mail : tout revient. (Avec son propre projet : Ajustes → Copia en línea → même URL, même clé, **Iniciar sesión**.)

## Effacer les données d'un téléphone
« Borrar todos los datos » (Ajustes) et « ¿Has olvidado el PIN? » effacent le téléphone **et ferment la session** : la copie en ligne n'est pas touchée, elle revient à la reconnexion.

## À savoir
- Plan gratuit : largement suffisant (500 Mo). Après **7 jours sans aucune utilisation**, Supabase met le projet en pause : un clic sur **Restore project** dans leur site le relance. Entre-temps l'appli continue de fonctionner sur le téléphone et rattrape la copie ensuite.
- La clé « anon » peut être dans l'appli sans risque : la table n'est lisible que par l'utilisateur connecté.
