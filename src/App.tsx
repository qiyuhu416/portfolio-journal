import { useEffect, useRef, useState } from 'react';
import { Home } from '@/routes/Home';
import { JournalArticle } from '@/routes/JournalArticle';
import { Signals } from '@/routes/Signals';
import { Loops } from '@/routes/Loops';

export type Route = string;
export type NavFn = (r: Route) => void;

function readHash(): Route {
  return window.location.hash.replace(/^#/, '') || 'home';
}

export function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const homeScrollRef = useRef(0);
  const prevRouteRef = useRef<Route>(route);

  useEffect(() => {
    const h = () => setRoute(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    const prev = prevRouteRef.current;
    const leavingHome = prev === 'home' && route !== 'home';
    const returningHome = prev !== 'home' && route === 'home';

    if (leavingHome) {
      homeScrollRef.current = window.scrollY;
    }

    if (route === 'signals' || route === 'loops') {
      window.scrollTo(0, 0);
    } else if (returningHome) {
      // Pull-to-close fires while the user is still flinging the wheel/trackpad.
      // Lock body scroll briefly so residual wheel inertia after the modal
      // unmounts cannot drag the page back toward the landing.
      const target = homeScrollRef.current;
      document.body.style.overflow = 'hidden';
      const restore = () => window.scrollTo(0, target);
      requestAnimationFrame(restore);
      requestAnimationFrame(() => requestAnimationFrame(restore));
      window.setTimeout(() => {
        document.body.style.overflow = '';
        window.scrollTo(0, target);
      }, 500);
    }

    prevRouteRef.current = route;
  }, [route]);

  const nav: NavFn = (r) => {
    window.location.hash = r === 'home' ? '' : r;
  };

  const articleSlug = route.startsWith('article:') ? route.slice(8) : null;

  // Article route: render Home underneath + article overlay on top.
  // Keeps home's scroll position so closing the overlay returns you
  // to the exact quadrant you launched from.
  if (articleSlug) {
    return (
      <>
        <Home onNav={nav} />
        <JournalArticle slug={articleSlug} onClose={() => nav('home')} onNav={nav} />
      </>
    );
  }

  if (route === 'signals') return <Signals onNav={nav} />;
  if (route === 'loops') return <Loops onNav={nav} />;
  return <Home onNav={nav} />;
}
