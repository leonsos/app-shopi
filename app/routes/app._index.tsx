import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Affiliate & Commission Engine">
      <s-section heading="Dashboard">
        <s-paragraph>
          Bienvenido al sistema de afiliados. Aquí pronto verás las métricas de tus campañas.
        </s-paragraph>
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

