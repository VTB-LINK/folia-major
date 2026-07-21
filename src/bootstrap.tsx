import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './i18n/config';
import './index.css';
import App from './App';
import RemoteControlApp from './components/remote/RemoteControlApp';
import ObsBrowserSourceApp from './components/obs/ObsBrowserSourceApp';
import ObsNowPlayingSourceApp from './components/obs/ObsNowPlayingSourceApp';
import ObsPlayerCapSourceApp from './components/obs/ObsPlayerCapSourceApp';

// src/bootstrap.tsx
// Mounts the React app after index.tsx installs runtime-level browser shims.

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const searchParams = new URLSearchParams(window.location.search);
const isObsBrowserSource = searchParams.get('obs') === '1' || window.location.pathname === '/obs';
const obsSource = searchParams.get('obsSource');
// obsSource=now-playing / playercap: static OBS overlay that connects directly to NowPlaying / PlayerCap in the browser (no Electron SSE relay).
const isNowPlayingObsSource = isObsBrowserSource && obsSource === 'now-playing';
const isPlayerCapObsSource = isObsBrowserSource && obsSource === 'playercap';

// The service worker serves every navigation from its precache, so without an update hook a new
// deploy stayed invisible: it installed in the background while reload after reload was answered
// from the old precache, and only a cache-clearing reload got past it.
//
// The overlay keeps the service worker -- its precache is what lets a source that has been open for
// hours survive a deploy replacing every hashed asset -- but it must never reload itself. It is a
// live browser source; a reload mid-stream is a visible break. Supplying onNeedReload replaces the
// automatic window.location.reload() that autoUpdate would otherwise do, so the worker still
// updates and the page simply stays as it is until the source is restarted.
registerSW({
  immediate: true,
  onNeedReload: isObsBrowserSource ? () => {} : undefined,
});
root.render(
  <React.StrictMode>
    {isNowPlayingObsSource
      ? <ObsNowPlayingSourceApp />
      : isPlayerCapObsSource
        ? <ObsPlayerCapSourceApp />
        : isObsBrowserSource
          ? <ObsBrowserSourceApp />
          : searchParams.get('remote') === '1'
            ? <RemoteControlApp />
            : <App />}
  </React.StrictMode>
);
