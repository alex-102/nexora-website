(() => {
  const email = new URLSearchParams(location.search).get('email');
  const target = document.getElementById('emailTarget');
  if (target && email) target.textContent = email;
})();
