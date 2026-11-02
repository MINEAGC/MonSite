# Motif — site de restaurant avec gestion des demandes

Site multipage pour une table gastronomique contemporaine : direction artistique éditoriale, menus interactifs, parcours de réservation, formulaire de réception et espace admin. Les demandes sont conservées dans une base SQLite locale au serveur.

## Démarrage local

Prérequis : Node.js 24 ou supérieur.

Dans le dossier du projet, installer la dépendance d’envoi d’e-mails puis démarrer le serveur :

```powershell
npm.cmd install
npm.cmd start
```

Ouvrir ensuite `http://127.0.0.1:3000`. Ne pas ouvrir `index.html` directement en `file://` : les formulaires ont besoin du serveur.

Au premier démarrage, le serveur crée `.env` et affiche un mot de passe admin aléatoire dans le terminal. Copiez-le : il ne sera affiché qu’une fois. L’espace de gestion se trouve sur `http://127.0.0.1:3000/admin`, identifiant `admin` par défaut. Les demandes sont enregistrées dans `data/motif.sqlite`.

## Pages et parcours

- `index.html` — accueil immersif, informations essentielles, choix interactif du menu et accès aux principales expériences.
- `menus.html` — trois menus de démonstration consultables au clavier ou à la souris, avec exemples de plats, tarifs et accords.
- `maison.html` — récit de la maison, présentation fictive de la cheffe, horaires de démonstration et galerie agrandissable.
- `reservation.html` — demande guidée en deux étapes : menu, service, date, horaire, nombre de personnes et coordonnées.
- `privatiser.html` — demande de renseignement pour un repas privé ou une réception.
- `mentions-legales.html` — trame à compléter et à faire vérifier avant toute publication.

Le parcours réserve la même place à la lecture et à l’action : liens de réservation visibles, récapitulatif qui suit le menu sélectionné, appels à la réservation répétés avec mesure, navigation mobile, liens d’itinéraire et coordonnées accessibles.

## Fonctionnement inclus

- Le sélecteur des trois parcours modifie le nom, le descriptif, le tarif et le lien vers la demande de réservation.
- Les onglets de la page Menus fonctionnent avec les flèches du clavier ainsi qu’avec les touches Début et Fin.
- La demande de table permet de proposer un accord de vins, un accord sans alcool ou aucun accord ; les tarifs viennent de la même configuration que la carte.
- La demande de table comporte deux étapes, valide les informations côté navigateur et côté serveur, calcule le budget estimé et refuse les dimanches et lundis de démonstration.
- Les horaires proposés suivent le service choisi ; une date antérieure à aujourd’hui ou un jour de fermeture est refusé.
- Les demandes de table et de réception sont enregistrées dans SQLite et consultables dans l’espace admin protégé par mot de passe. L’équipe peut confirmer, refuser ou marquer une demande de réception comme traitée.
- Les demandes anciennes sont supprimées après 90 jours par défaut. La durée est réglable dans `.env` avec `DATA_RETENTION_DAYS`.
- L’envoi des e-mails de notification et d’accusé de réception utilise SMTP. Renseigner `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` et `SMTP_FROM` dans `.env`, puis remplacer les adresses fictives dans `config.js`. Sans ces paramètres, les demandes restent enregistrées et consultables dans l’espace admin, mais aucun e-mail automatique n’est envoyé.
- La galerie utilise une boîte de dialogue native, fermable au clavier avec Échap.
- Les coordonnées, l’adresse, le nom affiché, la cheffe, les jours de fermeture, les jours et horaires d’ouverture et les créneaux proposés se modifient dans `config.js`. Les noms, nombres de temps, durées indicatives, tarifs et courts descriptifs des menus y sont aussi centralisés ; les récits, textes de référencement, mentions de localisation et compositions détaillées restent à adapter dans les pages.
- Dans `closedDays`, les jours suivent la numérotation JavaScript : dimanche `0`, lundi `1`, jusqu’au samedi `6`.
- Le site respecte la préférence « réduire les animations » et comprend un lien d’évitement pour aller au contenu.

## Avant la mise en ligne

