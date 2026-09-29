"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import { Modal } from "@/components/ui/Modal";
import { ItemThumb } from "../ItemThumb";

/**
 * Combien d'exemplaires déplacer ?
 *
 * Elle ne s'ouvre que pour une **pile** de plus d'un exemplaire : ailleurs il
 * n'y a rien à demander, et une fenêtre à chaque dépôt rendrait le geste
 * pénible. La quantité part complète par défaut — c'est le cas courant, et
 * valider sans rien toucher revient donc à tout déplacer.
 *
 * Deux commandes pour la même valeur : un curseur, qu'on attrape sans viser, et
 * un champ, pour dire un nombre précis. La touche Entrée valide.
 */
export function AmountPrompt({
  itemHash,
  max,
  onConfirm,
  onCancel,
}: {
  itemHash: number;
  /** Taille de la pile : le maximum, et la valeur d'ouverture */
  max: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("actions.amount");
  const tCommon = useTranslations("common");
  const def = useSharedDefinition(itemHash);
  // Ouverte sur la pile entière : c'est le cas courant, et valider sans rien
  // toucher revient donc à tout déplacer. La fenêtre est montée à chaque dépôt,
  // `max` ne bouge pas sous elle.
  const [amount, setAmount] = useState(max);

  const clamp = (value: number) =>
    Math.min(max, Math.max(1, Math.round(value) || 1));

  return (
    <Modal open onClose={onCancel} title={t("title")} compact>
      <form
        className="amount-prompt"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(clamp(amount));
        }}
      >
        <div className="amount-prompt__item">
          <span className="item">
            <ItemThumb itemHash={itemHash} quantity={max} />
          </span>
          <span className="amount-prompt__name">
            {def?.displayProperties?.name ?? ""}
          </span>
        </div>

        <div className="amount-prompt__controls">
          <input
            type="range"
            className="amount-prompt__slider"
            min={1}
            max={max}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            aria-label={t("title")}
          />
          <input
            type="number"
            className="amount-prompt__value"
            min={1}
            max={max}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            onBlur={() => setAmount(clamp(amount))}
            aria-label={t("title")}
            // La fenêtre s'ouvre sur un geste de souris : le champ prend le
            // focus pour que la frappe d'un nombre suffise à répondre.
            autoFocus
          />
          <button
            type="button"
            className="btn btn--small"
            onClick={() => setAmount(max)}
            disabled={amount === max}
          >
            {t("all")}
          </button>
        </div>

        <div className="amount-prompt__actions">
          <button type="button" className="btn" onClick={onCancel}>
            {tCommon("cancel")}
          </button>
          <button type="submit" className="btn btn--primary">
            {tCommon("confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
