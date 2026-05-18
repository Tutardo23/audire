-- Pipeline de importación masiva para Universo de Familias
-- Uso recomendado:
-- 1) Crear tablas staging + funciones (este archivo).
-- 2) Cargar datos crudos del Excel en family_staging_raw (por CSV o COPY).
-- 3) Ejecutar: SELECT run_family_import('<batch_id>'::uuid, '<project_id>'::uuid);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS family_staging_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES family_import_batches(id) ON DELETE CASCADE,
  sheet_name text,
  colegio text,
  nivel text,
  curso text,
  division text,
  nombre_alumno text,
  apellido_alumno text,
  dni_alumno text,
  sexo_alumno text,
  fecha_nacimiento_alumno text,
  domicilio_alumno text,
  nombre_padre text,
  apellido_padre text,
  dni_padre text,
  sexo_padre text,
  fecha_nacimiento_padre text,
  email_padre text,
  celular_padre text,
  domicilio_padre text,
  nombre_madre text,
  apellido_madre text,
  dni_madre text,
  sexo_madre text,
  fecha_nacimiento_madre text,
  email_madre text,
  celular_madre text,
  domicilio_madre text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_staging_batch ON family_staging_raw(batch_id);

CREATE OR REPLACE FUNCTION normalize_txt(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(trim(regexp_replace(coalesce(v,''), '\s+', ' ', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION normalize_dni(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(coalesce(v,''), '[^0-9]', '', 'g'), '')
$$;

CREATE OR REPLACE FUNCTION safe_to_date(v text)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t text := trim(coalesce(v,''));
BEGIN
  IF t = '' THEN RETURN NULL; END IF;
  BEGIN
    RETURN t::date; -- ISO
  EXCEPTION WHEN others THEN
    BEGIN
      RETURN to_date(t, 'DD/MM/YYYY');
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION run_family_import(p_batch_id uuid, p_project_id uuid)
RETURNS TABLE(inserted_familias int, inserted_alumnos int, inserted_adultos int, upserted_participation int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fam int := 0;
  v_alu int := 0;
  v_adu int := 0;
  v_par int := 0;
BEGIN
  -- Familias (dedupe por colegio+polo+domicilio)
  WITH src AS (
    SELECT DISTINCT
      normalize_txt(colegio) AS colegio,
      normalize_txt(split_part(coalesce(sheet_name,''), '-', 1)) AS polo_from_sheet,
      normalize_txt(domicilio_alumno) AS domicilio
    FROM family_staging_raw
    WHERE batch_id = p_batch_id
  ), ins AS (
    INSERT INTO familias (colegio, polo, domicilio, source_batch_id)
    SELECT
      coalesce(s.colegio, 'Sin colegio'),
      coalesce(NULLIF(s.polo_from_sheet,''), 'Sin polo'),
      s.domicilio,
      p_batch_id
    FROM src s
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_fam FROM ins;

  -- Alumnos
  WITH rows_norm AS (
    SELECT
      r.*,
      normalize_txt(r.colegio) AS n_colegio,
      coalesce(normalize_txt(split_part(coalesce(r.sheet_name,''), '-', 1)), 'Sin polo') AS n_polo,
      normalize_txt(r.domicilio_alumno) AS n_domicilio
    FROM family_staging_raw r
    WHERE r.batch_id = p_batch_id
  ), fam_match AS (
    SELECT
      rn.*,
      f.id AS familia_id
    FROM rows_norm rn
    JOIN familias f
      ON normalize_txt(f.colegio) = coalesce(rn.n_colegio, 'Sin colegio')
     AND normalize_txt(f.polo) = rn.n_polo
     AND coalesce(normalize_txt(f.domicilio),'') = coalesce(rn.n_domicilio,'')
  ), ins AS (
    INSERT INTO alumnos (
      familia_id, nombre, apellido, dni, sexo, fecha_nacimiento, nivel, curso, division
    )
    SELECT
      fm.familia_id,
      coalesce(normalize_txt(fm.nombre_alumno), 'Sin nombre'),
      coalesce(normalize_txt(fm.apellido_alumno), 'Sin apellido'),
      normalize_dni(fm.dni_alumno),
      normalize_txt(fm.sexo_alumno),
      safe_to_date(fm.fecha_nacimiento_alumno),
      normalize_txt(fm.nivel),
      normalize_txt(fm.curso),
      normalize_txt(fm.division)
    FROM fam_match fm
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_alu FROM ins;

  -- Adultos padre/madre
  WITH rows_norm AS (
    SELECT
      r.*,
      normalize_txt(r.colegio) AS n_colegio,
      coalesce(normalize_txt(split_part(coalesce(r.sheet_name,''), '-', 1)), 'Sin polo') AS n_polo,
      normalize_txt(r.domicilio_alumno) AS n_domicilio
    FROM family_staging_raw r
    WHERE r.batch_id = p_batch_id
  ), fam_match AS (
    SELECT rn.*, f.id AS familia_id
    FROM rows_norm rn
    JOIN familias f
      ON normalize_txt(f.colegio) = coalesce(rn.n_colegio, 'Sin colegio')
     AND normalize_txt(f.polo) = rn.n_polo
     AND coalesce(normalize_txt(f.domicilio),'') = coalesce(rn.n_domicilio,'')
  ), adults_src AS (
    SELECT familia_id, 'padre'::text AS rol, nombre_padre AS nombre, apellido_padre AS apellido, dni_padre AS dni, sexo_padre AS sexo,
           fecha_nacimiento_padre AS fnac, email_padre AS email, celular_padre AS celular, domicilio_padre AS domicilio
    FROM fam_match
    UNION ALL
    SELECT familia_id, 'madre'::text AS rol, nombre_madre, apellido_madre, dni_madre, sexo_madre,
           fecha_nacimiento_madre, email_madre, celular_madre, domicilio_madre
    FROM fam_match
  ), ins AS (
    INSERT INTO adultos (familia_id, rol, nombre, apellido, dni, sexo, fecha_nacimiento, email, celular, domicilio)
    SELECT
      a.familia_id,
      a.rol,
      coalesce(normalize_txt(a.nombre), 'Sin nombre'),
      coalesce(normalize_txt(a.apellido), 'Sin apellido'),
      normalize_dni(a.dni),
      normalize_txt(a.sexo),
      safe_to_date(a.fnac),
      normalize_txt(a.email),
      normalize_txt(a.celular),
      normalize_txt(a.domicilio)
    FROM adults_src a
    WHERE normalize_txt(a.nombre) IS NOT NULL OR normalize_txt(a.apellido) IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_adu FROM ins;

  -- Participación inicial por proyecto (familias cargadas => universo; responded en false por defecto)
  WITH fams AS (
    SELECT DISTINCT f.id AS familia_id
    FROM familias f
    WHERE f.source_batch_id = p_batch_id
  ), up AS (
    INSERT INTO family_participation (project_id, familia_id, responded, response_count, last_response_at)
    SELECT p_project_id, familia_id, false, 0, NULL
    FROM fams
    ON CONFLICT (project_id, familia_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_par FROM up;

  RETURN QUERY SELECT v_fam, v_alu, v_adu, v_par;
END;
$$;

