# Estado actual del proyecto

> Snapshot verificado en esta sesión, no un informe periódico automatizado. Las secciones "Qué funciona" y "Gaps conocidos" están respaldadas por archivo o por ejecución real (`docker compose up --build`, `pytest`, `vitest`, peticiones HTTP reales). La sección "Siguientes prioridades" es una recomendación razonada a partir de esos gaps, no un hecho verificable — se marca explícitamente como tal.
> Complementa a [`project-summary.md`](./project-summary.md), [`conventions.md`](./conventions.md) y [`stack.md`](./stack.md).
> Fecha de generación: 2026-09-04. Este archivo puede quedar desactualizado; antes de confiar en él, re-verificar contra el código y, si es posible, contra una ejecución real.

---

## ✅ Qué funciona (verificado con ejecución real en esta sesión)

| Área | Verificado | Evidencia |
|---|---|---|
| Arranque completo | `docker compose up --build` construye ambas imágenes y levanta ambos contenedores sin errores | log real de build/arranque; `docker ps` muestra `...-backend-1` y `...-frontend-1` con estado `Up` |
| Backend HTTP | `GET /health` → `200 {"status":"ok"}`; `GET /api/metrics` → `200` con JSON válido; `GET /docs` → `200` (Swagger UI) | peticiones `curl` reales contra `http://localhost:8000` en esta sesión |
| Frontend HTTP | `GET /` → `200` (SPA servida); `GET /api/metrics` vía proxy de Vite → `200` | peticiones `curl` reales contra `http://localhost:5173`; proxy definido en `frontend/vite.config.ts:11-15` |
| **Suite de tests backend** | `python -m pytest -q` dentro del contenedor → **15 passed**, 0 fallos | ejecución real en esta sesión (`docker exec ...-backend-1 python -m pytest -q`) |
| **Suite de tests frontend** | `npm run test` (Vitest) dentro del contenedor → **1 test file, 5 tests, todos passed** | ejecución real en esta sesión (`docker exec ...-frontend-1 npm run test`) |
| Cobertura funcional real de las 9 rutas | Los 15 tests de `backend/tests/test_routes.py` ejercitan las 9 rutas existentes (`/health`, `/api/metrics`, `/api/metrics/facets`, `/summary`, `/categories/top`, `/comparison`, `/alerts`, `/b2b`, `/b2c`) contra la app real vía `TestClient`, no solo la lectura de código | `backend/tests/test_routes.py` (funciones `test_*`), confirmado por la ejecución real de pytest arriba |
| Documentación del proyecto | `memory-bank/project-summary.md`, `conventions.md` y `stack.md` existen y están mergeados en `main` | PR #1 mergeado (`d91ac41`), `git log --oneline origin/main` |

**Corrección respecto a una afirmación previa de esta misma sesión**: en `conventions.md` y `stack.md` se había escrito "18 tests" en el backend por conteo manual erróneo. La ejecución real de pytest confirma **15 tests**, y ya se corrigió en ambos archivos.

---

## ⚠️ Gaps conocidos (evidenciados por archivo)

