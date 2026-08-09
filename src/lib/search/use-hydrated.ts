"use client";

import { useSyncExternalStore } from "react";

// Rien à surveiller : la valeur ne change qu'une fois, à l'hydratation, et
// React s'en charge lui-même. La fonction est définie ici pour rester stable.
const NO_SUBSCRIPTION = () => () => {};

/**
 * `false` pendant le rendu du serveur **et** au premier rendu du client,
 * `true` ensuite.
 *
 * Sert à n'afficher qu'après l'hydratation ce que le serveur ne peut pas
 * connaître — ici l'état de la barre de recherche : requête en cours,
 * historique relu dans localStorage, résultats publiés par l'inventaire. Sans
 * cela React signale un écart d'hydratation, ce qui arrive dès qu'un
 * rechargement à chaud réhydrate une page dont le store est déjà rempli.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` posé dans un effet : c'est
 * lui qui garantit l'emploi de l'instantané *serveur* le temps de
 * l'hydratation, sans le rendu en cascade qu'un `setState` dans un effet
 * provoquerait (et que le lint du dépôt refuse).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    NO_SUBSCRIPTION,
    () => true,
    () => false,
  );
}
