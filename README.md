# ⚡ Order Integration Hub + Operations Web Portal

Plataforma empresarial de integración, normalización y monitoreo de pedidos multicanal con consola web administrativa en tiempo real.

Desarrollado en **Go (REST API + Worker/Scheduler)**, **PostgreSQL 16**, **Angular 18** y **Docker Compose**.

---

## 🏛️ Arquitectura del Sistema

```
                          +------------------------------------------+
                          |         Angular 18 Admin Portal          |
                          |  (Dashboard, Integrations, Customers,    |
                          |   Sync Jobs, Logs, Metrics, Scheduler,   |
                          |   Alerts, Audit, Users, Notifications)   |
                          +--------------------+---------------------+
                                               | HTTP / REST (JWT)
                                               v
+---------------------------------------------------------------------------------------+
|                              Go Application & Services                                |
|                                                                                       |
|  +-----------------------------------+       +-------------------------------------+  |
|  |             order-api             |       |            order-worker             |  |
|  |  * REST Endpoints (Admin API)     |       |  * Scheduled Poller & Engine        |  |
|  |  * JWT Auth & RBAC Middleware     |       |  * Multi-provider Adapters:         |  |
|  |  * Audit Log Interceptor          |       |    WooCommerce, SAP, Odoo, BSALE    |  |
|  |  * Manual Sync & Test Trigger     |       |  * Concurrency Locking & Retries    |  |
|  |  * Metrics & Reporting Service    |       |  * Alert Evaluator & Cooldown       |  |
|  |  * Notification Service           |       |  * SMTP Email Dispatcher            |  |
|  +-----------------------------------+       +-------------------------------------+  |
|                                       \     /                                         |
+----------------------------------------\---/------------------------------------------+
                                          v v
                          +--------------------+---------------------+
                          |           PostgreSQL 16                  |
                          |  * Schema, Optimized Indices & Metrics   |
                          |  * Jobs, Logs, Audit Trail, Alert Rules  |
                          +--------------------+---------------------+
                                               |
                          +--------------------+---------------------+
                          |      External Customer Endpoints         |
                          |  WooCommerce | SAP | Odoo | BSALE        |
                          +------------------------------------------+
```

---

## 🚀 Inicio Rápido con Docker Compose

Para levantar toda la plataforma con un solo comando:

```bash
docker compose up --build -d
```

### Servicios disponibles:

| Servicio | Puerto Local | Descripción |
| :--- | :--- | :--- |
| **Frontend Web Portal** | `http://localhost:4200` o `http://localhost:80` | Consola administrativa Angular 18 |
| **Go REST API Gateway** | `http://localhost:8080` | Backend API Gateway & Administrador |
| **WooCommerce Tienda 1 (Moda)** | `http://localhost:8081` | Instancia WooCommerce REST v3 en vivo (Tienda 1) |
| **WooCommerce Tienda 2 (Tech)** | `http://localhost:8083` | Instancia WooCommerce REST v3 en vivo (Tienda 2) |
| **PostgreSQL 16** | `localhost:5433` (interno 5432) | Base de datos relacional con migraciones automáticas |

---

## 🔑 Credenciales de Acceso por Defecto

El sistema incluye un seeder con 3 perfiles con distintos roles y permisos:

