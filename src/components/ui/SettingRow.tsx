"use client";

import type { ReactNode } from "react";

/**
 * Ligne d'option : libellé (et description optionnelle) à gauche, contrôle à
 * droite — la disposition de la maquette.
 */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /** id du contrôle, pour rendre le libellé cliquable */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        {htmlFor ? (
          <label className="setting-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="setting-row__label">{label}</span>
        )}
        {hint && <p className="setting-row__hint">{hint}</p>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

/** Interrupteur on/off accessible (case à cocher stylée). */
export function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`toggle${checked ? " toggle--on" : ""}`}
    >
      <span className="toggle__knob" />
    </button>
  );
}

/** Liste déroulante simple, alignée sur le style de la maquette. */
export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      id={id}
      className="select"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
