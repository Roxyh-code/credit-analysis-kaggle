/* ================================================
   MAIN — App Init
   ================================================ */

function initApp(data) {
  // Hide loading screen
  var loadingEl = document.getElementById('loading-screen');
  if (loadingEl) {
    loadingEl.classList.add('fade-out');
    setTimeout(function() { loadingEl.style.display = 'none'; }, 600);
  }

  // Show app
  var appEl = document.getElementById('app');
  if (appEl) appEl.style.cssText = 'display:flex;flex-direction:column;height:100vh;overflow:hidden;';

  window.RiverTab.init();

  console.log('App initialized with', data.length, 'rows');
}

// ---- Start Loading ----
(function() {
  var csvPath = 'Loan_default.csv';

  window.setLoadingStatus('Loading data…', 5);

  window.loadData(csvPath, function(data) {
    initApp(data);
  }, function(err) {
    console.error('Data load failed:', err);
    window.setLoadingStatus('Load failed — please refresh', 0);
    document.getElementById('loading-bar').style.background = '#f85149';
  });
})();
