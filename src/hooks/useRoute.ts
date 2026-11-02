import { useEffect, useState } from 'react';
import { routeFromHash, type RouteId } from '../navigation';

export function useRoute(): [RouteId, (id: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(() =>
    routeFromHash(window.location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (id: RouteId) => {
    const target = `#/${id}`;
    if (window.location.hash !== target) {
      window.location.hash = target;
    } else {
      setRoute(id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/home');
    }
  }, []);

  return [route, navigate];
}
