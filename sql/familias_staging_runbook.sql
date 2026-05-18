-- Runbook seguro para ejecutar import de familias sin romper lo existente
-- Objetivo: usar staging + validación + commit controlado.

-- 0) PRE-CHECK (no modifica nada)
SELECT count(*) AS projects_total FROM projects;
SELECT count(*) AS encuestas_total FROM encuestas;

-- 1) Crear lote de importación
-- Reemplazar valores antes de correr
INSERT INTO family_import_batches (project_id, uploaded_by, filename, total_rows, ok_rows, error_rows)
VALUES (
  '<PROJECT_ID>'::uuid,
  '<USER_ID>',
  '<FILE_NAME>.xlsx',
  0, 0, 0
)
RETURNING id;

-- 2) Cargar datos crudos en family_staging_raw
-- Esto normalmente se hace por COPY / script ETL.
-- Script recomendado (repo):
--   node scripts/load_familias_xlsx_to_staging.mjs --file "/ruta/familias.xlsx" --batch "<BATCH_ID>"
-- Ejemplo mínimo (manual):
-- INSERT INTO family_staging_raw (
--   batch_id, sheet_name, colegio, nivel, curso, division,
--   nombre_alumno, apellido_alumno, dni_alumno, sexo_alumno, fecha_nacimiento_alumno,
--   nombre_padre, apellido_padre, dni_padre, email_padre,
--   nombre_madre, apellido_madre, dni_madre, email_madre
-- ) VALUES (...);

-- 3) Validaciones previas (no modifica dominio)
-- Reemplazar <BATCH_ID>
SELECT
  count(*) AS filas,
  count(*) FILTER (WHERE coalesce(trim(nombre_alumno), '') = '') AS sin_nombre_alumno,
  count(*) FILTER (WHERE coalesce(trim(apellido_alumno), '') = '') AS sin_apellido_alumno,
  count(*) FILTER (WHERE coalesce(trim(colegio), '') = '') AS sin_colegio
FROM family_staging_raw
WHERE batch_id = '<BATCH_ID>'::uuid;

-- Duplicados obvios por alumno dentro del mismo batch
SELECT
  coalesce(trim(nombre_alumno), '') AS nombre,
  coalesce(trim(apellido_alumno), '') AS apellido,
  coalesce(trim(dni_alumno), '') AS dni,
  count(*) AS reps
FROM family_staging_raw
WHERE batch_id = '<BATCH_ID>'::uuid
GROUP BY 1,2,3
HAVING count(*) > 1
ORDER BY reps DESC, nombre, apellido;

-- 4) Importación real en transacción
BEGIN;

-- Ejecuta función del pipeline
SELECT * FROM run_family_import('<BATCH_ID>'::uuid, '<PROJECT_ID>'::uuid);

-- Control de impacto antes del commit
SELECT count(*) AS familias_batch FROM familias WHERE source_batch_id = '<BATCH_ID>'::uuid;
SELECT count(*) AS alumnos_batch
FROM alumnos a
JOIN familias f ON f.id = a.familia_id
WHERE f.source_batch_id = '<BATCH_ID>'::uuid;
SELECT count(*) AS adultos_batch
FROM adultos ad
JOIN familias f ON f.id = ad.familia_id
WHERE f.source_batch_id = '<BATCH_ID>'::uuid;

-- Si todo está bien:
COMMIT;
-- Si algo no cierra:
-- ROLLBACK;

-- 5) Post-check (verificar que lo existente no se rompió)
SELECT count(*) AS projects_total_after FROM projects;
SELECT count(*) AS encuestas_total_after FROM encuestas;

-- 6) Cobertura por colegio/polo del proyecto
SELECT
  f.polo,
  f.colegio,
  COUNT(DISTINCT f.id) AS familias_total,
  COUNT(DISTINCT CASE WHEN fp.responded THEN fp.familia_id END) AS familias_respondieron,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN fp.responded THEN fp.familia_id END)
    / NULLIF(COUNT(DISTINCT f.id), 0), 1
  ) AS cobertura_pct
FROM familias f
LEFT JOIN family_participation fp
  ON fp.familia_id = f.id
 AND fp.project_id = '<PROJECT_ID>'::uuid
GROUP BY f.polo, f.colegio
ORDER BY f.polo, f.colegio;
