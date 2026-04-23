import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const conversions = await prisma.conversion.findMany({
    where: { shop: session.shop }
  });

  const totalSales = conversions.reduce((sum: number, c: any) => sum + c.orderTotal, 0);
  const totalAppCommissions = conversions.reduce((sum: number, c: any) => sum + c.commissionApp, 0);
  const totalAffiliateCommissions = conversions.reduce((sum: number, c: any) => sum + c.commissionAffiliate, 0);

  return {
    totalSales,
    totalAppCommissions,
    totalAffiliateCommissions
  };
};

export default function Index() {
  const metrics = useLoaderData<typeof loader>();

  return (
    <s-page heading="Affiliate & Commission Engine">
      <s-section heading="Dashboard de Rendimiento">
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