Le serveur gère des **demandes** et leur suivi manuel. Il ne bloque pas automatiquement des tables en temps réel et ne remplace pas un plan de salle ou un logiciel métier. Pour une disponibilité immédiate, connecter un outil de réservation du restaurant.

Le nom **Motif**, la cheffe Camille Moreau, le quartier, l’adresse, les horaires, le numéro, les menus, leurs prix, les plats et les tarifs d’accord sont des éléments fictifs. L’adresse e-mail utilise le domaine réservé `.example`. Remplacez ces valeurs avant tout usage réel. Configurez le serveur derrière HTTPS, définissez un mot de passe admin privé, renseignez SMTP et complétez les mentions légales, la politique de confidentialité et les coordonnées de l’établissement. Les formulaires stockent des coordonnées et des informations alimentaires : vérifiez les règles et durées de conservation applicables avant la publication. Les photographies illustrent une direction artistique et ne montrent pas nécessairement le restaurant du client.

## Personnalisation avant livraison

1. Choisir le vrai nom, le positionnement et les éléments d’identité du restaurant. Adapter aussi les mentions de marque, les textes de la cheffe, le monogramme `M` de l’en-tête et `assets/favicon.svg`.
2. Mettre à jour `config.js` : téléphone, e-mail, adresse, itinéraire, horaires et créneaux réellement proposés, jours de fermeture, tarifs des menus et accords.
3. Remplacer les textes de démonstration, le portrait fictif et les compositions de menus par des informations fournies et validées par le client.
4. Remplacer les photographies d’inspiration par des images du lieu, de la cuisine et des assiettes du client, avec son autorisation.
5. Compléter et faire relire les mentions, vérifier les informations pratiques, configurer SMTP et choisir entre le suivi par demandes dans l’espace admin ou un outil de réservation avec disponibilité en temps réel.

## Photographies et crédits

Les sept images sont des photos Pexels recadrées et optimisées en WebP pour la maquette. Les liens ci-dessous renvoient aux pages des photographies ; vérifiez leurs conditions d’usage au moment de la publication et remplacez-les de préférence par les visuels du restaurant.

| Fichier | Crédit | Source |
| --- | --- | --- |
| `assets/plat-velours.webp` | Rachel Claire | [Pexels — gourmet dish on a plate](https://www.pexels.com/photo/gourmet-dish-on-a-plate-8112895/) |
| `assets/salle-ecrin.webp` | Galina Kudryashova | [Pexels — luxury restaurant interior](https://www.pexels.com/photo/luxury-restaurant-interior-20291129/) |
| `assets/geste-chef.webp` | Pascal Gastaud | [Pexels — chef preparing a gourmet dish](https://www.pexels.com/photo/chef-preparing-gourmet-dish-in-professional-kitchen-30047126/) |
| `assets/service-vin.webp` | Pavel Danilyuk | [Pexels — pouring white wine](https://www.pexels.com/photo/a-man-pouring-white-wine-into-the-wine-glasses-at-the-table-8775392/) |
| `assets/assiette-signee.webp` | Amar Preciado | [Pexels — appetizer served in a restaurant](https://www.pexels.com/photo/appetizer-served-in-a-restaurant-23644633/) |
| `assets/mise-en-place.webp` | Alexandra Kollstrem | [Pexels — plates and wine glasses on a table](https://www.pexels.com/photo/plates-and-wine-glasses-on-a-table-8856554/) |
| `assets/salon-nacre.webp` | Mark Cattell | [Pexels — restaurant interior](https://www.pexels.com/photo/luxury-interior-design-in-restaurant-11090935/) |

Consultez également la [licence Pexels](https://www.pexels.com/license/). Le modèle ne comprend ni logo client ni photographie exclusive de l’établissement.

## Repères de conception

L’organisation des menus, des informations pratiques, de la réservation et de la privatisation a été étudiée en observant plusieurs sites de restauration. Ce sont des repères de parcours, pas des modèles à reproduire : [Le Gabriel — La Réserve Paris](https://www.lareserve-paris.com/restaurants-bars/restaurant-le-gabriel/), [Acmé Paris](https://acmeparis11.fr/), [Contraste Paris](https://www.contraste.paris/) et [Table Paris](https://table.paris/).

