export function currentRoute() {
  const path = location.hash.replace(/^#\/?/, '');
  return path || 'home';
}

export function markActiveNav(route, knownRoute) {
  document.querySelectorAll('.bottom-nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === (knownRoute ? route : 'home'));
  });
}
