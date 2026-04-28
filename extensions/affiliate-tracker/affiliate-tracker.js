"use strict";
(() => {
  // ../../node_modules/@shopify/web-pixels-extension/build/esm/globals.mjs
  var EXTENSION_POINT = "WebPixel::Render";

  // ../../node_modules/@shopify/web-pixels-extension/build/esm/register.mjs
  var register = (extend) => shopify.extend(EXTENSION_POINT, extend);

  // src/index.ts
  register(({ analytics, browser, settings }) => {
    analytics.subscribe("page_viewed", async (event) => {
      try {
        const url = new URL(event.context.document.location.href);
        const ref = url.searchParams.get("ref");
        if (ref) {
          await browser.localStorage.setItem("affiliate_ref", ref);
          console.log("[Affiliate Tracker] Afiliado guardado:", ref);
        }
      } catch (e) {
        console.error("Error procesando page_viewed", e);
      }
    });
    analytics.subscribe("checkout_completed", async (event) => {
      try {
        const ref = await browser.localStorage.getItem("affiliate_ref");
        if (ref) {
          const orderId = event.data?.checkout?.order?.id;
          const orderTotal = event.data?.checkout?.subtotalPrice?.amount;
          const shopDomain = event.context.document.location.hostname;
          const appUrl = settings?.appUrl;
          if (!appUrl) {
            console.error("[Affiliate Tracker] No App URL configured.");
            return;
          }
          console.log("[Affiliate Tracker] Enviando compra al afiliado:", ref);
          await fetch(`${appUrl}/api/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            // importante para que no se cancele si el usuario cierra la pestaña rápido
            body: JSON.stringify({
              shop: shopDomain,
              affiliateIdentifier: ref,
              orderId,
              orderTotal
            })
          });
        }
      } catch (e) {
        console.error("Error procesando checkout_completed", e);
      }
    });
  });
})();