| Gap | Evidencia | Impacto |
|---|---|---|
| Estructura de agentes incompleta | `AGENTS.md:5-9` y `README.md` describen `./.agents/rules` y `./.agents/skills` como ubicaciones esperadas, pero ninguna de las dos existe en el repo (`test -d .agents` → MISSING) | Cualquier agente que siga `AGENTS.md` al pie de la letra no encontrará reglas ni skills — es una instrucción sin contenido todavía |
| Inconsistencia de fecha en el dashboard | El header muestra el texto fijo `"2024 - Full Year"` (`frontend/src/App.tsx:49`), pero el backend genera fechas relativas a `date.today()` (`backend/app/routes.py:65-68,97`). En esta sesión, con fecha real 2026-09-04, `/api/metrics` devolvió movimientos fechados en 2025/2026, no en 2024 | El label del dashboard no refleja el rango real de los datos que muestra |
| Código muerto en frontend | `frontend/src/lib/mock-data.ts` (`mockMovements`) no se importa desde ningún otro archivo del repo (confirmado por búsqueda de `mock-data`/`mockMovements`) | Mantenimiento innecesario; puede confundir a un agente que busque "de dónde salen los datos" y encuentre dos fuentes |
| Dependencias del backend sin versión fijada | `backend/requirements.txt` no tiene ningún `==` (sin pin de versión) para `fastapi`, `uvicorn[standard]`, `debugpy`, `pytest`, `pytest-cov`, `httpx` | Dos builds en momentos distintos pueden instalar versiones diferentes de las mismas dependencias — no hay reproducibilidad garantizada |
| Cobertura de tests no medida | `pytest-cov` (backend) y `@vitest/coverage-v8` (frontend) están instalados y hay scripts (`test:coverage` en `frontend/package.json:13`) pero no se generó ni revisó ningún reporte de cobertura en esta sesión | Se desconoce qué porcentaje real del código está cubierto por tests |
| Tests de frontend limitados a funciones puras | El único archivo de test del frontend (`financial-utils.test.ts`, 5 tests) cubre `lib/financial-utils.ts`; ningún componente React (`KPICard`, `IncomeOutcomeChart`, `ProfitPercentChart`, `DashboardHeader`, `KPIRow`) tiene test | Cambios en la lógica de renderizado o en props no están protegidos por ningún test automático |
| CORS totalmente abierto | `allow_origins=["*"]` en `backend/app/main.py:9` | Aceptable para desarrollo local/mock, pero es una configuración permisiva que un agente no debería replicar sin más contexto si el proyecto avanza hacia otro entorno |
| Backend sin manejo de errores explícito | Confirmado por búsqueda (`try/except/raise/HTTPException` → 0 resultados en `backend/`) — ver `conventions.md`, convención 31 | Cualquier excepción no anticipada por FastAPI/Pydantic se propagaría como error 500 genérico sin contexto adicional |
| Frontend descarta el error real | `frontend/src/App.tsx:35-39` — el único `.catch()` de la app no captura el error real ni lo loguea a consola | Depurar un fallo real de red/API en el navegador no muestra ninguna pista más allá del mensaje fijo en español |
| Sin CI/CD | Ausencia de `.github/workflows`, `.gitlab-ci.yml`, `.circleci/` en el repo | Los tests (15+5, ambos verificados ahora manualmente) no se ejecutan automáticamente en cada push/PR — el propio PR #1 se mergeó sin ningún check automático |
| Sin healthcheck ni usuario no-root en Docker | Ninguno de los dos Dockerfiles define `HEALTHCHECK` ni `USER` (`conventions.md`, convención 21) | No hay señal automática de "contenedor listo" para orquestación; los procesos corren como root dentro del contenedor |

---

## ❓ Sin verificar

- Comportamiento de la app bajo carga o con un volumen de datos mayor a 360 movimientos/año (el dataset es fijo por diseño — `seed=42` — y no se probó con otros valores).
- Persistencia/consistencia de resultados tras reiniciar el contenedor backend varias veces seguidas (la semilla es fija, pero no se verificó explícitamente el reinicio repetido en esta sesión).
- Reporte de cobertura real (`pytest-cov`, `@vitest/coverage-v8`) — instalado pero no ejecutado.
- Comportamiento fuera de Docker Compose (ejecución manual de `uvicorn`/`npm run dev` sin contenedores).
- Contenido esperado de `.agents/rules` y `.agents/skills` — se sabe que la estructura se espera, pero no qué reglas o skills concretas debería contener.

---

## Siguientes prioridades

> Esta sección es una recomendación basada en los gaps documentados arriba, no un hecho verificable del repositorio — inclúyela como punto de partida para discutir con el equipo, no como una decisión ya tomada.

1. **Completar `.agents/rules` y `.agents/skills`** — es el hueco más directo respecto a lo que `AGENTS.md` y el README ya prometen, y es literalmente el objetivo declarado de este ejercicio de construcción de contexto.
2. **Fijar versiones en `backend/requirements.txt`** (`fastapi==...`, etc.) para que los builds sean reproducibles — hoy dos `docker compose up --build` en fechas distintas pueden instalar versiones distintas sin que nada lo señale.
3. **Medir y publicar cobertura de tests** (`pytest --cov`, `vitest run --coverage`) ya que las herramientas ya están instaladas pero no se usan — coste bajo, valor alto para saber qué tan protegido está el código.
4. **Resolver la inconsistencia del header "2024 - Full Year"** frente a los datos dinámicos, o documentar explícitamente que es un placeholder intencional.
5. **Eliminar `mock-data.ts`** si de verdad no tiene uso previsto, o documentar por qué se mantiene.
6. **Añadir tests de componentes React** (al menos de los que tienen lógica condicional, como `loading`/`hasData` en las gráficas), ya que hoy el 100% del testing de frontend es sobre funciones puras.
7. **Añadir un pipeline de CI** que corra `pytest` y `vitest run` en cada PR — ahora mismo el único "check" fue manual, en esta sesión, ejecutado a mano contra los contenedores.
