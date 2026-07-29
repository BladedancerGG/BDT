"use client";

import { useTranslations } from "next-intl";

/** Colonne de perks factice : plusieurs options empilées. */
function SkeletonColumn({ options }: { options: number }) {
  return (
    <div className="socket-column">
      {Array.from({ length: options }).map((_, i) => (
        <span key={i} className="skeleton skeleton--circle" />
      ))}
    </div>
  );
}

/**
 * Placeholder du corps de l'infobulle, affiché tant que l'API n'a pas renvoyé
 * les perks / mods réellement présents sur l'objet.
 *
 * Les formes reprennent la structure du contenu final (colonnes de perks pour
 * une arme, lignes de stats pour une armure) afin d'éviter un saut de mise en
 * page quand les données arrivent.
 */
export function TooltipSkeleton({
  kind,
}: {
  kind: "weapon" | "armor" | "other";
}) {
  const t = useTranslations("item");

  return (
    <div
      className="tooltip-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="visually-hidden">{t("loadingDetail")}</span>

      {kind === "weapon" && (
        <>
          {/* Archétype : icône intrinsèque + cadence / impact */}
          <div className="tooltip-skeleton__archetype">
            <span className="skeleton skeleton--circle" />
            <div className="tooltip-skeleton__lines">
              <span className="skeleton skeleton--line skeleton--line-lg" />
              <span className="skeleton skeleton--line skeleton--line-sm" />
            </div>
          </div>

          {/* Colonnes de perks (nombre typique d'une arme légendaire) */}
          <div className="tooltip-skeleton__section">
            <span className="skeleton skeleton--title" />
            <div className="socket-section__columns">
              <SkeletonColumn options={2} />
              <SkeletonColumn options={2} />
              <SkeletonColumn options={3} />
              <SkeletonColumn options={3} />
              <SkeletonColumn options={1} />
              <SkeletonColumn options={2} />
            </div>
          </div>
        </>
      )}

      {kind === "armor" && (
        <>
          {/* Statistiques */}
          <div className="tooltip-skeleton__stats">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="skeleton skeleton--stat" />
            ))}
          </div>

          {/* Mods d'armure */}
          <div className="tooltip-skeleton__section">
            <span className="skeleton skeleton--title" />
            <div className="socket-section__row">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="skeleton skeleton--square" />
              ))}
            </div>
          </div>
        </>
      )}

      {kind === "other" && (
        <div className="tooltip-skeleton__lines">
          <span className="skeleton skeleton--line skeleton--line-lg" />
          <span className="skeleton skeleton--line skeleton--line-md" />
        </div>
      )}
    </div>
  );
}
