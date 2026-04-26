# Affiliate & Commission Engine - Shopify App

Esta es la solución al desafío técnico para el MVP del Motor de Afiliados y Comisiones para Shopify. La aplicación permite a los comerciantes rastrear ventas provenientes de enlaces de afiliados (`?ref=IDENTIFICADOR`) mediante un Web Pixel, y cobra una comisión fija del 5% al comerciante utilizando la API de Billing de Shopify (Usage Records).

## 🚀 Instrucciones de Ejecución Local

1. **Instalación de dependencias:**
   ```bash
   npm install
   ```

2. **Configuración de Base de Datos:**
   La app usa SQLite por defecto para desarrollo local. Genera el cliente y corre las migraciones:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

3. **Ejecución del Servidor:**
   ```bash
   npm run dev
   ```
   Esto levantará el túnel de Cloudflare y sincronizará la configuración de la app (incluyendo el Web Pixel) con tu entorno de desarrollo en Shopify.

4. **Instalación en Tienda:**
   Sigue el enlace generado en la consola para instalar la app en tu tienda de desarrollo. Acepta los cargos de facturación (test).
   
5. **Prueba de Tracking:**
   Visita tu tienda desde un navegador normal usando `?ref=TUIDAFILIADO`. Agrega un producto y realiza el checkout. El Web Pixel registrará la venta, facturará el 5% y actualizará el Dashboard.

---

## 🏗️ Decisiones de Arquitectura y Escalabilidad

### 1. ¿Por qué esta estructura?
Se optó por el stack oficial de Shopify (React Router / Remix + Prisma) porque ofrece la mejor integración con App Bridge, autenticación nativa por tokens de sesión y manejo optimizado de rutas (loaders y actions). El Web Pixel Extension se utiliza para no depender de ScriptTags (que están deprecados) y para acceder al entorno seguro del checkout de Shopify, cumpliendo con los estándares actuales (2026).

### 2. Base de Datos: Esquema Actual y Escalabilidad
**Esquema Actual:** Usamos `SQLite` temporalmente por simplicidad en el desarrollo local. El esquema contiene modelos para `Session` (Shopify), `Affiliate` (los referidores) y `Conversion` (registro de ventas y comisiones).

**Migración para Alta Concurrencia (PostgreSQL):**
Para soportar millones de eventos, migraría a **PostgreSQL**.
* **Integridad:** Las restricciones `@@unique([shop, orderId])` en la tabla de Conversiones garantizan que una orden no se procese dos veces (Idempotencia en la base de datos).
* **Rapidez bajo carga:** Implementaría *Connection Pooling* (como PgBouncer) para evitar agotar las conexiones de la base de datos durante picos de tráfico (ej. Black Friday). Agregaría índices B-Tree en columnas de búsqueda frecuente como `affiliateIdentifier` y `shop`.

### 3. Asincronía e Idempotencia
El endpoint `/api/track` actualmente procesa el cobro (Billing API) de forma síncrona. 
**Para escalar:** Este endpoint debería ser estrictamente asíncrono. Al recibir el evento, la app debería simplemente guardarlo en una cola de mensajes en memoria (ej. **Redis + BullMQ** o AWS SQS) y responder un `200 OK` inmediato. Un *Worker* en segundo plano tomaría los eventos de la cola, verificaría la idempotencia (si la orden ya existe en DB), y realizaría la mutación GraphQL pesada hacia Shopify para el UsageRecord.

### 4. Manejo de Errores GraphQL (Rate Limits)
Shopify utiliza el algoritmo *Leaky Bucket* para sus límites de API. 
* Si se excede el límite, la API responde con un error de Throttling.
* La solución implementada en producción consistiría en envolver las llamadas GraphQL en un sistema de reintentos con **Exponential Backoff** (esperar 1s, luego 2s, luego 4s) antes de fallar definitivamente. Las colas de BullMQ manejan esto nativamente.

---

## 🛠️ DevOps y Pipeline de Despliegue

### Gestión de Entornos y Partner Dashboard
Mantengo un aislamiento estricto de entornos creando **tres aplicaciones distintas** en el Shopify Partner Dashboard:
1. `App - Dev`: Usada por los desarrolladores localmente con túneles (Cloudflare/Ngrok) instalada en tiendas de desarrollo.
2. `App - Staging`: Desplegada en la nube con su propia URL y base de datos de pruebas. Instalada en tiendas de QA para validación antes del pase a producción.
3. `App - Prod`: La aplicación real orientada al cliente.
Cada entorno maneja de forma independiente sus credenciales (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`).

### Pipelines de CI/CD (GitHub Actions)
Antes de un despliegue seguro a producción, el pipeline ejecutaría:
1. **Lint & Format Check:** `npm run lint` y `prettier`.
2. **Type Checking:** `tsc --noEmit` para validar TypeScript.
3. **Tests:** Pruebas unitarias de la lógica de comisiones (Vitest) y tests E2E del panel administrativo (Playwright).
4. **Build:** Construcción del bundle de React Router y del Web Pixel.
5. **Deploy:** Despliegue del código a la infraestructura de hosting y sincronización automática de extensiones usando `shopify app deploy`.

### Estrategia de Despliegue
Para desplegar esta app y soportar alta concurrencia, la mejor opción hoy en día es una **Plataforma Serverless / Edge** (como Vercel, Fly.io o Render) en lugar de un VPS tradicional:
* **Docker / Infra:** En Fly.io o Render, usaría un `Dockerfile` optimizado (basado en Alpine) aislando el *build stage* del *production stage* para reducir el tamaño de la imagen.
* **Manejo de Secretos:** Los secretos nunca se envían al repositorio. Se usaría un gestor como Doppler, AWS Secrets Manager o las variables integradas de Vercel/Fly.io. Estos sistemas permiten rotación de secretos sin reconstruir la app, simplemente reiniciando los contenedores.
* **Monitoreo:** Integración con herramientas como Datadog o Sentry para rastrear excepciones, tiempos de respuesta de la API y monitorear los fallos del Web Pixel desde el frontend de los clientes.

### Seguridad y Validaciones
* **Integridad:** Las mutaciones y queries de la interfaz web utilizan los Session Tokens inyectados por App Bridge. 
* **Sanitización:** Todo input recibido en `/api/track` y en los formularios del admin se valida utilizando `Zod` antes de tocar la base de datos o ejecutar una consulta.

---

## 📹 Demo en Video

*(Colocar aquí el enlace de Loom / YouTube oculto con los 3 a 5 minutos requeridos por la prueba, mostrando: creación del afiliado, compra, generación de cobro, y explicación hablada de decisiones).*
