/* NEXORA AUTH — client configuration
 * Supabase URL and publishable key are intentionally public client configuration.
 * Never place a Supabase secret/service-role key in this file.
 */
window.NEXORA_SUPABASE = {
  url: 'https://fdupvvlircdnpimrqwgj.supabase.co',
  publishableKey: 'sb_publishable_XjTZ1wF3lk6Jhb-An45cJQ_Pw3gVUJB'
};

// Load shared visual polish after auth configuration is available.
(() => {
  if (document.querySelector('link[data-nexora-site-fixes]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'site-fixes.css';
  link.dataset.nexoraSiteFixes = 'true';
  document.head.appendChild(link);
})();
