# Activer la copie en ligne (Supabase, gratuit) — 10 minutes

L'appli fonctionne sans cette étape. Elle sert à ne jamais perdre les données (téléphone perdu, changement de téléphone) : chaque modification est copiée dans ta base dès qu'il y a du réseau.

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
Ajustes → **Copia en línea automática** → **Configurar** :
1. Colle l'URL et la clé.
2. Entre un e-mail et un mot de passe, puis **Crear cuenta**.
3. Si Supabase demande une confirmation par e-mail, clique le lien reçu, puis reviens dans l'appli et fais **Iniciar sesión**.
   (Pour éviter cette étape : Supabase → **Authentication** → **Providers** → **Email** → désactiver **Confirm email**.)

Dès lors, l'écran Ajustes affiche « Al día · date », et l'appli n'affiche plus le rappel de sauvegarde.

## Sur un nouveau téléphone
Installer l'appli, Ajustes → Copia en línea → même URL, même clé, **Iniciar sesión** : tout revient.

## À savoir
- Plan gratuit : largement suffisant (500 Mo). Après **7 jours sans aucune utilisation**, Supabase met le projet en pause : un clic sur **Restore project** dans leur site le relance. Entre-temps l'appli continue de fonctionner sur le téléphone et rattrape la copie ensuite.
- La clé « anon » peut être dans l'appli sans risque : la table n'est lisible que par l'utilisateur connecté.
