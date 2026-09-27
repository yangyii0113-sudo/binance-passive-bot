export function currentRoute() {
  const path = location.hash.replace(/^#\/?/, '');
  return path || 'home';
}

export function markActiveNav(route, knownRoute) {
  const normalized = route === 'advice' || route === 'advice-results' ? 'strategies' : route === 'results' || route === 'backtest' ? 'lab' : route;
  document.querySelectorAll('.bottom-nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === (knownRoute ? normalized : 'home'));
  });
}
