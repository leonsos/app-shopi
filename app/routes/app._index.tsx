import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  // 1. Obtener los datos de conversiones
  const conversions = await prisma.conversion.findMany({
    where: { shop: session.shop }
  });

  const totalSales = conversions.reduce((sum: number, c: any) => sum + c.orderTotal, 0);
  const totalAppCommissions = conversions.reduce((sum: number, c: any) => sum + c.commissionApp, 0);
  const totalAffiliateCommissions = conversions.reduce((sum: number, c: any) => sum + c.commissionAffiliate, 0);

  // 2. Verificar y Conectar el Web Pixel Automáticamente
  let pixelConnected = false;
  let pixelError = null;
  
  let existingPixelId = null;
  try {
    const pixelQuery = await admin.graphql(`
      query {
        webPixel {
          id
        }
      }
    `);
    const pixelData = await pixelQuery.json();
    if (pixelData.data?.webPixel?.id) {
      existingPixelId = pixelData.data.webPixel.id;
    }
  } catch (e: any) {
    // Si da error, asumimos que no existe
    existingPixelId = null;
  }
    
  const url = new URL(request.url);
  // Forzamos HTTPS porque los Web Pixels no permiten peticiones HTTP en producción/túneles
  const appUrl = `https://${url.host}`;

  if (!existingPixelId) {
    try {
      const createMutation = await admin.graphql(
        `#graphql
        mutation webPixelCreate($webPixel: WebPixelInput!) {
          webPixelCreate(webPixel: $webPixel) {
            userErrors {
              field
              message
            }
            webPixel {
              id
            }
          }
        }`,
        {
          variables: {
            webPixel: {
              settings: JSON.stringify({ appUrl: appUrl })
            }
          }
        }
      );
      const createData = await createMutation.json();
      if (createData.data?.webPixelCreate?.webPixel) {
        pixelConnected = true;
      } else {
        pixelError = JSON.stringify(createData.data?.webPixelCreate?.userErrors);
      }
    } catch (error: any) {
      pixelError = error.message || "Error desconocido al crear el pixel";
    }
  } else {
    // Si ya existe, lo actualizamos para asegurarnos de que tenga el appUrl correcto (HTTPS)
    try {
      const updateMutation = await admin.graphql(
        `#graphql
        mutation webPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
          webPixelUpdate(id: $id, webPixel: $webPixel) {
            userErrors {
              field
              message
            }
            webPixel {
              id
            }
          }
        }`,
        {
          variables: {
            id: existingPixelId,
            webPixel: {
              settings: JSON.stringify({ appUrl: appUrl })
            }
          }
        }
      );
      const updateData = await updateMutation.json();
      if (updateData.data?.webPixelUpdate?.webPixel) {
        pixelConnected = true;
      } else {
        pixelError = JSON.stringify(updateData.data?.webPixelUpdate?.userErrors);
      }
    } catch (error: any) {
      pixelError = error.message || "Error desconocido al actualizar el pixel";
    }
  }

  return {
    totalSales,
    totalAppCommissions,
    totalAffiliateCommissions,
    pixelConnected,
    pixelError
  };
};

export default function Index() {
  const metrics = useLoaderData<typeof loader>();

  return (
    <s-page heading="Affiliate & Commission Engine">
      <s-section heading="Dashboard de Rendimiento">
        
        {!metrics.pixelConnected && (
          <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "#ffebee", border: "1px solid #ef5350", borderRadius: "4px", color: "#c62828" }}>
            <strong>⚠ Problema con el Web Pixel:</strong> El rastreador no pudo conectarse.
            <br />
            <small>Error: {metrics.pixelError}</small>
          </div>
        )}
        
        {metrics.pixelConnected && (
          <div style={{ padding: "12px", marginBottom: "16px", backgroundColor: "#e8f5e9", border: "1px solid #4caf50", borderRadius: "4px", color: "#2e7d32" }}>
            <strong>✔ Píxel Conectado:</strong> El sistema de tracking está activo y escuchando ventas.
          </div>
        )}

        <s-paragraph>
          Bienvenido al sistema de afiliados. Aquí puedes ver el resumen de las ventas generadas a través de tus afiliados.
        </s-paragraph>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px', marginBottom: '24px' }}>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="surface">
            <h3 style={{ margin: "0 0 8px 0", color: "#666" }}>Ventas Referidas</h3>
            <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>${metrics.totalSales.toFixed(2)}</p>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="surface">
            <h3 style={{ margin: "0 0 8px 0", color: "#666" }}>Comisión Afiliados (a pagar)</h3>
            <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>${metrics.totalAffiliateCommissions.toFixed(2)}</p>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="surface">
            <h3 style={{ margin: "0 0 8px 0", color: "#1a5e20" }}>Comisión App (Facturada)</h3>
            <p style={{ margin: 0, fontSize: "24px", fontWeight: "bold", color: "#1a5e20" }}>${metrics.totalAppCommissions.toFixed(2)}</p>
          </s-box>
        </div>

        <s-stack direction="inline" gap="base">
          <s-button variant="primary" url="/app/affiliates">
            Gestionar Afiliados
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
