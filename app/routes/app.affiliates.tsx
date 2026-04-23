import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const affiliates = await prisma.affiliate.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });
  return { affiliates };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const affiliateIdentifier = formData.get("affiliateIdentifier")?.toString().trim();
    const commissionPercentage = parseFloat(formData.get("commissionPercentage")?.toString() || "0");

    if (!affiliateIdentifier || isNaN(commissionPercentage) || commissionPercentage <= 0) {
      return { error: "Datos inválidos" };
    }

    try {
      await prisma.affiliate.create({
        data: {
          shop: session.shop,
          affiliateIdentifier: affiliateIdentifier.toUpperCase(),
          commissionPercentage,
        },
      });
      return { success: true };
    } catch (error) {
      return { error: "Este identificador ya existe" };
    }
  }

  if (intent === "delete") {
    const id = formData.get("id")?.toString();
    if (id) {
      await prisma.affiliate.delete({
        where: { id, shop: session.shop },
      });
      return { success: true };
    }
  }

  return { error: "Bad intent" };
};

export default function Affiliates() {
  const { affiliates } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const isLoading = nav.state === "submitting";

  const handleDelete = (id: string) => {
    if (confirm("¿Seguro que deseas eliminar este afiliado? Sus registros de ventas se perderán.")) {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("id", id);
      submit(formData, { method: "post" });
    }
  };

  return (
    <s-page heading="Gestión de Afiliados">
      <s-section heading="Crear nuevo afiliado">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="surface">
          <Form method="post">
            <input type="hidden" name="intent" value="create" />
            <div style={{ display: "flex", gap: "16px", alignItems: "end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Identificador Único (ej: SMART26)</label>
                <input 
                  type="text" 
                  name="affiliateIdentifier" 
                  required 
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
              </div>
              <div style={{ width: "150px" }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Comisión (%)</label>
                <input 
                  type="number" 
                  name="commissionPercentage" 
                  step="0.1" 
                  min="0.1"
                  required 
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
              </div>
              <div>
                <s-button type="submit" variant="primary" loading={isLoading ? "true" : undefined}>
                  Añadir Afiliado
                </s-button>
              </div>
            </div>
          </Form>
        </s-box>
      </s-section>

      <s-section heading="Listado de Afiliados">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="surface">
          {affiliates.length === 0 ? (
            <s-paragraph>No tienes afiliados creados todavía.</s-paragraph>
          ) : (
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: "12px 8px" }}>Identificador</th>
                  <th style={{ padding: "12px 8px" }}>Comisión</th>
                  <th style={{ padding: "12px 8px" }}>Fecha Registro</th>
                  <th style={{ padding: "12px 8px" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((affiliate: any) => (
                  <tr key={affiliate.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px 8px" }}>
                      <strong>{affiliate.affiliateIdentifier}</strong><br/>
                      <span style={{ fontSize: "12px", color: "gray" }}>?ref={affiliate.affiliateIdentifier}</span>
                    </td>
                    <td style={{ padding: "12px 8px" }}>{affiliate.commissionPercentage}%</td>
                    <td style={{ padding: "12px 8px" }}>{new Date(affiliate.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <s-button variant="destructive" onClick={() => handleDelete(affiliate.id)}>
                        Borrar
                      </s-button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = boundary.headers;
