import {register} from "@shopify/web-pixels-extension";

register(({ analytics, browser, settings }) => {
    // 1. Interceptar page_view para capturar el afiliado
    analytics.subscribe('page_viewed', async (event) => {
        try {
            const url = new URL(event.context.document.location.href);
            const ref = url.searchParams.get('ref');
            
            if (ref) {
                // Guardar en el almacenamiento del navegador de forma segura
                await browser.localStorage.setItem('affiliate_ref', ref);
                console.log('[Affiliate Tracker] Afiliado guardado:', ref);
            }
        } catch (e) {
            console.error('Error procesando page_viewed', e);
        }
    });

    // 2. Escuchar cuando se completa una compra
    analytics.subscribe('checkout_completed', async (event) => {
        try {
            const ref = await browser.localStorage.getItem('affiliate_ref');
            
            if (ref) {
                const orderId = event.data?.checkout?.order?.id;
                const orderTotal = event.data?.checkout?.subtotalPrice?.amount;
                const shopDomain = event.context.document.location.hostname; // ej: tu-tienda.myshopify.com
                
                const appUrl = settings?.appUrl as string;
                
                if (!appUrl) {
                    console.error('[Affiliate Tracker] No App URL configured.');
                    return;
                }

                console.log('[Affiliate Tracker] Enviando compra al afiliado:', ref);

                // Enviar la data a nuestro servidor
                await fetch(`${appUrl}/api/track`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true, // importante para que no se cancele si el usuario cierra la pestaña rápido
                    body: JSON.stringify({
                        shop: shopDomain,
                        affiliateIdentifier: ref,
                        orderId: orderId,
                        orderTotal: orderTotal
                    })
                });

                // (Opcional) Limpiar el afiliado si solo queremos que gane por la primera compra
                // await browser.localStorage.removeItem('affiliate_ref');
            }
        } catch (e) {
            console.error('Error procesando checkout_completed', e);
        }
    });
});
