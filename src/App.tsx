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

// Scroll position is persisted across refreshes via sessionStorage. The
// browser's automatic scroll restoration doesn't work for our home page —
// the scroll-driver div is taller than the viewport (~9.5×) and isn't in
// the DOM until React renders, so by the time the browser tries to restore
// scrollY, the document is too short and it falls back to top. Manual
// restoration waits for the driver div to render before scrolling.
const SCROLL_KEY = 'home-scroll-y';

export function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const homeScrollRef = useRef(0);
  const prevRouteRef = useRef<Route>(route);
  // Tracked for the throttled scroll-saver — its callback closure can't
  // see the latest `route` directly without re-binding the listener on
  // every route change, so we mirror it through a ref.
  const routeRef = useRef<Route>(route);
  useEffect(() => { routeRef.current = route; }, [route]);

  useEffect(() => {
    const h = () => setRoute(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  // ——— Cross-refresh scroll restoration ———
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Restore once on mount, IF the current route uses the home scroll
    // (home itself, or an article overlay rendered on top of home).
    const initialRoute = routeRef.current;
    const usesHomeScroll = initialRoute === 'home' || initialRoute.startsWith('article:');
    if (usesHomeScroll) {
      const saved = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
      if (saved > 0) {
        // Seed the in-session ref so any subsequent leavingHome → returningHome
        // round-trip restores to the right place even before the user scrolls.
        homeScrollRef.current = saved;
        // Wait for the scroll-driver div to render. Poll document height per
        // frame until tall enough OR ~20 frames pass (safety bound).
        let attempts = 0;
        const tryRestore = () => {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          if (maxScroll >= saved || attempts > 20) {
            window.scrollTo(0, saved);
            return;
          }
          attempts++;
          requestAnimationFrame(tryRestore);
        };
        requestAnimationFrame(tryRestore);
      }
    }

    // Save scrollY on every scroll (throttled) AND on pagehide /
    // visibilitychange so a refresh or tab-close captures the latest position.
    let throttle: number | undefined;
    const persist = () => {
      const r = routeRef.current;
      if (r === 'home' || r.startsWith('article:')) {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      }
    };
    const onScroll = () => {
      window.clearTimeout(throttle);
      throttle = window.setTimeout(persist, 120);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', persist);
      window.clearTimeout(throttle);
    };
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

  // Article route format: `article:slug` or `article:slug:sectionId`. The
  // optional `:sectionId` suffix lets a caller deep-link into a specific
  // section of an article (e.g. clicking a quote on the Learn page jumps to
  // the source section in the original piece).
  const articleRoute = route.startsWith('article:') ? route.slice(8) : null;
  const [articleSlug, articleSection] = articleRoute
    ? (() => {
        const parts = articleRoute.split(':');
        return [parts[0], parts[1] ?? null] as const;
      })()
    : [null, null];

  // Article route: render Home underneath + article overlay on top.
  // Keeps home's scroll position so closing the overlay returns you
  // to the exact quadrant you launched from.
  if (articleSlug) {
    return (
      <>
        <Home onNav={nav} />
        <JournalArticle
          slug={articleSlug}
          initialSectionId={articleSection}
          onClose={() => nav('home')}
          onNav={nav}
        />
      </>
    );
  }

  if (route === 'signals') return <Signals onNav={nav} />;
  if (route === 'loops') return <Loops onNav={nav} />;
  return <Home onNav={nav} />;
}
