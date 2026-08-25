import { useEffect, useState } from 'react';
import { fetchMe, type PlayerInfo } from './api';
import OnlineLogin from './OnlineLogin';
import NeedsProfile from './NeedsProfile';
import { useT } from '../i18n/strings';

type View = { kind: 'loading' } | { kind: 'login' } | { kind: 'needs-profile'; email: string };

interface Props {
  onAuthed: (player: PlayerInfo) => void;
}

// Sits in front of the entire app (both hotseat and online) — nothing renders past this until a
// session exists, whether that's a fresh login/sign-up or a restored cookie from before.
export default function AuthGate({ onAuthed }: Props) {
  const t = useT();
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    fetchMe().then((me) => {
      if (me) onAuthed(me);
      else setView({ kind: 'login' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view.kind === 'loading') {
    return (
      <div className="setup-inline">
        <div className="modal">
          <p>{t('auth.loading')}</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'login') {
    return (
      <div className="setup-inline">
        <OnlineLogin onLoggedIn={onAuthed} onNoAccount={(email) => setView({ kind: 'needs-profile', email })} />
      </div>
    );
  }

  return (
    <div className="setup-inline">
      <NeedsProfile email={view.email} onDone={onAuthed} />
    </div>
  );
}
