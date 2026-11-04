/**
 * The analytics snippet. It reports the page path and the referring site, once
 * per page load, and does nothing when the browser asks not to be tracked.
 * It sets no cookie and stores nothing in the browser.
 */
const SCRIPT = `(function () {
  var s = document.currentScript;
  if (!s) return;
  var key = s.getAttribute("data-key");
  if (!key) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return;
  var endpoint = new URL(s.src).origin + "/api/collect/" + encodeURIComponent(key);
  var last = null;
  function send() {
    var path = location.pathname;
    if (path === last) return;
    last = path;
    var body = JSON.stringify({ p: path, r: document.referrer || undefined });
    // text/plain keeps this a simple request, so no preflight is needed.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
    } else {
      fetch(endpoint, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
    }
  }
  var push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    send();
  };
  addEventListener("popstate", send);
  send();
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
