import { type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

export const loader = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  return new Response("Not Found", { status: 404, headers: corsHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // CORS: Permitir llamadas desde la tienda de Shopify
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    console.log("\n--- [TRACK API] NUEVA VENTA RECIBIDA ---");
    console.log("Payload:", body);

    const { shop, affiliateIdentifier, orderId, orderTotal } = body;

    if (!shop || !affiliateIdentifier || !orderId || orderTotal == null) {
      console.log("[TRACK API] Error: Faltan campos obligatorios");
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios" }), { status: 400, headers: corsHeaders });
    }

    // 1. Buscar al afiliado (Búsqueda más flexible con contains por si el dominio varía)
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        shop: { contains: shop.replace('.myshopify.com', '') },
        affiliateIdentifier,
      },
    });

    if (!affiliate) {
      console.log("[TRACK API] Error: Afiliado no encontrado para shop:", shop);
      return new Response(JSON.stringify({ error: "Afiliado no encontrado" }), { status: 404, headers: corsHeaders });
    }

    console.log("[TRACK API] Afiliado encontrado:", affiliate.id);

    // 2. Comprobar si ya procesamos esta orden (idempotencia)
    const existingConversion = await prisma.conversion.findFirst({
      where: { shop: affiliate.shop, orderId },
    });

    if (existingConversion) {
      console.log("[TRACK API] La orden ya fue procesada");
      return new Response(JSON.stringify({ message: "La orden ya fue procesada anteriormente" }), { status: 200, headers: corsHeaders });
    }

    // 3. Calcular comisiones
    const total = parseFloat(orderTotal);
    const commissionAffiliate = total * (affiliate.commissionPercentage / 100);
    const commissionApp = total * 0.05; // 5% flat fee para la app (Requisito del reto)

    // 4. Crear Usage Record en Shopify (Cobrar al merchant el 5%)
    let usageRecordId = null;
    try {
      const { admin } = await unauthenticated.admin(shop);
      
      // 4.a Encontrar la suscripción activa del merchant
      const subQuery = await admin.graphql(
        `#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              lineItems {
                id
                plan {
                  pricingDetails {
                    ... on AppUsagePricing {
                      balanceUsed {
                        amount
                      }
                      cappedAmount {
                        amount
                      }
                    }
                  }
                }
              }
            }
          }
        }`
      );
      
      const subQueryData = await subQuery.json();
      const activeSubscription = subQueryData.data.currentAppInstallation.activeSubscriptions.find(
        (s: any) => s.name === "Comisión por Venta"
      );

      if (activeSubscription) {
        // Extraemos el ID de la línea de facturación por uso
        const subscriptionLineItemId = activeSubscription.lineItems[0].id;

        // 4.b Crear el Usage Record oficial de Shopify
        const usageMutation = await admin.graphql(
          `#graphql
          mutation appUsageRecordCreate($description: String!, $price: MoneyInput!, $subscriptionLineItemId: ID!) {
            appUsageRecordCreate(description: $description, price: $price, subscriptionLineItemId: $subscriptionLineItemId) {
              userErrors {
                field
                message
              }
              appUsageRecord {
                id
              }
            }
          }`,
          {
            variables: {
              subscriptionLineItemId,
              price: {
                amount: commissionApp.toFixed(2), // Nos aseguramos de enviar 2 decimales
                currencyCode: "USD"
              },
              description: `Comisión 5% por venta referida (Afiliado: ${affiliateIdentifier})`
            }
          }
        );

        const usageData = await usageMutation.json();
        
        if (usageData.data.appUsageRecordCreate.appUsageRecord) {
          usageRecordId = usageData.data.appUsageRecordCreate.appUsageRecord.id;
          console.log(`[Billing] Cobro de uso exitoso. Record ID: ${usageRecordId}`);
        } else {
          console.error("[Billing] Error creando usage record:", usageData.data.appUsageRecordCreate.userErrors);
        }
      }
    } catch (e) {
      console.error("[Billing] Error conectando a Shopify Admin:", e);
    }

    // 5. Guardar en nuestra base de datos local
    await prisma.conversion.create({
      data: {
        shop,
        affiliateId: affiliate.id,
        orderId,
        orderTotal: total,
        commissionApp,
        commissionAffiliate,
        usageRecordId,
      },
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error("Webhook/API processing error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
};
