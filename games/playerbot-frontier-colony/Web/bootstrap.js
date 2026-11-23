// File URLs require a classic script because browsers block local ES modules.
(() => {
  const script = document.createElement('script');
  if (location.protocol === 'file:') {
    script.src = './app.bundle.js?v=4.0.1';
  } else {
    script.type = 'module';
    script.src = './app.js?v=4.0.0';
  }
  document.body.appendChild(script);
})();
