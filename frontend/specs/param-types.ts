/**
 * TIPOS DE QUERY PARAMS
 *
 * Espejo de /docs → <ruta> → Parameters para los endpoints usados por las tres
 * funcionalidades del entregable. Origen backend: backend/app/routes.py.
 *
 * Reglas de modelado:
 * - Todos los parámetros de abajo son `required: false` en OpenAPI, así que todos los campos
 *   aquí son OPCIONALES (`?:`). Una clave ausente significa "no se envía" y el backend aplica
 *   su propio default.
 * - El `anyOf: [<tipo>, null]` de OpenAPI se modela SIN `| null`. El llamador construye un query
 *   string; "ausente" es el único estado "sin valor". Nunca enviar un `null` literal.
 * - Los parámetros de fecha son `string` (ISO `YYYY-MM-DD`), igual que el `format: date` de OpenAPI.
 * - Estos tipos describen SOLO el contrato de la API. Las restricciones exclusivas de la UI
 *   (p. ej. el rango del slider de threshold) se documentan en comentarios y en components.md,
 *   y NO deben codificarse como tipos más estrechos aquí.
 */

import {
  type BusinessType,
  type Category,
  type GroupBy,
  type OperationType,
} from './api-types'

// ─────────────────────────────────────────────────────────────────────────────────
// GET /api/metrics
// /docs → GET /api/metrics → Parameters ; routes.py:248-254
// Usado por: Feature 1 (filtro de rango de fechas del dashboard).
// NOTA: este endpoint NO acepta `business_type`.
// ─────────────────────────────────────────────────────────────────────────────────

export interface MetricsQueryParams {
  /** ISO `YYYY-MM-DD`. Límite inferior inclusivo (el filtro es `create_date >= start_date`). */
  start_date?: string
  /** ISO `YYYY-MM-DD`. Límite superior inclusivo (el filtro es `create_date <= end_date`). */
  end_date?: string
  category?: Category
  operation_type?: OperationType
}

// ─────────────────────────────────────────────────────────────────────────────────
// GET /api/metrics/facets
// /docs → GET /api/metrics/facets — SIN query parameters.
// Pasar cualquier query param (p. ej. `business_type`) devuelve 200 y se ignora en silencio.
// ─────────────────────────────────────────────────────────────────────────────────

export type MetricsFacetsQueryParams = Record<string, never>

// ─────────────────────────────────────────────────────────────────────────────────
// GET /api/metrics/summary
// /docs → GET /api/metrics/summary → Parameters ; routes.py:268-284
// Usado por: Feature 1 (vista agregada por período) y Feature 3 (cross-check del total de ingresos del grupo).
// ─────────────────────────────────────────────────────────────────────────────────

export interface MetricsSummaryQueryParams {
  /** Default de la API: 'month'. Cambia el formato de la etiqueta `period` en la respuesta. */
  group_by?: GroupBy
  start_date?: string
  end_date?: string
  category?: Category
  operation_type?: OperationType
  /**
   * Filtra la agregación a un solo segmento. Los items de la respuesta (MetricsSummaryItem)
   * NO indican a qué segmento pertenecen — el llamador debe rastrearlo.
   */
  business_type?: BusinessType
}

// ─────────────────────────────────────────────────────────────────────────────────
// GET /api/metrics/alerts
// /docs → GET /api/metrics/alerts → Parameters ; routes.py:342-359
// Usado por: Feature 2 (tabla de alertas de anomalías).
// ─────────────────────────────────────────────────────────────────────────────────

export interface MetricsAlertsQueryParams {
  /**
   * SENSIBILIDAD DE ANOMALÍA.
   * Contrato API: `type: number`, `minimum: 0`, SIN máximo, default de la API `0.3`
   * (backend/app/routes.py:344 — `Query(default=0.3, ge=0)`).
   * Un período se devuelve cuando su `increase_ratio` es estrictamente mayor que este valor.
   *
   * El contrato de la UI es DISTINTO y más estricto — un slider limitado a 0.01–1.0 con
   * default de UI 0.3 (ver components.md → Feature 2). NO estrechar este tipo a ese rango;
   * la API en sí acepta 0 y cualquier valor > 1.
   */
  threshold?: number
  /** Default de la API: 'month'. Cambia el formato de la etiqueta `period` en la respuesta. */
  group_by?: GroupBy
  start_date?: string
  end_date?: string
  business_type?: BusinessType
}

// ─────────────────────────────────────────────────────────────────────────────────
// GET /api/metrics/categories/top
// /docs → GET /api/metrics/categories/top → Parameters ; routes.py:287-302
// Usado por: Feature 3 (comparación B2B vs B2C).
// ─────────────────────────────────────────────────────────────────────────────────

export interface TopCategoriesQueryParams {
  /**
   * Default de la API: 'outcome'. Para la Feature 3 (comparación de INGRESOS) el llamador DEBE
   * pasar 'income' explícitamente — verificado. Omitirlo devuelve el ranking de gastos (outcome).
   */
  operation_type?: OperationType
  /**
   * Entero. Restricción de la API: `minimum: 1`, `maximum: 20`, default de la API `5`.
   * (Valores fuera de rango → HTTP 422.)
   * Solo existen 5 categorías, así que `limit: 20` las devuelve TODAS — usarlo para obtener el
   * denominador del grupo al calcular los porcentajes por categoría (Feature 3).
   */
  limit?: number
  start_date?: string
  end_date?: string
  /** Una petición por segmento: llamar una vez con 'B2B' y otra con 'B2C'. */
  business_type?: BusinessType
}
