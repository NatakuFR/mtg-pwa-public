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

Depuis la v1.6.0, tu peux exporter un fichier de sauvegarde (Réglages → Sauvegarde) et le
réimporter si besoin — voir l'historique des versions plus bas. Il n'y a en revanche toujours
pas de synchronisation automatique entre appareils : c'est un transfert manuel de fichier.

## Mise à jour des prix

Il n'y a pas de tâche de fond : la mise à jour se fait quand tu ouvres l'appli et appuies sur
« Mettre à jour les prix ». Chaque mise à jour ajoute un point à l'historique, ce qui construit
progressivement le graphique d'évolution.

## Historique des versions

Le numéro de version courant s'affiche à côté du titre dans l'appli — utile pour vérifier
qu'un déploiement GitHub Pages a bien pris (l'appli détecte aussi les mises à jour toute seule
et propose de rafraîchir).

**v1.8.0**
- Chaque carte de la collection est cliquable et ouvre sa page Cardmarket dans un nouvel onglet
  (lien fourni par Scryfall). Les cartes ajoutées avant cette version récupèrent leur lien
  automatiquement au premier clic.

**v1.7.1**
- Correctif important : le scan caméra pouvait proposer une carte totalement sans rapport avec
  le texte lu. En cause, un tri alphabétique forcé sur les résultats de recherche — le scanner
  prenait le premier résultat de la liste triée par ordre alphabétique au lieu du plus pertinent.
  Utilise maintenant en priorité l'outil Scryfall dédié à la résolution d'un texte imparfait vers
  une carte unique, avec la recherche large en repli seulement si besoin.

**v1.7.0**
- Scanner : passage à un worker Tesseract réutilisable en mode "ligne unique" (bien plus précis
  qu'en mode page complète par défaut), avec prétraitement contraste de l'image avant lecture.
- Cadre de scan réduit pour permettre de photographier la carte en reculant un peu (moins de
  flou de mise au point de près), et résolution caméra demandée plus élevée.
- Aperçu de la zone exactement lue affiché à l'écran, pour diagnostiquer soi-même un échec de
  lecture (flou, luminosité) plutôt que de deviner.

**v1.6.0**
- Sauvegarde : export d'un fichier `.json` local, et import pour restaurer une collection
  (avec confirmation avant d'écraser les données actuelles).

**v1.5.0**
- Les cartes de l'onglet Collection sont regroupées par édition, avec un en-tête pliable/dépliable
  affichant le nombre de cartes et la valeur du groupe. Éditions triées de la plus récente à la
  plus ancienne.

**v1.4.1**
- Correctif : la recherche par nom traduit (français, allemand…) ne remontait aucun résultat.
  Scryfall a besoin du paramètre `lang:any` explicitement — sans ça, il ignore les noms traduits.

**v1.4.0**
- Numéro de version affiché dans l'en-tête.
- Détection automatique d'une nouvelle version déployée pendant que l'appli est ouverte, avec
  bandeau et bouton pour l'appliquer.

**Avant le suivi de version (version initiale)**
- Suivi de collection avec cotes Cardmarket (EUR) via l'API Scryfall.
- Ajout de carte par recherche texte (nom, quantité, foil).
- Scan par appareil photo : lecture du nom par OCR (Tesseract.js), puis recherche Scryfall.
- Désambiguïsation d'édition quand plusieurs impressions existent pour un même nom : lecture du
  numéro de collection en priorité, sinon comparaison visuelle de l'illustration (sélecteur
  d'éditions avec vignette la plus probable pré-sélectionnée).
- Historique de valeur (graphique global + par carte) et alertes de variation de prix, avec seuil
  configurable.
- Installable en PWA via GitHub Pages ; données stockées uniquement en local sur l'appareil.
