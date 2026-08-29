# Grimoire de collection MTG — PWA

Appli installable sur Android (et iOS/desktop) pour suivre ta collection Magic : ajout de cartes
(recherche texte ou **scan caméra**), cotes Cardmarket (EUR) via Scryfall, historique de valeur
avec graphiques, et alertes de variation de prix.

## Déployer l'appli (nécessaire pour l'installer sur Android)

Une PWA doit être servie en HTTPS pour être installable et pour que la caméra fonctionne.
Le plus simple et gratuit : **GitHub Pages**.

1. Crée un nouveau dépôt GitHub (public — les dépôts privés nécessitent un compte payant pour Pages).
2. Mets-y tous les fichiers de ce dossier **à la racine** du dépôt :
   `index.html`, `style.css`, `app.js`, `manifest.json`, `service-worker.js`, et le dossier `icons/`.
3. Dans le dépôt : **Settings → Pages → Build and deployment → Deploy from a branch**,
   choisis la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Après une minute, ton appli est en ligne à `https://<ton-pseudo>.github.io/<nom-du-repo>/`.

Alternative sans compte GitHub : va sur `app.netlify.com/drop` et dépose le dossier —
tu obtiens une URL HTTPS instantanément.

## Installer sur Android

1. Ouvre l'URL de déploiement dans **Chrome** sur ton téléphone.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. L'icône apparaît sur ton écran d'accueil, l'appli s'ouvre en plein écran comme une appli native.
4. Au premier scan, autorise l'accès à la caméra quand Android le demande.

## Le scan par caméra — ce qu'il fait vraiment

Ce n'est **pas** de la reconnaissance visuelle de carte (pas de comparaison d'image avec une base
de données d'illustrations). C'est de la **reconnaissance de texte (OCR)** sur le nom imprimé en
haut de la carte, via la librairie Tesseract.js, exécutée entièrement sur ton téléphone. Le texte
lu est ensuite recherché sur Scryfall (recherche approximative).

Résultat : ça marche bien à plat, bien éclairé, sans reflet (attention aux cartes foil) — et
peut se tromper avec un mauvais éclairage, un angle, ou une police stylisée. C'est pour ça que
l'appli **te montre toujours la carte trouvée avant de l'ajouter**, avec un bouton pour chercher
manuellement si ce n'est pas la bonne.

## Où sont stockées les données

Tout est enregistré **localement dans le navigateur de ton téléphone** (`localStorage`) :
pas de compte, pas de serveur, personne d'autre n'y a accès. En contrepartie :
- Si tu vides les données de navigation de Chrome, ta collection est perdue.
- La collection n'est pas synchronisée entre appareils (ton téléphone et ton ordi, par exemple,
  auront chacun leur propre collection).

Si un jour tu veux une sauvegarde/export, ou une synchronisation entre appareils, dis-le-moi —
ça se rajoute (export JSON à minima, ou un vrai compte avec base de données pour la synchro).

## Mise à jour des prix

Il n'y a pas de tâche de fond : la mise à jour se fait quand tu ouvres l'appli et appuies sur
« Mettre à jour les prix ». Chaque mise à jour ajoute un point à l'historique, ce qui construit
progressivement le graphique d'évolution.
