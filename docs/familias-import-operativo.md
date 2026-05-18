# Importación operativa de Excel de Familias

Este flujo carga un Excel multi-hoja en `family_staging_raw` y luego lo materializa en:
- `familias`
- `alumnos`
- `adultos`
- `family_participation`

## Prerrequisitos

1. Haber ejecutado:
   - `sql/familias_staging_pipeline.sql`
   - `sql/familias_staging_runbook.sql`
2. Tener `DATABASE_URL` configurada.
3. Instalar parser de Excel:

```bash
npm i xlsx
```

## Paso a paso (producción segura)

### 1) Crear batch

En SQL Editor:

```sql
INSERT INTO family_import_batches (project_id, uploaded_by, filename, total_rows, ok_rows, error_rows)
VALUES ('<PROJECT_ID>'::uuid, '<USER_ID>', '<FILE_NAME>.xlsx', 0, 0, 0)
RETURNING id;
```

Guardá el `id` devuelto como `BATCH_ID`.

### 2) Cargar Excel a staging

```bash
npm run familias:load:xlsx -- --file "/ruta/familias.xlsx" --batch "<BATCH_ID>"
```

### 3) Validar staging (sin tocar tablas de dominio)

```sql
SELECT count(*) AS filas FROM family_staging_raw WHERE batch_id = '<BATCH_ID>'::uuid;
```

```sql
SELECT
  count(*) FILTER (WHERE coalesce(trim(nombre_alumno), '') = '') AS sin_nombre,
  count(*) FILTER (WHERE coalesce(trim(apellido_alumno), '') = '') AS sin_apellido,
  count(*) FILTER (WHERE coalesce(trim(colegio), '') = '') AS sin_colegio
FROM family_staging_raw
WHERE batch_id = '<BATCH_ID>'::uuid;
```

### 4) Importar a dominio

```sql
SELECT * FROM run_family_import('<BATCH_ID>'::uuid, '<PROJECT_ID>'::uuid);
```

### 5) Verificar resultados

```sql
SELECT count(*) FROM familias WHERE source_batch_id = '<BATCH_ID>'::uuid;
```

```sql
SELECT count(*) AS total
FROM alumnos a
JOIN familias f ON f.id = a.familia_id
WHERE f.source_batch_id = '<BATCH_ID>'::uuid;
```

```sql
SELECT count(*) AS total
FROM adultos ad
JOIN familias f ON f.id = ad.familia_id
WHERE f.source_batch_id = '<BATCH_ID>'::uuid;
```

## ¿Cuántos pasos faltan para cerrar Semana 2?

Si esta importación funciona en un archivo real, quedan 3 pasos:

1. **Automatizar cruce de participación** entre `encuestas` y `familias` (responded true/false real).
2. **Bloque Director** de cobertura/representatividad por polo/colegio/curso/división.
3. **Bloque Equipo** de pendientes de respuesta (operativo).

Con eso, Semana 2 queda funcional.

