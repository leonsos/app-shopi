import { type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { z } from "zod";

const TrackPayloadSchema = z.object({
  shop: z.string().min(1),
  affiliateIdentifier: z.string().min(1),
  orderId: z.string().min(1),
  orderTotal: z.any().optional(),
});

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

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const result = TrackPayloadSchema.safeParse(body);
    
    if (!result.success) {
      return new Response(JSON.stringify({ error: "Invalid data" }), { status: 400, headers: corsHeaders });
    }

    const { shop, affiliateIdentifier, orderId } = result.data;

    const affiliate = await prisma.affiliate.findFirst({
      where: {
        shop: { contains: shop.replace('.myshopify.com', '') },
        affiliateIdentifier,
      },
    });

    if (!affiliate) {
      return new Response(JSON.stringify({ error: "Affiliate not found" }), { status: 404, headers: corsHeaders });
    }

    const existingConversion = await prisma.conversion.findFirst({
      where: { shop: affiliate.shop, orderId },
    });

    if (existingConversion) {
      return new Response(JSON.stringify({ message: "Order already processed" }), { status: 200, headers: corsHeaders });
    }

    let adminContext;
    let total = body.orderTotal ? parseFloat(body.orderTotal) : 0;

    try {
      adminContext = await unauthenticated.admin(shop);
      const formattedOrderId = orderId.includes("gid://") ? orderId : `gid://shopify/Order/${orderId}`;

      const orderQuery = await adminContext.admin.graphql(
        `#graphql
        query getOrderTotal($id: ID!) {
          order(id: $id) {
            subtotalPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }`,
        {
          variables: { id: formattedOrderId }
        }
      );
      
      const orderData = await orderQuery.json();
      const realTotal = orderData.data?.order?.subtotalPriceSet?.shopMoney?.amount;
      
      if (realTotal) {
        total = parseFloat(realTotal);
      }
    } catch (e) {
      console.error("[TRACK API] Error verifying order with Shopify API. Using fallback.", e);
    }

    if (!total || total <= 0) {
      return new Response(JSON.stringify({ error: "Invalid order total" }), { status: 400, headers: corsHeaders });
    }

    const commissionAffiliate = total * (affiliate.commissionPercentage / 100);
    const commissionApp = total * 0.05;

    let usageRecordId = null;
    
    try {
      const subQuery = await adminContext.admin.graphql(
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
                      balanceUsed { amount }
                      cappedAmount { amount }
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
        const subscriptionLineItemId = activeSubscription.lineItems[0].id;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            const usageMutation = await adminContext.admin.graphql(
              `#graphql
              mutation appUsageRecordCreate($description: String!, $price: MoneyInput!, $subscriptionLineItemId: ID!) {
                appUsageRecordCreate(description: $description, price: $price, subscriptionLineItemId: $subscriptionLineItemId) {
                  userErrors { field message }
                  appUsageRecord { id }
                }
              }`,
              {
                variables: {
                  subscriptionLineItemId,
                  price: {
                    amount: commissionApp.toFixed(2),
                    currencyCode: "USD"
                  },
                  description: `Comisión 5% por venta referida (Afiliado: ${affiliateIdentifier})`
                }
              }
            );

            const usageData = await usageMutation.json();
            
            if (usageData.errors?.some((e: any) => e.extensions?.code === 'THROTTLED')) {
              throw new Error("THROTTLED");
            }

            if (usageData.data?.appUsageRecordCreate?.appUsageRecord) {
              usageRecordId = usageData.data.appUsageRecordCreate.appUsageRecord.id;
            }
            break;
          } catch (e: any) {
            attempts++;
            if (e.message === "THROTTLED" || e.response?.status === 429) {
              if (attempts === maxAttempts) break;
              await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempts)));
            } else {
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("[Billing] Error connecting to Shopify Admin for usage record:", e);
    }

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
