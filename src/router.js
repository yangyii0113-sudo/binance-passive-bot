export function currentRoute() {
  const path = location.hash.replace(/^#\/?/, '');
  return path || 'home';
}

export function markActiveNav(route, knownRoute) {
  const normalized = route === 'advice' ? 'home' : route;
  document.querySelectorAll('.bottom-nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === (knownRoute ? normalized : 'home'));
  });
}
