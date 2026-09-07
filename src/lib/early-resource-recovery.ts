export const EARLY_RESOURCE_RECOVERY_SCRIPT = String.raw`
(function() {
  var pattern = /\/_next\/static\/(?:chunks|css)\//i;
  var guardKey = 'priceai:chunk-load-reload';
  var guardMs = 10000;

  window.addEventListener('error', function(event) {
    var target = event && event.target;
    var resourceUrl = target && (target.src || target.href) || '';
    if (!pattern.test(resourceUrl)) return;

    try {
      var now = Date.now();
      var pageUrl = window.location.href;
      var previous = window.sessionStorage.getItem(guardKey);
      if (previous) {
        var parts = previous.split('|');
        var age = now - Number(parts[1] || 0);
        if (parts[0] === pageUrl && isFinite(age) && age >= 0 && age < guardMs) return;
      }
      window.sessionStorage.setItem(guardKey, pageUrl + '|' + now);
    } catch (error) {
      return;
    }

    window.location.reload();
  }, true);
})();
`;
