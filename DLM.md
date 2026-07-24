# Destiny loadouts manager

## Description projet

L'application permettra aux joueurs de Destiny 2 de pouvoir gérer (créer, modifier et supprimer) des équipements ("loadouts") en jeu.

Dans le jeu, il y a une limite de 20 équipements par personnage. Et il faudrait pouvoir créer des "snapshots" de ces 20 équipements et de pouvoir les gérer.

## Authentification et actions de base

Gestion de l'authentification via https://www.bungie.net/
- Pouvoir sauvegarder les infos de connexion utilisateur (token d'authentification)
- Afficher le nom Bungie du compte
- Pouvoir se déconnecter

Pouvoir télécharger et stocker le manifeste de Destiny
- Vérifier s'il y a des mises à jour de celui-ci (dans le cas où il y en aurait, on sait jamais)

Pouvoir choisir le personnage sur lequel afficher et effectuer les actions plus bas
- Classe
- Niveau de puissance
- Emblème équipé
- Titre équipé (optionel)

## Les actions spécifiques que le site doit pouvoir effectuer

Pouvoir afficher les objets ainsi que leurs icônes
- tooltips lors du survol de la souris au dessus de l'objet :
    - Statistiques
    - attributs
    - mods, revêtements, etc.

Pouvoir déplacer/équiper ces objets (armes, armures, mods, artéfacts)
- Équiper des objets depuis l'inventaire 
- Pouvoir déplacer armes d'un personnage à un autre
  - inventaire P1 → coffre → inventaire p2

Pouvoir gérer les équipements ("loadouts")
- Créer des équipements à partir des objets equipés
- Modifier le nom, la couleur et l'icône des équipements (identifiers)
- Supprimer des équipements

## Logique propres à l'application

Pouvoir sauvegarder les contenus des équipements actuels
- côté client via stockage local tel que des cookies
- côté serveur via BDD

## Interface/front 

Pouvoir gérer plusieurs langues, il faudrait au moins gérer l'anglais et le français

Interface utilisateur
- rester simple pour le moment
- essayer de garder un style similaire à l'interface des menus du jeu