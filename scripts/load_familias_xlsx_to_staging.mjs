#!/usr/bin/env node
/**
 * Carga un Excel multi-hoja de familias en family_staging_raw.
 * Uso:
 *   node scripts/load_familias_xlsx_to_staging.mjs \
 *     --file "/ruta/familias.xlsx" \
 *     --batch "<BATCH_UUID>"
 *
 * Requisitos:
 *   - DATABASE_URL en entorno
 *   - npm i xlsx (si no está instalado)
 */

import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return "";
  return process.argv[idx + 1] ?? "";
}

const file = arg("file");
const batchId = arg("batch");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xls"]);

function fileExtension(path) {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx).toLowerCase();
}

function sanitizeCell(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (/^[=+\-@]/.test(str)) return `'${str}`;
  return str;
}


function normalizeText(value) {
  return String(value ?? "")
    .replace(/\bm\s*ª\s*/gi, "maria ")
    .replace(/\bma\s*\.\s*/gi, "maria ")
    .replace(/\bma\s+(?=\S)/gi, "maria ")
    .replace(/\bm\s*\.\s*/gi, "maria ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’'´`.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanSchoolName(value, fallback = "") {
  const raw = sanitizeCell(value) || sanitizeCell(fallback) || "";
  const normalized = normalizeText(raw);
  if (!raw) return null;

  if (normalized.includes("jardin") || normalized.includes("cauquen") || normalized.includes("cerritos") || normalized.includes("senderos") || normalized.includes("buen molino") || normalized.includes("platero")) {
    if (normalized.includes("cerritos")) return "Jardín Los Cerritos";
    if (normalized.includes("cauquen")) return "Jardín Cauquén";
    if (normalized.includes("senderos")) return "Jardín Los Senderos";
    if (normalized.includes("buen molino")) return "Jardín Buen Molino";
    if (normalized.includes("platero")) return "Jardín Platero";
    if (normalized.includes("crisol")) return "Jardín Crisol";
    if (normalized.includes("torreon")) return "Jardín Torreón de los Ríos";
  }

  return raw;
}

function chunkArray(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

if (!file || !batchId) {
  console.error("Faltan parámetros. Ejemplo: --file ./familias.xlsx --batch <uuid>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en entorno.");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No existe archivo: ${file}`);
  process.exit(1);
}
if (!UUID_RE.test(batchId)) {
  console.error("batch debe ser un UUID válido.");
  process.exit(1);
}
if (!ALLOWED_EXTENSIONS.has(fileExtension(file))) {
  console.error("Archivo no soportado. Usá .xlsx, .xlsm o .xls");
  process.exit(1);
}

const maxFileSizeMB = Number(process.env.FAMILIAS_MAX_FILE_MB || 30);
const keepRawPayload = String(process.env.FAMILIAS_KEEP_RAW_PAYLOAD || "false").toLowerCase() === "true";
if (!Number.isFinite(maxFileSizeMB) || maxFileSizeMB <= 0) {
  console.error("FAMILIAS_MAX_FILE_MB inválido.");
  process.exit(1);
}
const fileSizeBytes = fs.statSync(file).size;
if (fileSizeBytes > maxFileSizeMB * 1024 * 1024) {
  console.error(`Archivo excede límite de ${maxFileSizeMB} MB.`);
  process.exit(1);
}

let XLSX;
try {
  XLSX = await import("xlsx");
} catch {
  console.error("Falta dependencia xlsx. Ejecutá: npm i xlsx");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const wb = XLSX.readFile(file, { cellFormula: false });

const pick = (row, keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return sanitizeCell(row[k]);
    }
  }
  return null;
};

const mapping = {
  colegio: ["Colegio", "colegio", "Nombre del colegio", "__EMPTY"],
  nivel: ["Nivel", "nivel", "__EMPTY_1"],
  curso: ["Curso", "curso", "__EMPTY_2"],
  division: ["División", "Division", "division", "__EMPTY_3"],
  nombre_alumno: ["Nombre del alumno/a", "Nombre alumno", "nombre_alumno", "Nombre", "__EMPTY_4"],
  apellido_alumno: ["Apellido del alumno/a", "Apellido alumno", "apellido_alumno", "Primer apellido", "APELLIDO Y NOMBRE"],
  dni_alumno: ["DNI del alumno/a", "DNI alumno", "dni_alumno", "Documento de identidad", "DNI ALUMNO"],
  sexo_alumno: ["Sexo", "Sexo alumno", "sexo_alumno", "SEXO"],
  fecha_nacimiento_alumno: ["Fecha de Nacimiento", "Fecha Nacimiento alumno", "fecha_nacimiento_alumno", "Fecha de nacimiento", "FECHA DE NAC"],
  domicilio_alumno: ["Domicilio", "Domicilio alumno", "domicilio_alumno", "Calle", "Dirección"],
  nombre_padre: ["Nombre del padre", "Nombres del padre", "Nombres del Padre", "Nombre", "Nombre_1", "nombre_padre"],
  apellido_padre: ["Apellido del padre", "Apellidos del Padre", "Primer apellido", "Primer apellido_1", "apellido_padre"],
  dni_padre: ["DNI del padre", "DNI Padre", "Documento de identidad", "Documento de identidad_1", "dni_padre"],
  sexo_padre: ["Sexo padre", "sexo_padre"],
  fecha_nacimiento_padre: ["Fecha de Nacimiento del padre", "fecha_nacimiento_padre"],
  email_padre: ["Email del padre", "Mail Padre", "Email", "Email_1", "email_padre"],
  celular_padre: ["Celular padre", "celular_padre"],
  domicilio_padre: ["Domicilio padre", "domicilio_padre"],
  nombre_madre: ["Nombre de la madre", "Nombre Madre", "Nombre", "Nombre_2", "nombre_madre"],
  apellido_madre: ["Apellido de la madre", "Apellido Madre", "Primer apellido", "Primer apellido_2", "apellido_madre"],
  dni_madre: ["DNI de la madre", "DNI Madre", "Documento de identidad", "Documento de identidad_2", "dni_madre"],
  sexo_madre: ["Sexo madre", "sexo_madre"],
  fecha_nacimiento_madre: ["Fecha de Nacimiento de la madre", "fecha_nacimiento_madre"],
  email_madre: ["Email de la madre", "Mail Madre", "Email", "Email_2", "email_madre"],
  celular_madre: ["Celular madre", "celular_madre"],
  domicilio_madre: ["Domicilio madre", "domicilio_madre"],
};

let total = 0;
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) continue;

  const payload = rows.map((r) => {
    const item = { batch_id: batchId, sheet_name: sheetName, raw_payload: keepRawPayload ? r : null };
    for (const [target, keys] of Object.entries(mapping)) {
      item[target] = pick(r, keys);
    }
    item.colegio = cleanSchoolName(item.colegio, sheetName);
    return item;
  });
  total += payload.length;

  for (const chunk of chunkArray(payload, 1000)) {
    await sql`
    INSERT INTO family_staging_raw (
      batch_id, sheet_name, colegio, nivel, curso, division,
      nombre_alumno, apellido_alumno, dni_alumno, sexo_alumno, fecha_nacimiento_alumno, domicilio_alumno,
      nombre_padre, apellido_padre, dni_padre, sexo_padre, fecha_nacimiento_padre, email_padre, celular_padre, domicilio_padre,
      nombre_madre, apellido_madre, dni_madre, sexo_madre, fecha_nacimiento_madre, email_madre, celular_madre, domicilio_madre,
      raw_payload
    )
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(
      batch_id uuid, sheet_name text, colegio text, nivel text, curso text, division text,
      nombre_alumno text, apellido_alumno text, dni_alumno text, sexo_alumno text, fecha_nacimiento_alumno text, domicilio_alumno text,
      nombre_padre text, apellido_padre text, dni_padre text, sexo_padre text, fecha_nacimiento_padre text, email_padre text, celular_padre text, domicilio_padre text,
      nombre_madre text, apellido_madre text, dni_madre text, sexo_madre text, fecha_nacimiento_madre text, email_madre text, celular_madre text, domicilio_madre text,
      raw_payload jsonb
    )
    `;
  }
  console.log(`✔ Hoja "${sheetName}": ${payload.length} filas`);
}

console.log(`✅ Carga staging completa. Filas insertadas: ${total}`);
