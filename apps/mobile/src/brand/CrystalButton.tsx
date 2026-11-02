import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './crystal-button.css';

export type CrystalButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface CrystalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CrystalButtonVariant;
  icon?: ReactNode;
  stretch?: boolean;
}

/** Big Eye glass-button affordances adapted without season, holiday or store dependencies. */
export function CrystalButton({
  variant = 'secondary',
  icon,
  stretch = false,
  className = '',
  type = 'button',
  children,
  ...props
}: CrystalButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={[
        'cpi-crystal-button',
        'cpi-crystal-button--' + variant,
        stretch && 'cpi-crystal-button--stretch',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon !== undefined && (
        <span className="cpi-crystal-button__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="cpi-crystal-button__text">{children}</span>
    </button>
  );
}
