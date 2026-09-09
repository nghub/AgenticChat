(function () {
  "use strict";

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  var botId = script.getAttribute("data-bot-id");
  var position = script.getAttribute("data-position") || "bottom-right";
  var primaryColor = script.getAttribute("data-color") || "#111827";
  // Optional fixed label; otherwise the embed reports the bot's name and the
  // pill becomes "Ask <name>" once it has loaded.
  var launcherLabel = script.getAttribute("data-launcher-label") || "";
  var panelWidth = parseInt(script.getAttribute("data-panel-width") || "400", 10);

  if (!botId) {
    console.warn("[OpenBusinessChat] No data-bot-id provided.");
    return;
  }

  var baseUrl = script.src.replace("/widget.js", "");
  var horizontal = (position.split("-")[1] || "right") === "left" ? "left" : "right";
  var vertical = position.split("-")[0] === "top" ? "top" : "bottom";

  var styles = `
    #obc-launcher {
      position: fixed;
      ${vertical}: 24px;
      ${horizontal}: 24px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      height: 56px;
      padding: 0 22px 0 18px;
      border: none;
      border-radius: 999px;
      background: ${primaryColor};
      color: #fff;
      font: 600 16px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      box-shadow: 0 6px 24px rgba(0,0,0,0.25);
      z-index: 2147483000;
      transition: transform 0.15s, box-shadow 0.15s, opacity 0.2s;
      white-space: nowrap;
    }
    #obc-launcher:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(0,0,0,0.3); }
    #obc-launcher.obc-hidden { opacity: 0; pointer-events: none; transform: translateY(8px); }
    #obc-panel {
      position: fixed;
      top: 0;
      ${horizontal}: 0;
      height: 100%;
      width: min(${panelWidth}px, 100vw);
      background: #fff;
      box-shadow: ${horizontal === "right" ? "-12px" : "12px"} 0 40px rgba(0,0,0,0.18);
      z-index: 2147483001;
      transform: translateX(${horizontal === "right" ? "100%" : "-100%"});
      transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
      display: flex;
      flex-direction: column;
    }
    #obc-panel.obc-open { transform: translateX(0); }
    /* Picture-in-picture while the avatar is live: the panel becomes a small
       floating video in the corner so the page stays usable. The iframe is
       untouched, so the stream inside it survives. */
    #obc-panel.obc-open.obc-mini {
      top: auto;
      ${vertical}: 24px;
      ${horizontal}: 24px;
      height: 200px;
      width: 320px;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
      transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.25s, height 0.25s, border-radius 0.25s;
    }
    #obc-panel.obc-mini #obc-panel-close { display: none; }
    @media (max-width: 480px) {
      #obc-panel.obc-open.obc-mini { width: 60vw; height: calc(60vw * 0.6); ${horizontal}: 12px; ${vertical}: 12px; }
    }
    #obc-panel-close {
      position: absolute;
      top: 8px;
      ${horizontal === "right" ? "right" : "left"}: 8px;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: rgba(255,255,255,0.85);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
    #obc-panel-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
    #obc-widget-iframe { width: 100%; height: 100%; border: none; display: block; flex: 1; }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var sparkle = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"/><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z"/><path d="M5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z"/></svg>';
  var closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  // Launcher pill: the only thing on the host page until it is clicked.
  var launcher = document.createElement("button");
  launcher.id = "obc-launcher";
  launcher.type = "button";
  var labelEl = document.createElement("span");
  labelEl.textContent = launcherLabel || "Ask us";
  launcher.innerHTML = sparkle;
  launcher.appendChild(labelEl);
  launcher.setAttribute("aria-label", "Open chat");
  launcher.setAttribute("aria-expanded", "false");

  // Side panel with the chat iframe. The panel exists from the start (so the
  // slide-in is instant) but the iframe is created on first open, so nothing
  // loads, and no avatar can ever start, before the visitor asks for it.
  var panel = document.createElement("div");
  panel.id = "obc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat");
  var closeBtn = document.createElement("button");
  closeBtn.id = "obc-panel-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = closeIcon;
  closeBtn.setAttribute("aria-label", "Close chat");
  panel.appendChild(closeBtn);

  var iframe = null;
  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.id = "obc-widget-iframe";
    iframe.src = baseUrl + "/embed/" + botId + "?origin=" + encodeURIComponent(window.location.origin);
    iframe.title = "Chat";
    // microphone: the optional voice avatar starts the mic on click; without
    // this delegation the browser silently refuses inside the iframe.
    // autoplay: the avatar's audio/video track must start without a second tap.
    iframe.allow = "clipboard-write; microphone; autoplay";
    panel.appendChild(iframe);
  }

  var isOpen = false;
  function recordWidgetEvent(type) {
    try {
      fetch(baseUrl + "/api/public/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: botId, type: type, origin: window.location.origin }),
        keepalive: true
      });
    } catch { /* analytics must never affect chat availability */ }
  }
  var isMini = false;
  function applyPanelClass() {
    panel.className = (isOpen ? "obc-open" : "") + (isOpen && isMini ? " obc-mini" : "");
  }
  function setOpen(next) {
    isOpen = next;
    if (isOpen) ensureIframe();
    if (!isOpen) isMini = false;
    applyPanelClass();
    // Tell the embed when it is hidden so a live voice session ends instead
    // of streaming (and billing) invisibly.
    if (!isOpen && iframe && iframe.contentWindow) {
      try { iframe.contentWindow.postMessage({ type: "obc:panel", open: false }, baseUrl); } catch { /* ignore */ }
    }
    launcher.className = isOpen ? "obc-hidden" : "";
    launcher.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      recordWidgetEvent("widget.opened");
      closeBtn.focus();
    } else {
      launcher.focus();
    }
  }
  launcher.addEventListener("click", function () { setOpen(true); });
  closeBtn.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) setOpen(false); });

  // Messages from the embed (origin-checked). "obc:ready" carries the bot
  // name for the pill; "obc:layout" asks for picture-in-picture or the full
  // panel while a voice session is live.
  window.addEventListener("message", function (event) {
    if (event.origin !== baseUrl) return;
    var data = event.data;
    if (!data) return;
    if (data.type === "obc:layout") {
      isMini = data.layout === "mini";
      applyPanelClass();
      return;
    }
    if (data.type !== "obc:ready" || launcherLabel) return;
    if (typeof data.botName === "string" && data.botName.trim()) {
      labelEl.textContent = "Ask " + data.botName.trim();
      launcher.setAttribute("aria-label", "Open chat with " + data.botName.trim());
    }
  });

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  // Warm the label without opening: a hidden, mic-less probe is not worth the
  // extra load, so ask the API for the name instead (best effort, same origin
  // rules as the chat itself).
  if (!launcherLabel) {
    try {
      fetch(baseUrl + "/api/public/bot/" + encodeURIComponent(botId) + "?origin=" + encodeURIComponent(window.location.origin))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          var name = d && d.bot && d.bot.name;
          if (typeof name === "string" && name.trim()) {
            labelEl.textContent = "Ask " + name.trim();
            launcher.setAttribute("aria-label", "Open chat with " + name.trim());
          }
        })
        .catch(function () { /* keep the fallback label */ });
    } catch { /* keep the fallback label */ }
  }
})();
