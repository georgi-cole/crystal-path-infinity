import type { ReactNode } from 'react';
import { useLanguage } from '../language-context';
import { IdentityLinks } from './provider-sign-in';
import type { NativeIdentityClient } from './native-identity-client';
import type { OwnerProfile, ProfileClient } from './profile-client';
import { ProfileEditor } from './profile-editor';
import './profile-menu.css';

export const PROFILE_SECTIONS = 'cpi-profile-sections';

const icons = {
  edit: (
    <path d="M14 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8M10 14l1-4 7-7 3 3-7 7-4 1Z" />
  ),
  key: <path d="M19 6a4.5 4.5 0 0 1-5.2 7.1L7 20H4v-3l6.8-6.8A4.5 4.5 0 0 1 19 6Zm-2.5 1.5h.01" />,
  saved: <path d="M6 5h12v15l-6-4-6 4V5Z" />,
  signOut: <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m4-12 4 4-4 4m-6-4h10" />,
} satisfies Record<string, ReactNode>;

function ProfileIcon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

export function ProfileSectionLabel({
  icon,
  title,
  description,
}: {
  icon: 'edit' | 'key' | 'saved';
  title: string;
  description?: string;
}) {
  return (
    <>
      <span className="cpi-profile-row-icon">
        <ProfileIcon name={icon} />
      </span>
      <span className="cpi-profile-row-copy">
        <span className="cpi-profile-row-title">{title}</span>
        {description && <span className="cpi-profile-row-description">{description}</span>}
      </span>
    </>
  );
}

export function SignedInProfile({
  name,
  profileClient,
  identity,
  online,
  savedRuns,
  onSaved,
  onSignOut,
}: {
  name?: string | null;
  profileClient: ProfileClient | null;
  identity?: NativeIdentityClient | null;
  online: boolean;
  savedRuns?: ReactNode;
  onSaved?: (owner: OwnerProfile) => void;
  onSignOut?: () => Promise<boolean>;
}) {
  const { t, locale } = useLanguage();
  const initial = name?.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase(locale);
  return (
    <section className="cpi-menu-panel cpi-profile-menu" aria-labelledby="cpi-profile-name-title">
      <header className="cpi-profile-hero">
        <span className="cpi-profile-avatar" aria-hidden="true">
          <svg viewBox="0 0 72 80" fill="none">
            <path d="M36 3 65 20v35L36 77 7 55V20Z" fill="currentColor" fillOpacity=".14" />
            <path d="m36 3 29 17-29 15L7 20Z" fill="currentColor" fillOpacity=".24" />
            <path d="M36 35 65 20v35L36 77Z" fill="currentColor" fillOpacity=".11" />
            <path
              d="M36 3 65 20v35L36 77 7 55V20Zm0 0v16m29 36-15-8M7 55l15-8"
              stroke="currentColor"
              strokeOpacity=".58"
            />
          </svg>
          {initial ? <span>{initial}</span> : <span className="cpi-profile-avatar-mark" />}
        </span>
        <div className="cpi-profile-hero-copy">
          <p className="cpi-profile-greeting">{t('profile.welcomeBack')}</p>
          <h1 id="cpi-profile-name-title" tabIndex={-1} data-menu-heading>
            <bdi>{name ?? t('general.player')}</bdi>
          </h1>
        </div>
      </header>

      <div className="cpi-profile-rows">
        <details name={PROFILE_SECTIONS}>
          <summary>
            <ProfileSectionLabel
              icon="edit"
              title={t('profile.edit')}
              description={t('profile.editDescription')}
            />
          </summary>
          <div className="cpi-profile-row-panel">
            <ProfileEditor client={profileClient} online={online} onSaved={onSaved} />
          </div>
        </details>
        {identity && (
          <details name={PROFILE_SECTIONS}>
            <summary>
              <ProfileSectionLabel
                icon="key"
                title={t('account.signInMethods')}
                description={t('profile.signInDescription')}
              />
            </summary>
            <div className="cpi-profile-row-panel">
              <IdentityLinks client={identity} online={online} />
            </div>
          </details>
        )}
        {savedRuns}
      </div>

      {onSignOut && (
        <footer className="cpi-profile-footer">
          <button className="cpi-profile-signout" type="button" onClick={() => void onSignOut()}>
            <ProfileIcon name="signOut" />
            {t('account.signOut')}
          </button>
        </footer>
      )}
    </section>
  );
}