| Rol | Correo Electrónico | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@orderhub.local` | `Admin123!` | Acceso total (CRUD de clientes, integraciones, secretos, usuarios y reglas) |
| **OPERATOR** | `operator@orderhub.local` | `Operator123!` | Operaciones NOC: prueba de conexión, sincronización manual y visualización |
| **VIEWER** | `viewer@orderhub.local` | `Viewer123!` | Solo lectura: Dashboard, KPIs, logs y métricas históricas |

*En la pantalla de Login se encuentran botones de acceso rápido para autenticarse con cualquiera de estos roles con 1 solo clic.*

---

## 📦 Módulos y Funcionalidades del Panel Web

### 1. Dashboard Principal
* **Indicadores KPI**: Total de clientes, integraciones activas, integraciones con error, consultas hoy, pedidos recuperados hoy, porcentaje de ejecuciones exitosas, tiempo promedio de respuesta y última sincronización global.
* **Gráficos interactivos en tiempo real (Chart.js)**:
  * Consultas por hora (Exitosas vs Fallidas)
  * Pedidos sincronizados por día (últimos 7 días)
  * Latencia promedio por proveedor
  * Distribución de volumen de consultas por proveedor
* **Tabla de "Integraciones con problemas"**:
  * Acciones instantáneas: **Probar conexión**, **Ejecutar ahora**, **Ver logs**.

### 2. Gestión de Clientes
* Listado y búsqueda por código, razón social o correo.
* Creación y edición de clientes.
* Habilitación / deshabilitación.
* Vista de detalle con integraciones asociadas, estadísticas de pedidos y errores recientes.

### 3. Gestión de Integraciones
* Adaptadores incorporados para **WooCommerce**, **SAP Business One / S4HANA**, **Odoo ERP** y **BSALE**.
* Botón **"Probar conexión"**: diagnóstico seguro en vivo contra el endpoint del proveedor con latencia, código HTTP y mensaje normalizado (sin exponer claves).
* Disparador de **"Ejecutar sincronización manual"**.
* Conmutador de polling programado y configuración de intervalo (minutos).
* Cifrado y enmascaramiento de secretos y tokens (`••••••••••••`).

### 4. Logs Centralizados
* Consulta paginada de alta velocidad sin sobrecargar el navegador.
* Filtros por: rango de fecha, cliente, integración, proveedor, nivel (`INFO`, `WARNING`, `ERROR`, `DEBUG`), `request_id`, `correlation_id` y búsqueda textual.
* Visor de payload JSON estructurado para cada registro.

### 5. Historial de Sincronizaciones (Sync Jobs)
* Seguimiento de cada ejecución programada o manual.
* Estados: `PENDING`, `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`, `CANCELLED`.
* Desglose de pedidos: encontrados, nuevos, actualizados y fallidos.
* Vista de detalle con logs paso a paso de la ejecución.

### 6. Reglas de Alertas y Deduplicación
* Disparadores configurables:
  * Falla en integración
  * N errores consecutivos
  * Latencia superior a umbral
  * Inactividad / sin sincronización por X minutos
  * Resumen diario
* **Cooldown y deduplicación inteligente**: evita saturación de correos ante caídas prolongadas.

### 7. Configuración SMTP
* Servidor host, puerto, credenciales seguras, TLS y remitente.
* Botón **"Enviar correo de prueba"** con diagnóstico inmediato de conectividad.

### 8. Notificaciones Internas
* Campana interactiva en la barra superior con contador de avisos no leídos en tiempo real.
* Bandeja dedicada para marcar avisos como leídos y revisar severidades.

### 9. Estadísticas y Métricas Operacionales
* Percentil **P95**, latencias mínimas, medias y máximas.
* Total de reintentos y timeouts.
* Desglose tabular por proveedor y por cliente con tasa de éxito individual.

### 10. Scheduler & Locking
* Monitoreo de tareas programadas y tiempo estimado para la próxima ejecución.
* **Distributed Advisory Locking**: previene ejecuciones simultáneas duplicadas de la misma integración.

### 11. Auditoría (Audit Log)
* Registro inmutable de acciones administrativas: quién modificó qué, fecha, IP de origen, valor anterior y nuevo valor (con datos sensibles redactados).

### 12. Usuarios y Seguridad (RBAC)
* Autenticación basada en JWT.
* Hashing de contraseñas con **bcrypt**.
* Control de acceso basado en roles (`ADMIN`, `OPERATOR`, `VIEWER`).

---

## 📡 Catálogo de API REST (Go)

### Autenticación
* `POST /api/v1/auth/login`: Autenticación y emisión de JWT.
* `GET /api/v1/auth/me`: Perfil del usuario autenticado.
* `POST /api/v1/auth/change-password`: Cambio de contraseña.

### Administración y Operación
* `GET /api/v1/admin/dashboard`: KPIs agregados, gráficos y conexiones con problemas.
* `GET /api/v1/admin/statistics`: Percentiles P95, métricas por proveedor y cliente.
* `GET /api/v1/admin/customers`: Listado y búsqueda de clientes.
* `POST /api/v1/admin/customers`: Registrar cliente.
* `PUT /api/v1/admin/customers/{id}`: Modificar cliente.
* `POST /api/v1/admin/customers/{id}/toggle`: Habilitar/deshabilitar cliente.
* `GET /api/v1/admin/integrations`: Listado de integraciones con filtros.
* `POST /api/v1/admin/integrations`: Crear integración.
* `PUT /api/v1/admin/integrations/{id}`: Actualizar integración.
* `DELETE /api/v1/admin/integrations/{id}`: Eliminar integración.
* `POST /api/v1/admin/integrations/{id}/test`: Probar conexión con el proveedor.
* `POST /api/v1/admin/integrations/{id}/sync`: Lanzar sincronización manual.
* `POST /api/v1/admin/integrations/{id}/toggle-polling`: Activar/pausar polling.
* `GET /api/v1/admin/sync-jobs`: Listado paginado de ejecuciones.
* `GET /api/v1/admin/sync-jobs/{id}`: Detalle de ejecución y logs específicos.
* `GET /api/v1/admin/logs`: Consulta paginada de logs con búsqueda y correlación.
* `GET /api/v1/admin/scheduler`: Tareas programadas e indicador de locks.
* `GET /api/v1/admin/alerts`: Reglas de alertas.
* `POST /api/v1/admin/alerts`: Crear regla de alerta.
* `PUT /api/v1/admin/alerts/{id}`: Modificar regla de alerta.
* `DELETE /api/v1/admin/alerts/{id}`: Eliminar regla de alerta.
* `GET /api/v1/admin/notifications`: Bandeja de notificaciones internas.
* `POST /api/v1/admin/notifications/{id}/read`: Marcar notificación como leída.
* `POST /api/v1/admin/notifications/read-all`: Marcar todas como leídas.
* `GET /api/v1/admin/smtp`: Obtener configuración SMTP.
* `POST /api/v1/admin/smtp`: Actualizar configuración SMTP.
* `POST /api/v1/admin/smtp/test`: Enviar correo de prueba.
* `GET /api/v1/admin/audit`: Trazabilidad y logs de auditoría.
* `GET /api/v1/admin/users`: Listar usuarios del sistema.
* `POST /api/v1/admin/users`: Crear usuario con rol asignado.

---

## 🛠️ Desarrollo Local

### Requisitos
* Go 1.22+
* Node.js 20+ y NPM
* PostgreSQL 16+

### 1. Iniciar Base de Datos
```bash
docker run --name order-hub-postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=order_hub -p 5432:5432 -d postgres:16-alpine
```

### 2. Ejecutar Backend (Go API & Worker)
```bash
# Servidor REST API
export DATABASE_URL="postgres://postgres:postgres123@localhost:5432/order_hub?sslmode=disable"
go run ./cmd/api

# En otra terminal: Worker / Scheduler
export DATABASE_URL="postgres://postgres:postgres123@localhost:5432/order_hub?sslmode=disable"
go run ./cmd/worker
```

### 3. Ejecutar Frontend (Angular)
```bash
cd frontend
npm install
npm run start
```
El portal estará disponible en `http://localhost:4200`.

### 4. Ejecutar Pruebas
```bash
# Pruebas backend Go
go test -v ./...

# Compilación Frontend
cd frontend && npm run build
```
