"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartBar,
  ChatCircleText,
  CircleNotch,
  Wrench,
  TrendUp,
  X,
  MapPin,
  Scales,
  Heart,
  Users,
  Minus,
  ThumbsUp,
  ArrowsClockwise,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  Plus,
  Trash,
  PencilSimple,
  Info,
} from "phosphor-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";

// Ajustá esta ruta dependiendo de dónde esté tu carpeta actions
import {
  obtenerEncuestasComparacionLigeraDB,
  obtenerRespuestaHistoricaFamiliaDB,
  obtenerComentarioCompletoEncuestaDB,
  listarProyectosDB,
  listarProyectosComparacionNpsDB,
  obtenerTemasProyectoDB,
  guardarTemasProyectoDB,
  obtenerHistorialTemasProyectoDB,
  copiarTemasDesdeProyectoDB,
  obtenerParticipacionFamiliarProyectoDB,
  obtenerFamiliasCompartidasProyectoDB,
} from "../app/actions";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type DirectorTopic = "Promotor" | "Satisfecho" | "Insatisfecho";
type DirectorCustomTheme = { id: string; keywords: string[] };
type ThemeHistoryChange = {
  type?: string;
  themeId?: string;
  keywords?: string[];
  addedKeywords?: string[];
  removedKeywords?: string[];
  snapshotBefore?: DirectorCustomTheme[];
  snapshotAfter?: DirectorCustomTheme[];
};
type ThemeHistoryItem = { created_at: string; updated_by: string | null; changes: ThemeHistoryChange[] };

const cleanThemes = (themes: unknown): DirectorCustomTheme[] => {
  if (!Array.isArray(themes)) return [];
  return themes
    .map((item) => {
      const raw = item as { id?: unknown; name?: unknown; keywords?: unknown };
      const id = String(raw.id ?? raw.name ?? "").trim();
      const keywords = Array.isArray(raw.keywords)
        ? raw.keywords.map((x) => String(x).trim()).filter(Boolean)
        : [];
      return id && keywords.length > 0 ? { id, keywords: Array.from(new Set(keywords)) } : null;
    })
    .filter(Boolean) as DirectorCustomTheme[];
};

const themesKey = (themes: DirectorCustomTheme[]) =>
  JSON.stringify(
    themes
      .map((theme) => ({
        id: theme.id.trim(),
        keywords: Array.from(new Set(theme.keywords.map((x) => x.trim()).filter(Boolean))).sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );

export type SurveyRow = {
  id: string;
  date: string;
  nombre: string;
  apellido: string;
  colegio: string;
  curso: string;
  polo: string;
  sexo: string;
  score: number;
  type: "Promotor" | "Satisfecho" | "Insatisfecho";
  positive: string;
  improvement: string;
  positiveTags: string[];
  improvementTags: string[];
  risk: boolean;
  riskLevel: "Ninguno" | "Sensible" | "Prioritario";
  riskWords: string[];
  sentiment: "Crítico" | "Observación" | "Sugerencia" | "Neutro";
  sentimentScore: number;
  year: number;
  projectId?: string;
  projectName?: string;
  anonFamilyKey?: string;
  anonCompositeKey?: string;
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const normalize = (str?: string | null) =>
  String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const schoolKey = (value?: string | null) =>
  normalize(value)
    .replace(/^colegio\s+/, "")
    .replace(/^jardin\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

const canonicalNpsSchoolName = (value?: string | null) => {
  const raw = String(value ?? "").trim();
  const normalized = normalize(raw)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Evita duplicados en el NPS cuando la misma escuela llega como:
  // "Los Olivos", "Colegio Los Olivos" o "Colegio Colegio Los Olivos".
  if (normalized.includes("los olivos")) return "Colegio Los Olivos";

  return raw.replace(/^Colegio\s+Colegio\s+/i, "Colegio ");
};

const matchesSchoolName = (a?: string | null, b?: string | null) => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
};

const normalizeSchoolForCompare = (value?: string | null) => {
  const normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'´`.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  if (normalized.includes("bosque") && normalized.includes("plata")) return "bosque del plata";
  if (normalized.includes("los olivos")) return "colegio los olivos";
  if (normalized.includes("los molinos")) return "colegio los molinos";
  if (normalized.includes("cinco rios")) return "colegio cinco rios";
  if (normalized.includes("los caminos")) return "colegio los caminos";
  if (normalized.includes("los arroyos")) return "colegio los arroyos";
  if (normalized.includes("pucara")) return "colegio pucara";

  if (normalized.includes("el buen ayre") || normalized.includes("el buen ayr")) return "colegio el buen ayre";
  if (normalized.includes("el torreon") || (normalized.includes("colegio") && normalized.includes("torreon"))) return "colegio el torreon";
  if (normalized.includes("los cerros")) return "colegio los cerros";
  if (normalized.includes("mirasoles")) return "colegio mirasoles";
  if (normalized.includes("portezuelo")) return "colegio portezuelo";
  if (normalized.includes("candiles")) return "los candiles";

  if (normalized.includes("jardin") && normalized.includes("crisol")) return "jardin crisol";
  if (normalized.includes("colegio crisol")) return "colegio crisol";
  if (normalized.includes("jardin") && normalized.includes("torreon")) return "jardin torreon de los rios";
  if (normalized.includes("torreon de los rios")) return "jardin torreon de los rios";
  if (normalized.includes("buen molino")) return "jardin buen molino";
  if (normalized.includes("los cerritos")) return "jardin los cerritos";
  if (normalized.includes("senderos")) return "jardin los senderos";
  if (normalized.includes("platero")) return "jardin platero";
  if (normalized.includes("cauquen")) return "jardin cauquen";

  return normalized;
};

const schoolGroupForDashboard = (value?: string | null): "varones" | "mujeres" | "jardines" | "otro" => {
  const school = normalizeSchoolForCompare(value);

  if (["colegio pucara", "colegio cinco rios", "colegio los arroyos", "bosque del plata", "colegio los caminos", "colegio los olivos", "colegio los molinos"].includes(school)) return "varones";
  if (["colegio los cerros", "colegio el torreon", "colegio mirasoles", "colegio el buen ayre", "colegio portezuelo", "colegio crisol", "los candiles"].includes(school)) return "mujeres";
  if (school.startsWith("jardin ")) return "jardines";

  return "otro";
};

const getSharedFamilyRelationCards = (school: string, resumen: any) => {
  const group = schoolGroupForDashboard(school);

  if (group === "varones") {
    return [
      { label: "También con jardín", value: Number(resumen?.conJardin || 0) },
      { label: "También con mujeres", value: Number(resumen?.conMujeres || 0) },
    ];
  }

  if (group === "mujeres") {
    return [
      { label: "También con jardín", value: Number(resumen?.conJardin || 0) },
      { label: "También con varones", value: Number(resumen?.conVarones || 0) },
    ];
  }

  if (group === "jardines") {
    return [
      { label: "También con mujeres", value: Number(resumen?.conMujeres || 0) },
      { label: "También con varones", value: Number(resumen?.conVarones || 0) },
    ];
  }

  return [
    { label: "También con jardín", value: Number(resumen?.conJardin || 0) },
    { label: "También con mujeres", value: Number(resumen?.conMujeres || 0) },
    { label: "También con varones", value: Number(resumen?.conVarones || 0) },
  ];
};

const shortSchoolName = (value?: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "este colegio";

  return raw
    .replace(/^Colegio\s+/i, "")
    .replace(/^Jardín\s+/i, "Jardín ")
    .replace(/\s+/g, " ")
    .trim();
};


type StaticFamilyDistributionRow = {
  label: string;
  familias: number;
};

type StaticFamilyDistribution = {
  titleSchool: string;
  polo: string;
  year: number;
  total: number;
  rows: StaticFamilyDistributionRow[];
};

// Distribuciones familiares validadas manualmente para proyectos 2025.
// Importante: esto aplica SOLO al bloque visual de Director "Distribución de familias".
// No toca Neon, no modifica participación familiar y no se usa para otros años.
const STATIC_2025_FAMILY_DISTRIBUTIONS: Record<string, StaticFamilyDistribution> = {
  [normalizeSchoolForCompare("Colegio Pucará")]: {
    titleSchool: "Pucará",
    polo: "Tucumán",
    year: 2025,
    total: 519,
    rows: [
      { label: "Colegio Pucará", familias: 238 },
      { label: "Colegio Pucará + Colegio Los Cerros", familias: 212 },
      { label: "Colegio Pucará + Jardín Los Cerritos", familias: 41 },
      { label: "Colegio Pucará + Colegio Los Cerros + Jardín Los Cerritos", familias: 28 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Cerros")]: {
    titleSchool: "Los Cerros",
    polo: "Tucumán",
    year: 2025,
    total: 552,
    rows: [
      { label: "Colegio Los Cerros", familias: 263 },
      { label: "Colegio Los Cerros + Colegio Pucará", familias: 212 },
      { label: "Colegio Los Cerros + Jardín Los Cerritos", familias: 49 },
      { label: "Colegio Los Cerros + Colegio Pucará + Jardín Los Cerritos", familias: 28 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Los Cerritos")]: {
    titleSchool: "Jardín Los Cerritos",
    polo: "Tucumán",
    year: 2025,
    total: 264,
    rows: [
      { label: "Jardín Los Cerritos", familias: 146 },
      { label: "Jardín Los Cerritos + Colegio Pucará", familias: 41 },
      { label: "Jardín Los Cerritos + Colegio Los Cerros", familias: 49 },
      { label: "Jardín Los Cerritos + Colegio Pucará + Colegio Los Cerros", familias: 28 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Cinco Ríos")]: {
    titleSchool: "Cinco Ríos",
    polo: "Córdoba",
    year: 2025,
    total: 352,
    rows: [
      { label: "Colegio Cinco Ríos", familias: 157 },
      { label: "Colegio Cinco Ríos + Colegio El Torreón", familias: 147 },
      { label: "Colegio Cinco Ríos + Jardín Torreón de los Ríos", familias: 27 },
      { label: "Colegio Cinco Ríos + Colegio El Torreón + Jardín Torreón de los Ríos", familias: 21 },
    ],
  },
  [normalizeSchoolForCompare("Colegio El Torreón")]: {
    titleSchool: "El Torreón",
    polo: "Córdoba",
    year: 2025,
    total: 395,
    rows: [
      { label: "Colegio El Torreón", familias: 185 },
      { label: "Colegio El Torreón + Colegio Cinco Ríos", familias: 147 },
      { label: "Colegio El Torreón + Jardín Torreón de los Ríos", familias: 42 },
      { label: "Colegio El Torreón + Colegio Cinco Ríos + Jardín Torreón de los Ríos", familias: 21 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Torreón de los Ríos")]: {
    titleSchool: "Jardín Torreón de los Ríos",
    polo: "Córdoba",
    year: 2025,
    total: 192,
    rows: [
      { label: "Jardín Torreón de los Ríos", familias: 102 },
      { label: "Jardín Torreón de los Ríos + Colegio Cinco Ríos", familias: 27 },
      { label: "Jardín Torreón de los Ríos + Colegio El Torreón", familias: 42 },
      { label: "Jardín Torreón de los Ríos + Colegio Cinco Ríos + Colegio El Torreón", familias: 21 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Arroyos")]: {
    titleSchool: "Los Arroyos",
    polo: "Rosario",
    year: 2025,
    total: 267,
    rows: [
      { label: "Colegio Los Arroyos", familias: 115 },
      { label: "Colegio Los Arroyos + Colegio Mirasoles", familias: 101 },
      { label: "Colegio Los Arroyos + Jardín Los Senderos", familias: 29 },
      { label: "Colegio Los Arroyos + Colegio Mirasoles + Jardín Los Senderos", familias: 22 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Mirasoles")]: {
    titleSchool: "Mirasoles",
    polo: "Rosario",
    year: 2025,
    total: 282,
    rows: [
      { label: "Colegio Mirasoles", familias: 122 },
      { label: "Colegio Mirasoles + Colegio Los Arroyos", familias: 101 },
      { label: "Colegio Mirasoles + Jardín Los Senderos", familias: 37 },
      { label: "Colegio Mirasoles + Colegio Los Arroyos + Jardín Los Senderos", familias: 22 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Los Senderos")]: {
    titleSchool: "Jardín Los Senderos",
    polo: "Rosario",
    year: 2025,
    total: 190,
    rows: [
      { label: "Jardín Los Senderos", familias: 102 },
      { label: "Jardín Los Senderos + Colegio Los Arroyos", familias: 29 },
      { label: "Jardín Los Senderos + Colegio Mirasoles", familias: 37 },
      { label: "Jardín Los Senderos + Colegio Los Arroyos + Colegio Mirasoles", familias: 22 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Molinos")]: {
    titleSchool: "Los Molinos",
    polo: "Buenos Aires",
    year: 2025,
    total: 544,
    rows: [
      { label: "Colegio Los Molinos", familias: 285 },
      { label: "Colegio Los Molinos + Colegio El Buen Ayre", familias: 182 },
      { label: "Colegio Los Molinos + Jardín Buen Molino", familias: 19 },
      { label: "Colegio Los Molinos + Colegio El Buen Ayre + Jardín Buen Molino", familias: 58 },
    ],
  },
  [normalizeSchoolForCompare("Colegio El Buen Ayre")]: {
    titleSchool: "El Buen Ayre",
    polo: "Buenos Aires",
    year: 2025,
    total: 439,
    rows: [
      { label: "Colegio El Buen Ayre", familias: 158 },
      { label: "Colegio El Buen Ayre + Colegio Los Molinos", familias: 182 },
      { label: "Colegio El Buen Ayre + Jardín Buen Molino", familias: 41 },
      { label: "Colegio El Buen Ayre + Colegio Los Molinos + Jardín Buen Molino", familias: 58 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Buen Molino")]: {
    titleSchool: "Jardín Buen Molino",
    polo: "Buenos Aires",
    year: 2025,
    total: 162,
    rows: [
      { label: "Jardín Buen Molino", familias: 44 },
      { label: "Jardín Buen Molino + Colegio Los Molinos", familias: 19 },
      { label: "Jardín Buen Molino + Colegio El Buen Ayre", familias: 41 },
      { label: "Jardín Buen Molino + Colegio Los Molinos + Colegio El Buen Ayre", familias: 58 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Olivos")]: {
    titleSchool: "Los Olivos",
    polo: "Mendoza",
    year: 2025,
    total: 262,
    rows: [
      { label: "Colegio Los Olivos", familias: 140 },
      { label: "Colegio Los Olivos + Colegio Portezuelo", familias: 74 },
      { label: "Colegio Los Olivos + Jardín Platero", familias: 31 },
      { label: "Colegio Los Olivos + Colegio Portezuelo + Jardín Platero", familias: 17 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Portezuelo")]: {
    titleSchool: "Portezuelo",
    polo: "Mendoza",
    year: 2025,
    total: 283,
    rows: [
      { label: "Colegio Portezuelo", familias: 156 },
      { label: "Colegio Portezuelo + Colegio Los Olivos", familias: 74 },
      { label: "Colegio Portezuelo + Jardín Platero", familias: 36 },
      { label: "Colegio Portezuelo + Colegio Los Olivos + Jardín Platero", familias: 17 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Platero")]: {
    titleSchool: "Jardín Platero",
    polo: "Mendoza",
    year: 2025,
    total: 181,
    rows: [
      { label: "Jardín Platero", familias: 97 },
      { label: "Jardín Platero + Colegio Los Olivos", familias: 31 },
      { label: "Jardín Platero + Colegio Portezuelo", familias: 36 },
      { label: "Jardín Platero + Colegio Los Olivos + Colegio Portezuelo", familias: 17 },
    ],
  },
  [normalizeSchoolForCompare("Bosque Del Plata")]: {
    titleSchool: "Bosque Del Plata",
    polo: "La Plata",
    year: 2025,
    total: 253,
    rows: [
      { label: "Bosque Del Plata", familias: 177 },
      { label: "Bosque Del Plata + Colegio Crisol", familias: 39 },
      { label: "Bosque Del Plata + Jardín Crisol", familias: 23 },
      { label: "Bosque Del Plata + Colegio Crisol + Jardín Crisol", familias: 14 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Crisol")]: {
    titleSchool: "Crisol",
    polo: "La Plata",
    year: 2025,
    total: 128,
    rows: [
      { label: "Colegio Crisol", familias: 44 },
      { label: "Colegio Crisol + Bosque Del Plata", familias: 39 },
      { label: "Colegio Crisol + Jardín Crisol", familias: 31 },
      { label: "Colegio Crisol + Bosque Del Plata + Jardín Crisol", familias: 14 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Crisol")]: {
    titleSchool: "Jardín Crisol",
    polo: "La Plata",
    year: 2025,
    total: 140,
    rows: [
      { label: "Jardín Crisol", familias: 72 },
      { label: "Jardín Crisol + Bosque Del Plata", familias: 23 },
      { label: "Jardín Crisol + Colegio Crisol", familias: 31 },
      { label: "Jardín Crisol + Bosque Del Plata + Colegio Crisol", familias: 14 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Caminos")]: {
    titleSchool: "Los Caminos",
    polo: "Pilar",
    year: 2025,
    total: 131,
    rows: [
      { label: "Colegio Los Caminos", familias: 59 },
      { label: "Colegio Los Caminos + Los Candiles", familias: 38 },
      { label: "Colegio Los Caminos + Jardín Cauquén", familias: 16 },
      { label: "Colegio Los Caminos + Los Candiles + Jardín Cauquén", familias: 18 },
    ],
  },
  [normalizeSchoolForCompare("Los Candiles")]: {
    titleSchool: "Los Candiles",
    polo: "Pilar",
    year: 2025,
    total: 119,
    rows: [
      { label: "Los Candiles", familias: 46 },
      { label: "Los Candiles + Colegio Los Caminos", familias: 38 },
      { label: "Los Candiles + Jardín Cauquén", familias: 17 },
      { label: "Los Candiles + Colegio Los Caminos + Jardín Cauquén", familias: 18 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Cauquén")]: {
    titleSchool: "Jardín Cauquén",
    polo: "Pilar",
    year: 2025,
    total: 98,
    rows: [
      { label: "Jardín Cauquén", familias: 47 },
      { label: "Jardín Cauquén + Colegio Los Caminos", familias: 16 },
      { label: "Jardín Cauquén + Los Candiles", familias: 17 },
      { label: "Jardín Cauquén + Colegio Los Caminos + Los Candiles", familias: 18 },
    ],
  },
};

const STATIC_2024_FAMILY_DISTRIBUTIONS: Record<string, StaticFamilyDistribution> = {
  [normalizeSchoolForCompare("Colegio Pucará")]: {
    titleSchool: "Pucará",
    polo: "Tucumán",
    year: 2024,
    total: 488,
    rows: [
      { label: "Colegio Pucará", familias: 219 },
      { label: "Colegio Pucará + Colegio Los Cerros", familias: 191 },
      { label: "Colegio Pucará + Jardín Los Cerritos", familias: 49 },
      { label: "Colegio Pucará + Colegio Los Cerros + Jardín Los Cerritos", familias: 29 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Cerros")]: {
    titleSchool: "Los Cerros",
    polo: "Tucumán",
    year: 2024,
    total: 531,
    rows: [
      { label: "Colegio Los Cerros", familias: 253 },
      { label: "Colegio Los Cerros + Colegio Pucará", familias: 191 },
      { label: "Colegio Los Cerros + Jardín Los Cerritos", familias: 58 },
      { label: "Colegio Los Cerros + Colegio Pucará + Jardín Los Cerritos", familias: 29 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Los Cerritos")]: {
    titleSchool: "Jardín Los Cerritos",
    polo: "Tucumán",
    year: 2024,
    total: 288,
    rows: [
      { label: "Jardín Los Cerritos", familias: 152 },
      { label: "Jardín Los Cerritos + Colegio Pucará", familias: 49 },
      { label: "Jardín Los Cerritos + Colegio Los Cerros", familias: 58 },
      { label: "Jardín Los Cerritos + Colegio Pucará + Colegio Los Cerros", familias: 29 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Cinco Ríos")]: {
    titleSchool: "Cinco Ríos",
    polo: "Córdoba",
    year: 2024,
    total: 332,
    rows: [
      { label: "Colegio Cinco Ríos", familias: 147 },
      { label: "Colegio Cinco Ríos + Colegio El Torreón", familias: 133 },
      { label: "Colegio Cinco Ríos + Jardín Torreón de los Ríos", familias: 29 },
      { label: "Colegio Cinco Ríos + Colegio El Torreón + Jardín Torreón de los Ríos", familias: 23 },
    ],
  },
  [normalizeSchoolForCompare("Colegio El Torreón")]: {
    titleSchool: "El Torreón",
    polo: "Córdoba",
    year: 2024,
    total: 382,
    rows: [
      { label: "Colegio El Torreón", familias: 178 },
      { label: "Colegio El Torreón + Colegio Cinco Ríos", familias: 133 },
      { label: "Colegio El Torreón + Jardín Torreón de los Ríos", familias: 48 },
      { label: "Colegio El Torreón + Colegio Cinco Ríos + Jardín Torreón de los Ríos", familias: 23 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Torreón de los Ríos")]: {
    titleSchool: "Jardín Torreón de los Ríos",
    polo: "Córdoba",
    year: 2024,
    total: 206,
    rows: [
      { label: "Jardín Torreón de los Ríos", familias: 106 },
      { label: "Jardín Torreón de los Ríos + Colegio Cinco Ríos", familias: 29 },
      { label: "Jardín Torreón de los Ríos + Colegio El Torreón", familias: 48 },
      { label: "Jardín Torreón de los Ríos + Colegio Cinco Ríos + Colegio El Torreón", familias: 23 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Arroyos")]: {
    titleSchool: "Los Arroyos",
    polo: "Rosario",
    year: 2024,
    total: 258,
    rows: [
      { label: "Colegio Los Arroyos", familias: 106 },
      { label: "Colegio Los Arroyos + Colegio Mirasoles", familias: 102 },
      { label: "Colegio Los Arroyos + Jardín Los Senderos", familias: 33 },
      { label: "Colegio Los Arroyos + Colegio Mirasoles + Jardín Los Senderos", familias: 17 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Mirasoles")]: {
    titleSchool: "Mirasoles",
    polo: "Rosario",
    year: 2024,
    total: 279,
    rows: [
      { label: "Colegio Mirasoles", familias: 123 },
      { label: "Colegio Mirasoles + Colegio Los Arroyos", familias: 102 },
      { label: "Colegio Mirasoles + Jardín Los Senderos", familias: 37 },
      { label: "Colegio Mirasoles + Colegio Los Arroyos + Jardín Los Senderos", familias: 17 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Los Senderos")]: {
    titleSchool: "Jardín Los Senderos",
    polo: "Rosario",
    year: 2024,
    total: 175,
    rows: [
      { label: "Jardín Los Senderos", familias: 88 },
      { label: "Jardín Los Senderos + Colegio Los Arroyos", familias: 33 },
      { label: "Jardín Los Senderos + Colegio Mirasoles", familias: 37 },
      { label: "Jardín Los Senderos + Colegio Los Arroyos + Colegio Mirasoles", familias: 17 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Molinos")]: {
    titleSchool: "Los Molinos",
    polo: "Buenos Aires",
    year: 2024,
    total: 560,
    rows: [
      { label: "Colegio Los Molinos", familias: 292 },
      { label: "Colegio Los Molinos + Colegio El Buen Ayre", familias: 190 },
      { label: "Colegio Los Molinos + Jardín Buen Molino", familias: 20 },
      { label: "Colegio Los Molinos + Colegio El Buen Ayre + Jardín Buen Molino", familias: 58 },
    ],
  },
  [normalizeSchoolForCompare("Colegio El Buen Ayre")]: {
    titleSchool: "El Buen Ayre",
    polo: "Buenos Aires",
    year: 2024,
    total: 441,
    rows: [
      { label: "Colegio El Buen Ayre", familias: 158 },
      { label: "Colegio El Buen Ayre + Colegio Los Molinos", familias: 190 },
      { label: "Colegio El Buen Ayre + Jardín Buen Molino", familias: 35 },
      { label: "Colegio El Buen Ayre + Colegio Los Molinos + Jardín Buen Molino", familias: 58 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Buen Molino")]: {
    titleSchool: "Jardín Buen Molino",
    polo: "Buenos Aires",
    year: 2024,
    total: 168,
    rows: [
      { label: "Jardín Buen Molino", familias: 55 },
      { label: "Jardín Buen Molino + Colegio Los Molinos", familias: 20 },
      { label: "Jardín Buen Molino + Colegio El Buen Ayre", familias: 35 },
      { label: "Jardín Buen Molino + Colegio Los Molinos + Colegio El Buen Ayre", familias: 58 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Olivos")]: {
    titleSchool: "Los Olivos",
    polo: "Mendoza",
    year: 2024,
    total: 250,
    rows: [
      { label: "Colegio Los Olivos", familias: 132 },
      { label: "Colegio Los Olivos + Colegio Portezuelo", familias: 70 },
      { label: "Colegio Los Olivos + Jardín Platero", familias: 26 },
      { label: "Colegio Los Olivos + Colegio Portezuelo + Jardín Platero", familias: 22 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Portezuelo")]: {
    titleSchool: "Portezuelo",
    polo: "Mendoza",
    year: 2024,
    total: 215,
    rows: [
      { label: "Colegio Portezuelo", familias: 97 },
      { label: "Colegio Portezuelo + Colegio Los Olivos", familias: 70 },
      { label: "Colegio Portezuelo + Jardín Platero", familias: 26 },
      { label: "Colegio Portezuelo + Colegio Los Olivos + Jardín Platero", familias: 22 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Platero")]: {
    titleSchool: "Jardín Platero",
    polo: "Mendoza",
    year: 2024,
    total: 171,
    rows: [
      { label: "Jardín Platero", familias: 97 },
      { label: "Jardín Platero + Colegio Los Olivos", familias: 26 },
      { label: "Jardín Platero + Colegio Portezuelo", familias: 26 },
      { label: "Jardín Platero + Colegio Los Olivos + Colegio Portezuelo", familias: 22 },
    ],
  },
  [normalizeSchoolForCompare("Bosque Del Plata")]: {
    titleSchool: "Bosque Del Plata",
    polo: "La Plata",
    year: 2024,
    total: 232,
    rows: [
      { label: "Bosque Del Plata", familias: 120 },
      { label: "Bosque Del Plata + Colegio Crisol", familias: 73 },
      { label: "Bosque Del Plata + Jardín Crisol", familias: 27 },
      { label: "Bosque Del Plata + Colegio Crisol + Jardín Crisol", familias: 12 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Crisol")]: {
    titleSchool: "Crisol",
    polo: "La Plata",
    year: 2024,
    total: 224,
    rows: [
      { label: "Colegio Crisol", familias: 107 },
      { label: "Colegio Crisol + Bosque Del Plata", familias: 73 },
      { label: "Colegio Crisol + Jardín Crisol", familias: 32 },
      { label: "Colegio Crisol + Bosque Del Plata + Jardín Crisol", familias: 12 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Crisol")]: {
    titleSchool: "Jardín Crisol",
    polo: "La Plata",
    year: 2024,
    total: 150,
    rows: [
      { label: "Jardín Crisol", familias: 79 },
      { label: "Jardín Crisol + Bosque Del Plata", familias: 27 },
      { label: "Jardín Crisol + Colegio Crisol", familias: 32 },
      { label: "Jardín Crisol + Bosque Del Plata + Colegio Crisol", familias: 12 },
    ],
  },
  [normalizeSchoolForCompare("Colegio Los Caminos")]: {
    titleSchool: "Los Caminos",
    polo: "Pilar",
    year: 2024,
    total: 108,
    rows: [
      { label: "Colegio Los Caminos", familias: 44 },
      { label: "Colegio Los Caminos + Los Candiles", familias: 29 },
      { label: "Colegio Los Caminos + Jardín Cauquén", familias: 16 },
      { label: "Colegio Los Caminos + Los Candiles + Jardín Cauquén", familias: 19 },
    ],
  },
  [normalizeSchoolForCompare("Los Candiles")]: {
    titleSchool: "Los Candiles",
    polo: "Pilar",
    year: 2024,
    total: 106,
    rows: [
      { label: "Los Candiles", familias: 37 },
      { label: "Los Candiles + Colegio Los Caminos", familias: 29 },
      { label: "Los Candiles + Jardín Cauquén", familias: 21 },
      { label: "Los Candiles + Colegio Los Caminos + Jardín Cauquén", familias: 19 },
    ],
  },
  [normalizeSchoolForCompare("Jardín Cauquén")]: {
    titleSchool: "Jardín Cauquén",
    polo: "Pilar",
    year: 2024,
    total: 98,
    rows: [
      { label: "Jardín Cauquén", familias: 42 },
      { label: "Jardín Cauquén + Colegio Los Caminos", familias: 16 },
      { label: "Jardín Cauquén + Los Candiles", familias: 21 },
      { label: "Jardín Cauquén + Colegio Los Caminos + Los Candiles", familias: 19 },
    ],
  },
};

const getStaticFamilyDistribution = (school?: string | null, year?: number | null) => {
  const numericYear = Number(year);
  const key = normalizeSchoolForCompare(school);
  if (!key) return null;

  if (numericYear === 2025) return STATIC_2025_FAMILY_DISTRIBUTIONS[key] || null;
  if (numericYear === 2024) return STATIC_2024_FAMILY_DISTRIBUTIONS[key] || null;

  return null;
};

const getSharedFamiliesTotal = (resumen: any) =>
  Number(resumen?.soloEsteColegio || 0) +
  Number(resumen?.esteMasUnColegio || 0) +
  Number(resumen?.esteMasDosOMasColegios || 0);

const getSharedFamiliesSharedTotal = (resumen: any) =>
  Number(resumen?.esteMasUnColegio || 0) + Number(resumen?.esteMasDosOMasColegios || 0);

const getOtherSchoolCardsFromCombinations = (currentSchool: string, combinaciones: any[] = []) => {
  const currentKey = normalizeSchoolForCompare(currentSchool);
  const totals = new Map<string, { label: string; value: number }>();

  if (!currentKey || !Array.isArray(combinaciones)) return [];

  combinaciones.forEach((item) => {
    const familias = Number(item?.familias || 0);
    const parts = String(item?.label || "")
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!familias || parts.length < 2) return;
    if (!parts.some((part) => normalizeSchoolForCompare(part) === currentKey)) return;

    parts.forEach((part) => {
      const key = normalizeSchoolForCompare(part);
      if (!key || key === currentKey) return;
      const current = totals.get(key) || { label: part, value: 0 };
      current.value += familias;
      totals.set(key, current);
    });
  });

  return Array.from(totals.values())
    .sort((a, b) => b.value - a.value)
    .map((item) => ({
      label: `Familias compartidas con ${shortSchoolName(item.label)}`,
      value: item.value,
    }));
};

const normalizeSharedFamilyRow = (item: any, index: number) => ({
  id: String(item?.label || `fila-${index}`),
  label: String(item?.label || "Sin clasificación"),
  familias: Number(item?.familias || 0),
  isUnclassified: false,
});

const buildSharedFamiliesDistributionRows = ({
  combinaciones,
}: {
  combinaciones: any[];
  officialTotal: number;
  schoolLabel: string;
}) => {
  return Array.isArray(combinaciones)
    ? combinaciones.map(normalizeSharedFamilyRow).filter((row) => row.familias > 0)
    : [];
};


const canonicalPoloName = (value?: string | null) => {
  const text = normalize(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Evita que un typo como "Bueno Aires" rompa el filtro de Polo Buenos Aires.
  if (text === "bueno aires" || text === "buenos aire" || text === "buenos aires") {
    return "buenos aires";
  }

  return text;
};

const matchesPoloName = (a?: string | null, b?: string | null) => {
  const left = canonicalPoloName(a);
  const right = canonicalPoloName(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
};

const normalizeNameMatch = (nombre: string, apellido: string) => {
  return `${nombre || ""} ${apellido || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
};

const normalizedFamilyKey = (nombre: string, apellido: string, colegio?: string | null, curso?: string | null) => {
  const name = normalizeNameMatch(nombre, apellido);
  const school = normalize(String(colegio ?? ""));
  const classroom = normalize(String(curso ?? ""));
  return `${name}|${school}|${classroom}`;
};

const extraerAnio = (titulo: string) => {
  if (!titulo) return new Date().getFullYear();
  const match = titulo.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
};

const projectTrack = (name?: string | null): "varones" | "mujeres" | "jardin" | "otro" => {
  const n = normalize(name);
  if (n.includes("jardin")) return "jardin";
  if (n.includes("mujer")) return "mujeres";
  if (n.includes("varon")) return "varones";
  return "otro";
};

const formatCompareYearLabel = (project: any, targetSchool?: string | null) => {
  const projectName = String(project?.nombre || "").trim();
  const year = extraerAnio(projectName);
  const school = String(targetSchool || "").trim();

  if (school) return `${shortSchoolName(school)} ${year}`;
  return projectName || `Año ${year}`;
};

const formatCompareTextLabel = (project: any, targetSchool?: string | null) => {
  const projectName = String(project?.nombre || "").trim();
  const year = extraerAnio(projectName);
  const school = String(targetSchool || "").trim();

  if (school) return `${shortSchoolName(school)} ${year}`;
  return projectName || `año ${year}`;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightText = (text: string, query: string, extraKeywords: string[] = []) => {
  const t = String(text ?? "");
  if (!t) return <>{t}</>;

  const termsToHighlight = [query, ...extraKeywords]
    .map(q => String(q ?? "").trim())
    .filter(Boolean);

  if (termsToHighlight.length === 0) return <>{t}</>;

  const escapedTerms = termsToHighlight.map(escapeRegExp);
  const re = new RegExp(`\\b(${escapedTerms.join("|")})\\b`, "gi");
  const parts = t.split(re);

  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="rounded bg-amber-200/80 px-0.5 font-black text-slate-900 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const getMostFrequentYear = (rows: any[]): number => {
  const counts: Record<number, number> = {};
  rows.forEach(r => {
    const y = Number(r.year);
    if (!isNaN(y)) counts[y] = (counts[y] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? Number(sorted[0][0]) : new Date().getFullYear();
};

const percentage = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

const clientActionMemoryCache = new Map<string, any>();
const clientActionInflightCache = new Map<string, Promise<any>>();

const readClientActionSessionCache = (key: string) => {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeClientActionSessionCache = (key: string, data: any) => {
  if (typeof window === "undefined" || !key || data === undefined) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Cache opcional: si se llena storage, no rompemos la pantalla.
  }
};

const cachedClientAction = <T,>(key: string, loader: () => Promise<T>) => {
  if (!key) return loader();

  if (clientActionMemoryCache.has(key)) {
    return Promise.resolve(clientActionMemoryCache.get(key) as T);
  }

  const sessionCached = readClientActionSessionCache(key);
  if (sessionCached !== null) {
    clientActionMemoryCache.set(key, sessionCached);
    return Promise.resolve(sessionCached as T);
  }

  const existing = clientActionInflightCache.get(key);
  if (existing) return existing as Promise<T>;

  const request = loader()
    .then((data) => {
      clientActionMemoryCache.set(key, data);
      writeClientActionSessionCache(key, data);
      return data;
    })
    .finally(() => {
      clientActionInflightCache.delete(key);
    });

  clientActionInflightCache.set(key, request);
  return request;
};

const THEMES_LIST: DirectorCustomTheme[] = [
  { id: "Acoso y Convivencia", keywords: ["bullying", "acoso", "pelea", "maltrato", "amigos", "compañeros", "convivencia", "ambiente", "respeto", "burlas"] },
  { id: "Nivel Académico", keywords: ["profesor", "profe", "enseñanza", "clase", "nivel", "academico", "docente", "tarea", "exigencia", "pedagogico", "aprender", "ingles", "bilingue", "formacion"] },
  { id: "Religión y Valores", keywords: ["religion", "misa", "espiritual", "valores", "opus", "capellan", "virtudes", "fe", "catolico", "cristiano", "sacerdote", "ideario"] },
  { id: "Instalaciones", keywords: ["baño", "patio", "cancha", "edificio", "instalacion", "calor", "frio", "aire", "aula", "comedor", "ventilador", "roto", "limpieza", "mantenimiento"] },
  { id: "Atención Familiar", keywords: ["tutor", "tutoria", "entrevista", "preceptor", "apoyo", "guia", "psicologa", "gabinete", "acompañamiento", "escucha", "comunicacion", "mail", "directivo"] },
  { id: "Deportes", keywords: ["deporte", "fisico", "gimnasia", "torneo", "futbol", "hockey", "rugby", "atletismo", "educacion fisica", "gimnasio"] }
];

const uniqueStrings = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
const seededOrder = (value: string, seed: number) => {
  let hash = seed * 131;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) % 1000003;
  }
  return hash;
};

// ─────────────────────────────────────────────
// UI AUX & COMPONENTES
// ─────────────────────────────────────────────
function SimpleTag({ label, kind = "default" }: { label: string; kind?: "default" | "positive" | "warning" | "danger"; }) {
  const styles =
    kind === "positive" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : kind === "warning" ? "border-amber-200 bg-amber-50 text-amber-700"
        : kind === "danger" ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${styles}`}>
      {label}
    </span>
  );
}

const DirectorTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white bg-white/95 p-3 shadow-xl backdrop-blur-xl z-50 relative">
      <p className="text-xs font-black text-slate-800">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="mt-1 text-xs font-semibold text-slate-600">
          {p.name}: <span className="font-black text-slate-800">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

function NpsGauge({ nps, total }: { nps: number; total: number }) {
  const clamped = Math.max(-100, Math.min(100, nps));
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cx = 100, cy = 90;
  const needleAngle = -180 + ((clamped + 100) / 200) * 180;
  const nx = cx + 55 * Math.cos(toRad(needleAngle));
  const ny = cy + 55 * Math.sin(toRad(needleAngle));
  const color = nps >= 50 ? "#10B981" : nps >= 0 ? "#3B82F6" : "#EF4444";

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d="M 30 90 A 70 70 0 0 1 170 90" fill="none" stroke="#FCA5A5" strokeWidth="16" strokeLinecap="round" />
        <path d="M 30 90 A 70 70 0 0 1 100 20" fill="none" stroke="#FDE68A" strokeWidth="16" strokeLinecap="round" />
        <path d="M 100 20 A 70 70 0 0 1 170 90" fill="none" stroke="#A7F3D0" strokeWidth="16" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={color} />
        <text x="22" y="108" fontSize="8" fontWeight="800" fill="#EF4444" textAnchor="middle">-100</text>
        <text x="178" y="108" fontSize="8" fontWeight="800" fill="#10B981" textAnchor="middle">+100</text>
      </svg>
      <div className="text-center -mt-3">
        <span className="font-display text-5xl font-black leading-none" style={{ color }}>{nps > 0 ? "+" : ""}{nps}</span>
        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{total} Respuestas</p>
      </div>
    </div>
  );
}

function HelpTip({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
        <Info size={12} weight="bold" />
        Cómo leer
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          <p className="text-xs font-black text-slate-800">{title}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{body}</p>
        </div>
      )}
    </div>
  );
}


function normalizeChildrenComposition(value: any) {
  const source = value && typeof value === "object" ? value : {};
  return {
    totalFamilias: Number(source.totalFamilias || 0),
    totalHijos: Number(source.totalHijos || 0),
    unHijo: Number(source.unHijo || source.uno || 0),
    dosHijos: Number(source.dosHijos || source.dos || 0),
    tresHijos: Number(source.tresHijos || source.tres || 0),
    cuatroOMas: Number(source.cuatroOMas || source.cuatroMas || 0),
    promedioHijos: Number(source.promedioHijos || 0),
  };
}

function aggregateChildrenComposition(rows: any[]) {
  const total = rows.reduce(
    (acc, row) => {
      const value = normalizeChildrenComposition(row?.hijosPorFamilia);
      acc.totalFamilias += value.totalFamilias;
      acc.totalHijos += value.totalHijos;
      acc.unHijo += value.unHijo;
      acc.dosHijos += value.dosHijos;
      acc.tresHijos += value.tresHijos;
      acc.cuatroOMas += value.cuatroOMas;
      return acc;
    },
    { totalFamilias: 0, totalHijos: 0, unHijo: 0, dosHijos: 0, tresHijos: 0, cuatroOMas: 0 },
  );

  return {
    ...total,
    promedioHijos: total.totalFamilias ? Math.round((total.totalHijos / total.totalFamilias) * 10) / 10 : 0,
  };
}

const familyParticipationCacheKey = (projectId?: string) =>
  projectId ? `apdes:family-participation:v4:${projectId}` : "";

const readFamilyParticipationCache = (projectId?: string) => {
  if (typeof window === "undefined") return null;
  const key = familyParticipationCacheKey(projectId);
  if (!key) return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeFamilyParticipationCache = (projectId: string | undefined, data: any) => {
  if (typeof window === "undefined" || !data) return;
  const key = familyParticipationCacheKey(projectId);
  if (!key) return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Si el navegador bloquea storage o se llena, simplemente no cacheamos.
  }
};

const directorCompareCacheKey = (
  currentProjectId: string | undefined,
  compareProjectId: string,
  targetSchool: string | undefined,
  currentRowsSignature: string,
) => {
  if (!currentProjectId || !compareProjectId) return "";
  return `apdes:director-compare:v3:${currentProjectId}:${compareProjectId}:${normalize(targetSchool || "todos")}:${currentRowsSignature}`;
};

const readDirectorCompareCache = (key: string) => {
  if (typeof window === "undefined" || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as { compareData: any; crossFamilyData: any[] };
  } catch {
    return null;
  }
};

const writeDirectorCompareCache = (key: string, data: { compareData: any; crossFamilyData: any[] }) => {
  if (typeof window === "undefined" || !key || !data?.compareData) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Si el cruce trae muchos comentarios y el storage se llena, no rompemos la pantalla.
  }
};

// ─────────────────────────────────────────────
// DASHBOARD DEL DIRECTOR
// ─────────────────────────────────────────────
type DirectorDashboardProps = {
  stats: any;
  filteredResponses: SurveyRow[];
  directorCommentLimit: number;
  setDirectorCommentLimit: (value: number) => void;
  directorTopic: DirectorTopic;
  setDirectorTopic: (value: DirectorTopic) => void;
  activeSchool: string;
  regionalRows?: SurveyRow[];
  fixedPolo?: string;
  ownSchool?: string;
  ownPolo?: string;
  allowedCompareProjectIds?: string[];
  userId?: string;
  canEditThemes?: boolean;
  projectId?: string;
  currentProjectName?: string;
  npsLoading?: boolean;
  isPoleDirector?: boolean;
};

export default function DirectorDashboard({
  stats,
  filteredResponses,
  directorCommentLimit,
  setDirectorCommentLimit,
  directorTopic,
  setDirectorTopic,
  activeSchool,
  regionalRows,
  fixedPolo,
  ownSchool,
  ownPolo,
  allowedCompareProjectIds = [],
  userId,
  canEditThemes = false,
  projectId,
  currentProjectName,
  npsLoading = false,
  isPoleDirector = false,
}: DirectorDashboardProps) {
  const [npsViewMode, setNpsViewMode] = useState<"polo" | "historico">("polo");
  const [commentTheme, setCommentTheme] = useState<string>("Todos");
  const [commentRefreshCounter, setCommentRefreshCounter] = useState(0);
  const [allThemes, setAllThemes] = useState<DirectorCustomTheme[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ThemeHistoryItem[]>([]);
  const [themesHydrated, setThemesHydrated] = useState(false);
  const [themesSyncing, setThemesSyncing] = useState(false);
  const [themesSyncMessage, setThemesSyncMessage] = useState("");
  const [copyVarones2025Loading, setCopyVarones2025Loading] = useState(false);
  const lastSavedThemesKeyRef = useRef<string>("");
  const skipNextThemeSaveRef = useRef(false);
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [newThemeKeywords, setNewThemeKeywords] = useState("");
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [editingThemeName, setEditingThemeName] = useState("");
  const [editingThemeKeywords, setEditingThemeKeywords] = useState("");
  const [savedCommentIds, setSavedCommentIds] = useState<string[]>([]);
  const [sessionSeed] = useState<number>(() => Date.now());
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [commentSearch, setCommentSearch] = useState("");
  const [commentProfile, setCommentProfile] = useState<"Todos" | DirectorTopic>(directorTopic);
  
  const [compareProjectId, setCompareProjectId] = useState<string>("");
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [compareData, setCompareData] = useState<any | null>(null);
  const [crossFamilyData, setCrossFamilyData] = useState<any[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [familyParticipation, setFamilyParticipation] = useState<any | null>(null);
  const [familyParticipationLoading, setFamilyParticipationLoading] = useState(false);
  const [sharedFamilies, setSharedFamilies] = useState<any | null>(null);
  const [sharedFamiliesLoading, setSharedFamiliesLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!projectId) {
      setFamilyParticipation(null);
      setFamilyParticipationLoading(false);
      return () => {
        mounted = false;
      };
    }

    const cached = readFamilyParticipationCache(projectId);
    if (cached) {
      setFamilyParticipation(cached);
      setFamilyParticipationLoading(false);
      return () => {
        mounted = false;
      };
    }

    setFamilyParticipationLoading(true);

    cachedClientAction(`apdes:action:family-participation:v4:${projectId}`, () => obtenerParticipacionFamiliarProyectoDB(projectId))
      .then((data) => {
        if (!mounted) return;
        setFamilyParticipation(data);
        writeFamilyParticipationCache(projectId, data);
      })
      .catch(() => {
        if (!mounted) return;
        setFamilyParticipation(null);
      })
      .finally(() => {
        if (mounted) setFamilyParticipationLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [projectId]);

  const sharedFamiliesTargetSchool = useMemo(() => {
    if (activeSchool !== "Todos los colegios") return activeSchool;
    if (ownSchool) return ownSchool;

    // Fallback para perfiles Director que entran con el selector en "Todos los colegios"
    // pero las respuestas ya vienen filtradas a un solo colegio.
    const schools = Array.from(
      new Set(
        (filteredResponses || [])
          .map((row) => String(row?.colegio || "").trim())
          .filter(Boolean),
      ),
    );

    return schools.length === 1 ? schools[0] : "";
  }, [activeSchool, ownSchool, filteredResponses]);

  const sharedFamiliesProjectYear = useMemo(() => {
    const fromProjectName = currentProjectName ? extraerAnio(currentProjectName) : 0;
    if (fromProjectName > 0) return fromProjectName;
    return getMostFrequentYear(stats.schoolData || []);
  }, [currentProjectName, stats.schoolData]);

  const staticFamilyDistributionForTarget = useMemo(() => {
    return getStaticFamilyDistribution(sharedFamiliesTargetSchool, sharedFamiliesProjectYear);
  }, [sharedFamiliesTargetSchool, sharedFamiliesProjectYear]);

  const sharedFamilyRelationCards = useMemo(() => {
    if (!sharedFamilies?.resumen || !sharedFamiliesTargetSchool) return [];
    return getSharedFamilyRelationCards(sharedFamiliesTargetSchool, sharedFamilies.resumen);
  }, [sharedFamilies, sharedFamiliesTargetSchool]);

  const sharedFamiliesDisplaySchool = useMemo(() => {
    if (!sharedFamilies?.resumen) return sharedFamiliesTargetSchool;
    return String(sharedFamilies.resumen.colegio || sharedFamiliesTargetSchool || "este colegio");
  }, [sharedFamilies, sharedFamiliesTargetSchool]);

  const sharedFamiliesTotal = useMemo(() => getSharedFamiliesTotal(sharedFamilies?.resumen), [sharedFamilies]);
  const sharedFamiliesSharedTotal = useMemo(() => getSharedFamiliesSharedTotal(sharedFamilies?.resumen), [sharedFamilies]);

  const sharedFamilyOtherSchoolCards = useMemo(() => {
    if (!sharedFamilies?.resumen || !sharedFamiliesDisplaySchool) return [];
    return getOtherSchoolCardsFromCombinations(sharedFamiliesDisplaySchool, sharedFamilies.combinaciones).slice(0, 4);
  }, [sharedFamilies, sharedFamiliesDisplaySchool]);

  useEffect(() => {
    let mounted = true;

    if (!projectId || !sharedFamiliesTargetSchool || staticFamilyDistributionForTarget) {
      setSharedFamilies(null);
      setSharedFamiliesLoading(false);
      return () => {
        mounted = false;
      };
    }

    setSharedFamiliesLoading(true);

    cachedClientAction(
      `apdes:action:shared-families:${projectId}:${normalize(sharedFamiliesTargetSchool)}`,
      () => obtenerFamiliasCompartidasProyectoDB(projectId, sharedFamiliesTargetSchool),
    )
      .then((data) => {
        if (!mounted) return;
        setSharedFamilies(data);
      })
      .catch(() => {
        if (!mounted) return;
        setSharedFamilies(null);
      })
      .finally(() => {
        if (mounted) setSharedFamiliesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [projectId, sharedFamiliesTargetSchool, staticFamilyDistributionForTarget]);


  const familyParticipationExecutive = useMemo(() => {
    if (!familyParticipation?.resumen) return null;

    const resumen = familyParticipation.resumen;
    const schools = Array.isArray(familyParticipation.porColegio)
      ? [...familyParticipation.porColegio]
      : [];
    const scopedSchools = activeSchool === "Todos los colegios"
      ? schools
      : schools.filter((s: any) => matchesSchoolName(String(s?.colegio || ""), activeSchool));

    const totalFamilias = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.totalFamilias || 0), 0);
    const familiasConRespuesta = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.familiasConRespuesta || 0), 0);
    const soloMadre = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.soloMadre || 0), 0);
    const soloPadre = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.soloPadre || 0), 0);
    const ambos = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.ambos || 0), 0);
    const nadie = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.ninguno || 0), 0);
    const madresRespondieron = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.madresRespondieron || 0), 0);
    const padresRespondieron = scopedSchools.reduce((acc: number, s: any) => acc + Number(s?.padresRespondieron || 0), 0);

    const participationPct = totalFamilias
      ? Math.round((familiasConRespuesta / totalFamilias) * 1000) / 10
      : 0;

    const bothPct = totalFamilias
      ? Math.round((ambos / totalFamilias) * 1000) / 10
      : 0;

    const noResponsePct = totalFamilias
      ? Math.round((nadie / totalFamilias) * 1000) / 10
      : 0;

    const allSchools = scopedSchools
      .map((school: any) => ({
        colegio: String(school.colegio || "Sin colegio"),
        totalFamilias: Number(school.totalFamilias || 0),
        familiasConRespuesta: Number(school.familiasConRespuesta || 0),
        porcentajeParticipacion: Number(school.porcentajeParticipacion || 0),
        soloMadre: Number(school.soloMadre || 0),
        soloPadre: Number(school.soloPadre || 0),
        ambos: Number(school.ambos || 0),
        nadie: Number(school.ninguno || 0),
        madresRespondieron: Number(school.madresRespondieron || 0),
        padresRespondieron: Number(school.padresRespondieron || 0),
        hijosPorFamilia: normalizeChildrenComposition(school.hijosPorFamilia),
      }))
      .filter((school: any) => school.totalFamilias > 0);

    return {
      totalFamilias,
      familiasConRespuesta,
      participationPct,
      bothPct,
      noResponsePct,
      soloMadre,
      soloPadre,
      ambos,
      nadie,
      madresRespondieron,
      padresRespondieron,
      allSchools,
    };
  }, [familyParticipation, activeSchool]);

  const sharedFamiliesOfficialTotal = useMemo(() => {
    const participationTotal = Number(familyParticipationExecutive?.totalFamilias || 0);
    if (participationTotal > 0) return participationTotal;
    return Number(sharedFamiliesTotal || 0);
  }, [familyParticipationExecutive, sharedFamiliesTotal]);

  const sharedFamiliesYear = useMemo(() => {
    const fromSharedFamilies = Number(sharedFamilies?.year || 0);
    if (fromSharedFamilies > 0) return fromSharedFamilies;
    return sharedFamiliesProjectYear;
  }, [sharedFamilies?.year, sharedFamiliesProjectYear]);

  const staticFamilyDistribution = staticFamilyDistributionForTarget;

  const sharedFamiliesTableRows = useMemo(() => {
    if (staticFamilyDistribution) {
      return staticFamilyDistribution.rows.map((row, index) => ({
        id: `${row.label}-${index}`,
        label: row.label,
        familias: row.familias,
        isUnclassified: false,
      }));
    }

    return buildSharedFamiliesDistributionRows({
      combinaciones: Array.isArray(sharedFamilies?.combinaciones) ? sharedFamilies.combinaciones : [],
      officialTotal: sharedFamiliesOfficialTotal,
      schoolLabel: sharedFamiliesDisplaySchool || sharedFamiliesTargetSchool || "este colegio",
    });
  }, [sharedFamilies, sharedFamiliesOfficialTotal, sharedFamiliesDisplaySchool, sharedFamiliesTargetSchool, staticFamilyDistribution]);

  // Estados de la tabla de familias
  const [familyTrendFilter, setFamilyTrendFilter] = useState<"all"|"up"|"down"|"flat">("all");
  const [familyPage, setFamilyPage] = useState(1);
  const [selectedFamilyModal, setSelectedFamilyModal] = useState<any | null>(null);
  const [historicalCommentLoading, setHistoricalCommentLoading] = useState(false);
  const [currentCommentLoading, setCurrentCommentLoading] = useState(false);
  const loadedCurrentCommentIdsRef = useRef<Set<string>>(new Set());
  const FAMILIES_PER_PAGE = 8;

  const currentYear = useMemo(() => getMostFrequentYear(stats.schoolData), [stats.schoolData]);
  const activeSchoolPolo = useMemo(() => {
    if (activeSchool === "Todos los colegios") return ownPolo || "";
    const match = stats.schoolData.find((r: SurveyRow) => matchesSchoolName(String(r.colegio || ""), activeSchool));
    return String(match?.polo || ownPolo || "");
  }, [stats.schoolData, activeSchool, ownPolo]);

  const compareTargetSchoolLabel = useMemo(() => {
    if (activeSchool !== "Todos los colegios") return activeSchool;
    return ownSchool || "";
  }, [activeSchool, ownSchool]);

  const compareSelectorTitle = compareTargetSchoolLabel ? "Comparar año" : "Comparar contra";
  const compareSelectorPlaceholder = compareTargetSchoolLabel ? "Seleccioná un año..." : "Seleccioná un proyecto histórico...";
  const compareSelectorHelp = compareTargetSchoolLabel
    ? `Se muestran los años disponibles para ${shortSchoolName(compareTargetSchoolLabel)}.`
    : "Solo se muestran proyectos distintos al actual para evitar comparaciones duplicadas.";

  const visibleFamilySchools = useMemo(() => {
    if (!familyParticipationExecutive) return [];
    if (activeSchool === "Todos los colegios") return familyParticipationExecutive.allSchools;
    return familyParticipationExecutive.allSchools.filter((school: any) => matchesSchoolName(school.colegio, activeSchool));
  }, [familyParticipationExecutive, activeSchool]);

  const visibleChildrenComposition = useMemo(() => {
    if (!visibleFamilySchools.length) return null;
    return aggregateChildrenComposition(visibleFamilySchools);
  }, [visibleFamilySchools]);

  const isExecutiveAllSchoolsView = canEditThemes && activeSchool === "Todos los colegios";

  const currentRowsSignature = useMemo(() => {
    const rows = stats.schoolData || [];
    const scoreSum = rows.reduce((acc: number, row: SurveyRow) => acc + Number(row.score || 0), 0);
    return `${rows.length}:${scoreSum}`;
  }, [stats.schoolData]);

  useEffect(() => {
    let mounted = true;

    cachedClientAction(`apdes:action:director-projects:${projectId || "global"}`, async () => {
       const results = await Promise.allSettled([listarProyectosDB(), listarProyectosComparacionNpsDB()]);
       const visibleProjects = results[0].status === "fulfilled"
         ? (Array.isArray(results[0].value) ? results[0].value : ((results[0].value as any)?.rows || []))
         : [];
       const compareProjects = results[1].status === "fulfilled"
         ? (Array.isArray(results[1].value) ? results[1].value : ((results[1].value as any)?.rows || []))
         : [];

       const mergedMap = new Map<string, any>();
       [...visibleProjects, ...compareProjects].forEach((p: any) => {
         if (p?.id) mergedMap.set(String(p.id), p);
       });
       return Array.from(mergedMap.values());
    }).then((data) => {
       if (!mounted) return;

       const currentProjectId = projectId || stats.schoolData[0]?.projectId;
       const currentFromCatalog = data.find((p: any) => String(p?.id) === String(currentProjectId));
       const currentProjectName = String(currentFromCatalog?.nombre || stats.schoolData[0]?.projectName || "");
       const currentProjectNameNorm = normalize(currentProjectName);
       const baseTrack = projectTrack(currentProjectName);
       const baseFiltered = data.filter((p: any) => {
         if (String(p.id) === String(currentProjectId)) return false;
         const optionNameNorm = normalize(String(p?.nombre || ""));
         if (currentProjectNameNorm && optionNameNorm === currentProjectNameNorm) return false;
         return true;
       });
       const sameTrack = baseFiltered.filter((p: any) => {
         const t = projectTrack(String(p?.nombre || ""));
         if (baseTrack === "otro") return true;
         return t === baseTrack;
       });
       const projectsByTrack = sameTrack.length > 0 ? sameTrack : baseFiltered;
       const restricted = allowedCompareProjectIds.length > 0
         ? projectsByTrack.filter((p: any) => allowedCompareProjectIds.includes(String(p.id)))
         : projectsByTrack;
       const filtered = restricted.length > 0 ? restricted : projectsByTrack;
       const ordered = filtered.sort((a: any, b: any) => {
         const yearDiff = extraerAnio(String(b?.nombre || "")) - extraerAnio(String(a?.nombre || ""));
         if (yearDiff !== 0) return yearDiff;
         return String(b?.creado_at || "").localeCompare(String(a?.creado_at || ""));
       });
       setAllProjects(ordered);
    });

    return () => {
      mounted = false;
    };
  }, [stats.schoolData, allowedCompareProjectIds, projectId]);

  // Carga de datos del proyecto a comparar
  useEffect(() => {
    if (!compareProjectId) {
      setCompareData(null);
      setCrossFamilyData([]);
      return;
    }

    const currentProjectId = stats.schoolData[0]?.projectId || projectId;
    if (currentProjectId && compareProjectId === currentProjectId) {
      setCompareData(null);
      setCrossFamilyData([]);
      setCompareProjectId("");
      return;
    }

    const compareTargetSchool = activeSchool !== "Todos los colegios" ? activeSchool : ownSchool;
    const cacheKey = directorCompareCacheKey(currentProjectId, compareProjectId, compareTargetSchool, currentRowsSignature);
    const cached = readDirectorCompareCache(cacheKey);

    if (cached) {
      setCompareData(cached.compareData);
      setCrossFamilyData(Array.isArray(cached.crossFamilyData) ? cached.crossFamilyData : []);
      setFamilyPage(1);
      setCompareLoading(false);
      return;
    }

    let cancelled = false;
    setCompareLoading(true);

    obtenerEncuestasComparacionLigeraDB(compareProjectId).then((data: any) => {
      if (cancelled) return;

      const rows = Array.isArray(data) ? data : data.rows || [];
      const proyectoComparado = allProjects.find(p => p.id === compareProjectId);
      const anioComparado = extraerAnio(proyectoComparado?.nombre || "");
      const nombreComparado = formatCompareTextLabel(proyectoComparado, compareTargetSchool);
      
      let validRows = rows.map((item: any) => ({
         nombre: String(item.nombre || ""),
         apellido: String(item.apellido || ""),
         score: Number(item.score) || 0,
         positive: String(item.positive || ""),
         improvement: String(item.improvement || ""),
         colegio: String(item.colegio || "APDES"),
         curso: String(item.curso || ""),
         year: anioComparado,
         anonFamilyKey: String(item.anonFamilyKey || ""),
         anonCompositeKey: String(item.anonCompositeKey || ""),
      })).filter((r: any) => !isNaN(r.score) && r.score > 0);

      if (compareTargetSchool) {
         validRows = validRows.filter((r: any) => matchesSchoolName(String(r.colegio || ""), compareTargetSchool));
      }

      const total = validRows.length;
      if (total === 0) {
        const emptyCompare = { total: 0, nps: 0, avg: "0.0", year: anioComparado, nombre: nombreComparado };
        setCompareData(emptyCompare);
        setCrossFamilyData([]);
        writeDirectorCompareCache(cacheKey, { compareData: emptyCompare, crossFamilyData: [] });
        return;
      }

      const promoters = validRows.filter((r: any) => r.score >= 9).length;
      const detractors = validRows.filter((r: any) => r.score <= 6).length;
      const nps = Math.round(((promoters - detractors) / total) * 100);
      const avg = (validRows.reduce((a: number, r: any) => a + r.score, 0) / total).toFixed(1);
      const nextCompareData = { total, nps, avg, year: anioComparado, nombre: nombreComparado };

      const currentByComposite = new Map<string, SurveyRow>();
      const currentByName = new Map<string, SurveyRow[]>();

      stats.schoolData.forEach((r: SurveyRow) => {
        const nameKey = String(r.anonFamilyKey || normalizeNameMatch(r.nombre, r.apellido));
        if (nameKey.length <= 3) return;

        const compositeKey = String(r.anonCompositeKey || normalizedFamilyKey(r.nombre, r.apellido, r.colegio, r.curso));
        if (!currentByComposite.has(compositeKey)) currentByComposite.set(compositeKey, r);

        const bucket = currentByName.get(nameKey) || [];
        bucket.push(r);
        currentByName.set(nameKey, bucket);
      });

      const intersection: any[] = [];
      validRows.forEach((r: any) => {
        const nameKey = String(r.anonFamilyKey || normalizeNameMatch(r.nombre, r.apellido));
        if (nameKey.length <= 3) return;

        const compositeKey = String(r.anonCompositeKey || normalizedFamilyKey(r.nombre, r.apellido, r.colegio, r.curso));
        let currentFam = currentByComposite.get(compositeKey);

        if (!currentFam) {
          const candidates = currentByName.get(nameKey) || [];
          if (candidates.length === 1) currentFam = candidates[0];
          else return;
        }

        const realName = `${currentFam.nombre || ""} ${currentFam.apellido || ""}`.trim();
        const trend = currentFam.score > r.score ? "up" : currentFam.score < r.score ? "down" : "flat";
        intersection.push({
          matchKey: nameKey,
          nombre: realName,
          isAnonymous: !realName,
          currentId: currentFam.id,
          currentScore: currentFam.score,
          compareScore: r.score,
          currentPositive: currentFam.positive,
          currentImprovement: currentFam.improvement,
          comparePositive: r.positive,
          compareImprovement: r.improvement,
          compareNombre: r.nombre,
          compareApellido: r.apellido,
          compareColegio: r.colegio,
          compareCurso: r.curso,
          trend,
        });
      });

      const uniqueIntersection = Array.from(new Map(intersection.map(item => [item.matchKey || item.nombre, item])).values())
        .map((item: any, idx: number) => ({
          ...item,
          nombre: item.nombre || `Persona anónima ${idx + 1}`,
        }));
      setCompareData(nextCompareData);
      setCrossFamilyData(uniqueIntersection);
      writeDirectorCompareCache(cacheKey, { compareData: nextCompareData, crossFamilyData: uniqueIntersection });
      setFamilyPage(1);

    }).catch(() => {
      if (cancelled) return;
      setCompareData(null);
      setCrossFamilyData([]);
    }).finally(() => {
      if (!cancelled) setCompareLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [compareProjectId, stats.schoolData, activeSchool, ownSchool, allProjects, projectId, currentRowsSignature]);

  const buildName = (r: SurveyRow) => `${r.nombre ?? ""} ${r.apellido ?? ""}`.trim() || "Anónimo";

  const addCustomTheme = () => {
    const name = newThemeName.trim();
    const words = newThemeKeywords
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    if (!name || words.length === 0) return;
    if (allThemes.some((t) => normalize(t.id) === normalize(name))) return;
    setAllThemes((prev) => [...prev, { id: name, keywords: words }]);
    setNewThemeName("");
    setNewThemeKeywords("");
    setIsCreatingTheme(false);
  };

  const startEditTheme = (themeId: string) => {
    const theme = allThemes.find((t) => t.id === themeId);
    if (!theme) return;
    setEditingThemeId(theme.id);
    setEditingThemeName(theme.id);
    setEditingThemeKeywords(theme.keywords.join(", "));
  };

  const saveThemeEdits = () => {
    if (!editingThemeId) return;
    const name = editingThemeName.trim();
    const words = editingThemeKeywords
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    if (!name || words.length === 0) return;
    if (allThemes.some((t) => t.id !== editingThemeId && normalize(t.id) === normalize(name))) return;

    setAllThemes((prev) =>
      prev.map((t) => (t.id === editingThemeId ? { ...t, id: name, keywords: words } : t))
    );
    if (commentTheme === editingThemeId) {
      setCommentTheme(name);
    }
    setEditingThemeId(null);
    setEditingThemeName("");
    setEditingThemeKeywords("");
  };

  const removeCustomTheme = (themeId: string) => {
    setAllThemes((prev) => prev.filter((t) => t.id !== themeId));
    if (commentTheme === themeId) setCommentTheme("Todos");
    if (editingThemeId === themeId) {
      setEditingThemeId(null);
      setEditingThemeName("");
      setEditingThemeKeywords("");
    }
  };

  const themeKeywords = useMemo(() => {
    if (commentTheme === "Todos") return [];
    return allThemes.find(x => x.id === commentTheme)?.keywords || [];
  }, [commentTheme, allThemes]);

  const directorComments = useMemo(() => {
    const search = normalize(commentSearch);

    // Si hay búsqueda, busca en toda la base cargada en esta vista,
    // sin quedar encerrado por Promotores/Satisfechos/Insatisfechos ni por tema.
    let rows = search || commentProfile === "Todos"
      ? [...filteredResponses]
      : [...filteredResponses].filter((r) => r.type === commentProfile);

    rows = rows.filter((r) => String(r.positive ?? "").trim().length > 0 || String(r.improvement ?? "").trim().length > 0);
    
    if (!search && commentTheme !== "Todos") {
      const theme = allThemes.find(t => t.id === commentTheme);
      if (theme) {
        rows = rows.filter(r => {
          const rawText = normalize(`${r.positive} ${r.improvement}`);
          return theme.keywords.some(kw => rawText.includes(normalize(kw)));
        });
      }
    }

    if (showSavedOnly) {
      rows = rows.filter((r) => savedCommentIds.includes(r.id));
    }

    if (search) {
      rows = rows.filter((r) => {
        const haystack = normalize(`${r.nombre} ${r.apellido} ${r.colegio} ${r.curso} ${r.polo} ${r.positive} ${r.improvement}`);
        return haystack.includes(search);
      });
    }

    rows = [...rows].sort((a, b) => {
      const seed = sessionSeed + commentRefreshCounter;
      const aSeed = seededOrder(`${a.id}-${a.score}`, seed);
      const bSeed = seededOrder(`${b.id}-${b.score}`, seed);
      return aSeed - bSeed;
    });

    return rows.slice(0, directorCommentLimit);
  }, [filteredResponses, commentProfile, directorCommentLimit, commentTheme, commentRefreshCounter, allThemes, sessionSeed, showSavedOnly, savedCommentIds, commentSearch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem("director:saved-comments");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSavedCommentIds(parsed.map((x) => String(x)));
      }
    } catch {
      setSavedCommentIds([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("director:saved-comments", JSON.stringify(savedCommentIds));
  }, [savedCommentIds]);

  const toggleSaveComment = (id: string) => {
    setSavedCommentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    setThemesHydrated(false);
    setThemesSyncMessage("");
    setAllThemes([]);
    lastSavedThemesKeyRef.current = "";

    if (typeof window !== "undefined" && projectId) {
      try {
        window.sessionStorage.removeItem(`director-themes:${projectId}`);
      } catch {
        // Evita reutilizar categorías viejas cacheadas por versiones anteriores.
      }
    }

    if (!projectId) {
      const nextThemes = THEMES_LIST;
      lastSavedThemesKeyRef.current = themesKey(nextThemes);
      skipNextThemeSaveRef.current = true;
      setAllThemes(nextThemes);
      setThemesHydrated(true);
      return;
    }

    cachedClientAction(`apdes:action:director-themes:${projectId}`, () => obtenerTemasProyectoDB(projectId))
      .then((themes) => {
        const normalized = cleanThemes(themes);

        if (normalized.length > 0) {
          lastSavedThemesKeyRef.current = themesKey(normalized);
          skipNextThemeSaveRef.current = true;
          setAllThemes(normalized);
          return;
        }

        // Si la base no devuelve categorías, no mostramos defaults viejos ni guardamos encima.
        lastSavedThemesKeyRef.current = "";
        skipNextThemeSaveRef.current = true;
        setAllThemes([]);
        setThemesSyncMessage("No hay categorías guardadas para este proyecto.");
      })
      .catch(() => {
        // Si falla la carga, no reemplazamos por categorías por defecto para no confundir ni pisar cambios.
        lastSavedThemesKeyRef.current = "";
        skipNextThemeSaveRef.current = true;
        setAllThemes([]);
        setThemesSyncMessage("No se pudieron cargar las categorías del proyecto.");
      })
      .finally(() => setThemesHydrated(true));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !themesHydrated || !canEditThemes) return;

    const currentKey = themesKey(allThemes);
    if (skipNextThemeSaveRef.current) {
      skipNextThemeSaveRef.current = false;
      return;
    }
    if (!currentKey || currentKey === lastSavedThemesKeyRef.current) return;

    guardarTemasProyectoDB(projectId, allThemes)
      .then(() => {
        lastSavedThemesKeyRef.current = currentKey;
        setThemesSyncMessage("Categorías guardadas.");
      })
      .catch(() => setThemesSyncMessage("No se pudieron guardar las categorías."));
  }, [allThemes, projectId, themesHydrated, canEditThemes]);

  // Evitamos sincronizaciones automáticas en segundo plano porque disparaban POSTs
  // pesados en /dashboard/surveys. Para traer cambios de otra PC/cuenta, usar
  // el botón "Sincronizar ahora".


  const copyVarones2025ThemesToDirector = async () => {
    if (!canEditThemes || !projectId || copyVarones2025Loading) return;

    const confirmed = window.confirm(
      "Esto va a reemplazar las categorías de este proyecto con las categorías de Varones 2025.\n\nUsalo solo para corregir Mujeres 2025. ¿Confirmás?"
    );

    if (!confirmed) return;

    setCopyVarones2025Loading(true);
    setThemesSyncMessage("Buscando Varones 2025...");

    try {
      const projectsResult = await listarProyectosDB();
      const projects = Array.isArray(projectsResult) ? projectsResult : (projectsResult as any)?.rows || [];
      const sourceProject = projects.find((project: any) => {
        const name = normalize(String(project?.nombre || ""));
        return name.includes("varon") && name.includes("2025");
      });

      if (!sourceProject?.id) {
        setThemesSyncMessage("No encontré el proyecto Varones 2025 para copiar categorías.");
        return;
      }

      const result = await copiarTemasDesdeProyectoDB(projectId, String(sourceProject.id));
      const normalized = cleanThemes((result as any)?.themes);

      if (normalized.length === 0) {
        setThemesSyncMessage("Varones 2025 no tiene categorías guardadas para copiar.");
        return;
      }

      lastSavedThemesKeyRef.current = themesKey(normalized);
      skipNextThemeSaveRef.current = true;
      setAllThemes(normalized);

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(`apdes:action:director-themes:${projectId}`);
          window.sessionStorage.removeItem(`apdes:action:team-config:${projectId}`);
        } catch {
          // Cache opcional: no bloquea la copia.
        }
      }

      setThemesSyncMessage("Categorías copiadas desde Varones 2025 en este proyecto. Si estabas viendo Equipo, tocá Sincronizar ahora ahí también.");
    } catch (error: any) {
      setThemesSyncMessage(error?.message || "No se pudieron copiar las categorías desde Varones 2025.");
    } finally {
      setCopyVarones2025Loading(false);
    }
  };

  const syncThemesNow = () => {
    if (!projectId) return;
    setThemesSyncing(true);
    setThemesSyncMessage("Sincronizando categorías...");

    Promise.allSettled([obtenerTemasProyectoDB(projectId), obtenerHistorialTemasProyectoDB(projectId)])
      .then(([themesResult, historyResult]) => {
        if (themesResult.status === "fulfilled") {
          const normalized = cleanThemes(themesResult.value);
          if (normalized.length > 0) {
            lastSavedThemesKeyRef.current = themesKey(normalized);
            skipNextThemeSaveRef.current = true;
            setAllThemes(normalized);
            setThemesSyncMessage("Categorías sincronizadas con la base.");
          } else {
            setThemesSyncMessage("No hay categorías guardadas para este proyecto.");
          }
        } else {
          setThemesSyncMessage("No se pudieron traer las categorías actuales.");
        }

        if (historyResult.status === "fulfilled") {
          const mapped = (Array.isArray(historyResult.value) ? historyResult.value : []).map((r: any) => ({
            created_at: String(r?.created_at ?? ""),
            updated_by: r?.updated_by ? String(r.updated_by) : null,
            changes: Array.isArray(r?.changes) ? (r.changes as ThemeHistoryChange[]) : [],
          }));
          setHistoryItems(mapped);
        } else {
          setHistoryItems([]);
        }

        setHistoryOpen(true);
      })
      .finally(() => setThemesSyncing(false));
  };

  const applyThemeHistoryItem = (item: ThemeHistoryItem) => {
    const snapshotChange = item.changes.find((change) => Array.isArray(change.snapshotAfter));
    const snapshot = cleanThemes(snapshotChange?.snapshotAfter);

    if (snapshot.length > 0) {
      setAllThemes(snapshot);
      setThemesSyncMessage("Snapshot histórico aplicado. Se guardará como versión actual.");
      setHistoryOpen(false);
      return;
    }

    setAllThemes((prev) => {
      const map = new Map(prev.map((theme) => [theme.id, { ...theme, keywords: [...theme.keywords] }]));

      item.changes.forEach((change) => {
        const themeId = String(change.themeId || "").trim();
        if (!themeId) return;

        const fullKeywords = Array.isArray(change.keywords)
          ? change.keywords.map((x) => String(x).trim()).filter(Boolean)
          : [];
        const addedKeywords = Array.isArray(change.addedKeywords)
          ? change.addedKeywords.map((x) => String(x).trim()).filter(Boolean)
          : [];

        if (change.type === "deleted" && fullKeywords.length > 0) {
          map.set(themeId, { id: themeId, keywords: Array.from(new Set(fullKeywords)) });
          return;
        }

        if (change.type === "created" && fullKeywords.length > 0) {
          map.set(themeId, { id: themeId, keywords: Array.from(new Set(fullKeywords)) });
          return;
        }

        if (change.type === "updated" && addedKeywords.length > 0) {
          const current = map.get(themeId) || { id: themeId, keywords: [] };
          map.set(themeId, {
            id: themeId,
            keywords: Array.from(new Set([...current.keywords, ...addedKeywords])),
          });
        }
      });

      return Array.from(map.values()).filter((theme) => theme.id && theme.keywords.length > 0);
    });

    setThemesSyncMessage("Cambios del historial aplicados. Se guardarán como versión actual.");
    setHistoryOpen(false);
  };

  const regionalData = useMemo(() => {
    const sourceRows = (regionalRows && regionalRows.length > 0 ? regionalRows : stats.schoolData) as SurveyRow[];
    const targetSchool = activeSchool !== "Todos los colegios" ? activeSchool : ownSchool;
    const currentTrack = projectTrack(currentProjectName || stats.schoolData?.[0]?.projectName || "");

    if (npsViewMode === "historico") {
      // Admin en “Todos los colegios” ve el histórico del proyecto.
      // Director con colegio propio ve el histórico de su colegio, aunque el selector global esté en “Todos los colegios”.
      const isProjectHistoricalView = activeSchool === "Todos los colegios" && !targetSchool;
      const historicalRows = isProjectHistoricalView
        ? sourceRows.filter((r) => {
            const rowTrack = projectTrack(r.projectName || currentProjectName || "");
            return currentTrack === "otro" || rowTrack === "otro" || rowTrack === currentTrack;
          })
        : sourceRows.filter((r) => targetSchool && matchesSchoolName(r.colegio, targetSchool));

      const grouped = new Map<number, { total: number; promoters: number; detractors: number }>();

      historicalRows.forEach((r) => {
        const year = Number(r.year);
        if (!Number.isFinite(year) || year < 2000) return;

        const bucket = grouped.get(year) || { total: 0, promoters: 0, detractors: 0 };
        bucket.total += 1;
        if (r.score >= 9) bucket.promoters += 1;
        if (r.score > 0 && r.score <= 6) bucket.detractors += 1;
        grouped.set(year, bucket);
      });

      return Array.from(grouped.entries())
        .map(([year, v]) => ({
          name: String(year),
          nps: v.total ? Math.round(((v.promoters - v.detractors) / v.total) * 100) : 0,
          respuestas: v.total,
          polo: isProjectHistoricalView ? currentTrack || "Proyecto" : ownPolo || "Sin polo",
        }))
        .sort((a, b) => Number(a.name) - Number(b.name));
    }

    const currentYearRows = sourceRows.filter((r) => Number(r.year) === Number(currentYear));
    const yearScopedRows = currentYearRows.length > 0 ? currentYearRows : sourceRows;
    const targetPolo = ownPolo || fixedPolo || activeSchoolPolo || "";
    const isAllSchoolsPoloView = activeSchool === "Todos los colegios";

    const currentProjectRows = yearScopedRows.filter((r) => {
      const rowProjectId = String(r.projectId || "");
      const rowProjectName = String(r.projectName || "");
      const sameProjectById = projectId ? rowProjectId === String(projectId) : false;
      const sameProjectByName = currentProjectName ? rowProjectName === currentProjectName : false;
      return sameProjectById || sameProjectByName;
    });

    const currentProjectFallbackRows = (stats.schoolData as SurveyRow[]).filter((r: SurveyRow) => Number(r.year) === Number(currentYear));
    const allSchoolsRows = currentProjectRows.length > 0
      ? currentProjectRows
      : currentProjectFallbackRows.length > 0
        ? currentProjectFallbackRows
        : (stats.schoolData as SurveyRow[]);

    const poolRows = isAllSchoolsPoloView
      ? allSchoolsRows
      : yearScopedRows.filter((r) => {
          const inPolo = targetPolo ? matchesPoloName(r.polo, targetPolo) : false;
          const inSchool = targetSchool ? matchesSchoolName(r.colegio, targetSchool) : false;
          return inPolo || inSchool;
        });

    // Si no encuentra el polo, no mostramos todo el año porque mezclaría colegios no permitidos.
    // En "Todos los colegios", sí mostramos todos los colegios del proyecto actual.
    const ownSchoolRows = yearScopedRows.filter((r) => targetSchool && matchesSchoolName(r.colegio, targetSchool));
    const rankingRows = isAllSchoolsPoloView
      ? allSchoolsRows
      : poolRows.length > 0
        ? poolRows
        : ownSchoolRows;

    const map: Record<string, { total: number; promoters: number; detractors: number; polo?: string }> = {};
    const labelByKey: Record<string, string> = {};

    rankingRows.forEach((r: SurveyRow) => {
      const schoolLabel = canonicalNpsSchoolName(String(r.colegio || "Sin Colegio"));
      const key = normalizeSchoolForCompare(schoolLabel) || schoolKey(schoolLabel) || "sin colegio";
      if (!labelByKey[key]) labelByKey[key] = schoolLabel;

      if (!map[key]) map[key] = { total: 0, promoters: 0, detractors: 0, polo: String(r.polo || "Sin polo") };
      map[key].total += 1;
      if (r.score >= 9) map[key].promoters += 1;
      if (r.score > 0 && r.score <= 6) map[key].detractors += 1;
    });

    const rows = Object.entries(map)
      .map(([key, v]) => ({
        name: (labelByKey[key] || key).replace("Buenos Aires", "BsAs").replace("Tucumán", "Tuc"),
        nps: v.total ? Math.round(((v.promoters - v.detractors) / v.total) * 100) : 0,
        respuestas: v.total,
        polo: v.polo || "Sin polo",
      }))
      .filter((row) => normalize(row.name) !== "admin")
      .sort((a, b) => b.nps - a.nps);

    const hasRealSchools = rows.some((row) => {
      const n = normalize(row.name);
      return n && n !== "apdes" && n !== "general";
    });

    return hasRealSchools
      ? rows.filter((row) => {
          const n = normalize(row.name);
          return n !== "apdes" && n !== "general";
        })
      : rows;
  }, [stats.schoolData, regionalRows, activeSchool, npsViewMode, ownSchool, ownPolo, fixedPolo, currentYear, activeSchoolPolo, currentProjectName, projectId]);

  const npsHighlightedSchool = useMemo(() => {
    if (activeSchool !== "Todos los colegios") return activeSchool;
    return ownSchool || "";
  }, [activeSchool, ownSchool]);

  const getNpsBarColor = (entry: any) => {
    if (npsViewMode === "historico") return "#1D4ED8";

    // Admin / Equipo en vista general: semáforo por valor de NPS.
    // Verde: 50 o más · Azul: 0 a 49 · Rojo: negativo.
    const isGeneralAdminView = canEditThemes && activeSchool === "Todos los colegios" && !ownSchool && !isPoleDirector;
    if (isGeneralAdminView) {
      return Number(entry?.nps || 0) >= 50
        ? "#10B981"
        : Number(entry?.nps || 0) >= 0
          ? "#3B82F6"
          : "#EF4444";
    }

    // Director / Director de Polo con colegio seleccionado:
    // el colegio donde estás parado queda azul; el resto amarillo.
    if (npsHighlightedSchool && matchesSchoolName(entry?.name, npsHighlightedSchool)) {
      return "#1D4ED8";
    }

    return "#F59E0B";
  };

  const topPositives = useMemo(() => {
    const counts: Record<string, number> = {};
    stats.schoolData.forEach((r: SurveyRow) => {
      const raw = normalize(r.positive);
      allThemes.forEach(t => {
        if (t.keywords.some(kw => raw.includes(normalize(kw)))) counts[t.id] = (counts[t.id] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); 
  }, [stats.schoolData, allThemes]);


  // Filtro y Paginación de Familias
  const filteredFamilies = useMemo(() => {
    if (familyTrendFilter === "all") return crossFamilyData;
    return crossFamilyData.filter(f => f.trend === familyTrendFilter);
  }, [crossFamilyData, familyTrendFilter]);

  const familyTotalPages = Math.ceil(filteredFamilies.length / FAMILIES_PER_PAGE);
  const paginatedFamilies = filteredFamilies.slice((familyPage - 1) * FAMILIES_PER_PAGE, familyPage * FAMILIES_PER_PAGE);


  const openFamilyComparisonModal = (family: any) => {
    setSelectedFamilyModal(family);

    const currentProjectId = projectId || stats.schoolData?.[0]?.projectId;
    const currentCommentCacheKey = currentProjectId && family?.currentId ? `${currentProjectId}:${family.currentId}` : "";

    if (currentProjectId && family?.currentId && !loadedCurrentCommentIdsRef.current.has(currentCommentCacheKey)) {
      loadedCurrentCommentIdsRef.current.add(currentCommentCacheKey);
      setCurrentCommentLoading(true);
      obtenerComentarioCompletoEncuestaDB(currentProjectId, family.currentId)
        .then((full) => {
          if (!full) return;
          setSelectedFamilyModal((current: any) => {
            if (!current || current.nombre !== family.nombre) return current;
            return {
              ...current,
              currentPositive: full.positive || current.currentPositive || "",
              currentImprovement: full.improvement || current.currentImprovement || "",
            };
          });
        })
        .catch(() => undefined)
        .finally(() => setCurrentCommentLoading(false));
    } else {
      setCurrentCommentLoading(false);
    }

    const alreadyHasHistoricalText =
      String(family?.comparePositive || "").trim().length > 3 ||
      String(family?.compareImprovement || "").trim().length > 3;

    if (!compareProjectId || alreadyHasHistoricalText) {
      setHistoricalCommentLoading(false);
      return;
    }

    setHistoricalCommentLoading(true);
    obtenerRespuestaHistoricaFamiliaDB(compareProjectId, {
      nombre: family?.compareNombre || family?.nombre?.split(" ")?.[0] || "",
      apellido: family?.compareApellido || "",
      colegio: family?.compareColegio || sharedFamiliesDisplaySchool || activeSchool,
      curso: family?.compareCurso || "",
    })
      .then((historical) => {
        if (!historical) return;
        setSelectedFamilyModal((current: any) => {
          if (!current || current.nombre !== family.nombre) return current;
          return {
            ...current,
            comparePositive: historical.positive || current.comparePositive || "",
            compareImprovement: historical.improvement || current.compareImprovement || "",
          };
        });
      })
      .catch(() => undefined)
      .finally(() => setHistoricalCommentLoading(false));
  };

  return (
    <div className="space-y-6 relative">
      
      {/* MODAL DE RAYOS X (Detalle Familia) */}
      {selectedFamilyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedFamilyModal(null)}>
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl font-black text-slate-900">{selectedFamilyModal.nombre}</h2>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">Comparación de respuestas por persona</p>
                </div>
                <button onClick={() => setSelectedFamilyModal(null)} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                   <X size={20} weight="bold" />
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {/* Proyecto Viejo */}
                <div className="p-6">
                   <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{compareData?.nombre}</span>
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5">AÑO {compareData?.year}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-sm font-black ${selectedFamilyModal.compareScore >= 9 ? "bg-emerald-100 text-emerald-700" : selectedFamilyModal.compareScore >= 7 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        Nota {selectedFamilyModal.compareScore}
                      </span>
                   </div>
                   <div className="space-y-5 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                     <div>
                       <p className="text-[10px] font-black uppercase text-emerald-600 mb-1.5 flex items-center gap-1.5"><ThumbsUp size={14} weight="fill"/> Lo que valoraba</p>
                       <p className="text-sm font-medium text-slate-600 leading-relaxed italic bg-slate-50 p-3 rounded-xl border border-slate-100">&ldquo;{historicalCommentLoading ? "Cargando comentario histórico..." : selectedFamilyModal.comparePositive || "Sin comentario cargado en este campo"}&rdquo;</p>
                     </div>
                     <div>
                       <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 flex items-center gap-1.5"><Wrench size={14} weight="fill"/> Oportunidades de mejora</p>
                       <p className="text-sm font-medium text-slate-600 leading-relaxed italic bg-slate-50 p-3 rounded-xl border border-slate-100">&ldquo;{historicalCommentLoading ? "Cargando comentario histórico..." : selectedFamilyModal.compareImprovement || "Sin comentario cargado en este campo"}&rdquo;</p>
                     </div>
                   </div>
                </div>

                {/* Proyecto Actual */}
                <div className="p-6 bg-blue-50/20">
                   <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest text-blue-600">Actual</span>
                        <span className="text-[10px] font-bold text-blue-500 mt-0.5">AÑO {currentYear}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-sm font-black ${selectedFamilyModal.currentScore >= 9 ? "bg-emerald-100 text-emerald-700" : selectedFamilyModal.currentScore >= 7 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        Nota {selectedFamilyModal.currentScore}
                      </span>
                   </div>
                   <div className="space-y-5 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                     <div>
                       <p className="text-[10px] font-black uppercase text-emerald-600 mb-1.5 flex items-center gap-1.5"><ThumbsUp size={14} weight="fill"/> Lo que valora ahora</p>
                       <p className="text-sm font-medium text-slate-900 leading-relaxed bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">&ldquo;{currentCommentLoading ? "Cargando comentario completo..." : selectedFamilyModal.currentPositive || "Sin comentario cargado en este campo"}&rdquo;</p>
                     </div>
                     <div>
                       <p className="text-[10px] font-black uppercase text-amber-600 mb-1.5 flex items-center gap-1.5"><Wrench size={14} weight="fill"/> Oportunidades de mejora actuales</p>
                       <p className="text-sm font-medium text-slate-900 leading-relaxed bg-white p-3 rounded-xl border border-amber-100 shadow-sm">&ldquo;{currentCommentLoading ? "Cargando comentario completo..." : selectedFamilyModal.currentImprovement || "Sin comentario cargado en este campo"}&rdquo;</p>
                     </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* KPIs Rápidos y NPS */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-4 flex flex-col items-center justify-center rounded-[32px] border border-white bg-white/85 p-6 shadow-2xl backdrop-blur-xl">
          <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">NPS General</p>
          <NpsGauge nps={stats.nps} total={stats.total} />
        </div>

        <div className="xl:col-span-3 rounded-[32px] border border-white bg-white/85 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex h-full flex-col justify-center">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">Participación familiar</p>
            {familyParticipationLoading && !familyParticipationExecutive ? (
              <div className="mt-5 flex items-center gap-2 text-xs font-black text-slate-500">
                <CircleNotch size={16} weight="bold" className="animate-spin text-blue-600" />
                Cargando participación...
              </div>
            ) : familyParticipationExecutive ? (
              <>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-display text-5xl font-black leading-none text-blue-600">
                    {familyParticipationExecutive.participationPct}%
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                  De {familyParticipationExecutive.totalFamilias} familias, se obtuvieron {familyParticipationExecutive.familiasConRespuesta} respuestas familiares.
                </p>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  Cuenta familias, no encuestas individuales.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm font-bold text-slate-400">Sin datos de participación familiar.</p>
            )}
          </div>
        </div>

        <div className="xl:col-span-5 rounded-[32px] border border-white bg-white/85 p-6 shadow-xl backdrop-blur-xl">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-black text-slate-900">
            <ChartBar size={18} className="text-blue-500" /> Distribución de respuestas
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-emerald-50 p-4 text-center">
              <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">Promotores</span>
              <span className="text-3xl font-black text-emerald-500">{stats.promoters}</span>
              <span className="mt-1 text-xs font-bold text-emerald-400">{percentage(stats.promoters, stats.total)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-amber-50 p-4 text-center">
              <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-600">Satisfechos</span>
              <span className="text-3xl font-black text-amber-500">{stats.passives}</span>
              <span className="mt-1 text-xs font-bold text-amber-400">{percentage(stats.passives, stats.total)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-red-50 p-4 text-center">
              <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-red-600">Insatisfechos</span>
              <span className="text-3xl font-black text-red-500">{stats.detractors}</span>
              <span className="mt-1 text-xs font-bold text-red-400">{percentage(stats.detractors, stats.total)}%</span>
            </div>
          </div>
        </div>
      </div>

      {(sharedFamiliesLoading || sharedFamilies || staticFamilyDistribution) && (
        <div className="rounded-[24px] border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">
                {staticFamilyDistribution
                  ? `Distribución de familias ${staticFamilyDistribution.titleSchool} en el Polo ${staticFamilyDistribution.polo}`
                  : `Distribución de familias ${shortSchoolName(sharedFamiliesDisplaySchool || sharedFamiliesTargetSchool)} en el ${activeSchoolPolo ? `Polo ${activeSchoolPolo}` : "polo"}`}
              </p>
              <p className="mt-1 text-xs font-semibold text-sky-900">
                Total: {staticFamilyDistribution?.total || sharedFamiliesOfficialTotal || sharedFamiliesTotal} familias.
              </p>
            </div>
            {(staticFamilyDistribution?.year || sharedFamilies?.year) && (
              <p className="text-[11px] font-bold text-sky-700">Año {staticFamilyDistribution?.year || sharedFamilies.year}</p>
            )}
          </div>

          {sharedFamiliesLoading && !sharedFamilies?.resumen ? (
            <p className="mt-4 rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs font-black text-sky-700">
              Calculando composición entre colegios...
            </p>
          ) : !staticFamilyDistribution && !sharedFamilies?.resumen ? (
            <p className="mt-4 rounded-xl border border-amber-100 bg-white px-3 py-2 text-xs font-black text-amber-700">
              {sharedFamilies?.mensaje || "No se encontró composición familiar para este colegio/año."}
            </p>
          ) : sharedFamiliesTableRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-sky-100 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-sky-50 text-sky-800">
                  <tr>
                    <th className="px-3 py-3 text-left font-black uppercase tracking-widest">Distribución</th>
                    <th className="px-3 py-3 text-right font-black uppercase tracking-widest">Familias</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedFamiliesTableRows.map((item: any) => (
                    <tr key={item.id} className="border-t border-sky-50 text-slate-700">
                      <td className="px-3 py-3 font-bold">{item.label}</td>
                      <td className="px-3 py-3 text-right font-black text-sky-800">{item.familias}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-sky-100 bg-sky-50/70 text-sky-900">
                    <td className="px-3 py-3 font-black uppercase tracking-widest">Familias totales</td>
                    <td className="px-3 py-3 text-right font-black">{staticFamilyDistribution?.total || sharedFamiliesOfficialTotal || sharedFamiliesTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs font-black text-sky-700">
              No hay recorridos familiares para mostrar.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* COMPARATIVA ESTRATÉGICA (YoY) */}
        <div className="rounded-[32px] border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/40 to-blue-50/50 p-6 shadow-xl backdrop-blur-xl flex flex-col">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-indigo-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><Scales size={20} weight="fill" /></div>
              <div>
                <h3 className="font-display text-base font-black text-slate-900">Comparativa de Impacto</h3>
                <p className="text-[10px] font-medium text-indigo-500">Cruzá datos para ver evolución, cambios y desvíos clave.</p>
              </div>
            </div>
            <HelpTip
              title="Comparativa de impacto"
              body={compareTargetSchoolLabel ? "Fuente: respuestas cargadas en el año actual y en el año histórico seleccionado. Compara Participación (cantidad de respuestas) y NPS." : "Fuente: respuestas cargadas en este proyecto y en el proyecto histórico seleccionado. Compara Participación (cantidad de respuestas) y NPS."}
            />
          </div>

          <div className="flex-1 flex flex-col">
            <div className="mb-6 rounded-2xl border border-indigo-100 bg-white/90 p-3">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-indigo-500">{compareSelectorTitle}</span>
              <select 
                value={compareProjectId} 
                onChange={(e) => setCompareProjectId(e.target.value)}
                className="w-full rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-sm font-bold text-slate-800 outline-none cursor-pointer transition-all hover:border-indigo-300 focus:border-indigo-400"
              >
                <option value="">{compareSelectorPlaceholder}</option>
                {allProjects.map((p) => (
                  <option key={p.id} value={p.id}>{formatCompareYearLabel(p, compareTargetSchoolLabel)}</option>
                ))}
              </select>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {compareSelectorHelp}
              </p>
            </div>

            {compareLoading ? (
              <div className="flex justify-center items-center py-10 text-slate-400"><CircleNotch size={32} className="animate-spin"/></div>
            ) : compareData && compareData.total > 0 ? (
              <>
                {/* KPIs Claros de Comparativa */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
                     <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Respuestas</p>
                     <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-slate-400">Actual</span>
                        <span className="text-sm font-black text-slate-800">{stats.total}</span>
                     </div>
                     <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-2">
                        <span className="text-xs font-bold text-slate-400">Anterior</span>
                        <span className="text-sm font-black text-slate-500">{compareData.total}</span>
                     </div>
                     <p className={`text-xs font-bold text-center mt-2 pt-2 border-t border-slate-100 ${stats.total > compareData.total ? "text-emerald-600" : "text-red-500"}`}>
                       {stats.total > compareData.total ? `+${stats.total - compareData.total} respuestas` : `${stats.total - compareData.total} respuestas`}
                     </p>
                  </div>

                  <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
                     <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Puntos NPS</p>
                     <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-slate-400">Actual</span>
                        <span className="text-sm font-black text-slate-800">{stats.nps}</span>
                     </div>
                     <div className="flex justify-between items-end border-b border-slate-100 pb-2 mb-2">
                        <span className="text-xs font-bold text-slate-400">Anterior</span>
                        <span className="text-sm font-black text-slate-500">{compareData.nps}</span>
                     </div>
                     <p className={`text-xs font-bold text-center mt-2 pt-2 border-t border-slate-100 ${stats.nps > compareData.nps ? "text-emerald-600" : "text-red-500"}`}>
                       {stats.nps > compareData.nps ? `Sube ${stats.nps - compareData.nps} pts` : `Cae ${Math.abs(stats.nps - compareData.nps)} pts`}
                     </p>
                  </div>

                </div>

                <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Lectura comparativa anual</p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {stats.nps > compareData.nps
                      ? `Subimos ${stats.nps - compareData.nps} puntos de NPS contra ${compareData.nombre}.`
                      : stats.nps < compareData.nps
                      ? `Bajamos ${Math.abs(stats.nps - compareData.nps)} puntos de NPS contra ${compareData.nombre}.`
                      : `Mantuvimos el mismo NPS que ${compareData.nombre}.`}{" "}
                    {stats.total >= compareData.total
                      ? `También crecimos en participación (+${stats.total - compareData.total} respuestas).`
                      : `Además cayó la participación (${stats.total - compareData.total} respuestas).`}
                  </p>
                </div>

                {/* TABLA DE FAMILIAS INTERACTIVA */}
                {crossFamilyData.length > 0 ? (
                  <div className="border border-slate-200 bg-white rounded-2xl overflow-hidden flex flex-col shadow-sm">
                    <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between">
                       <span className="text-xs font-black text-slate-700 flex items-center gap-1.5"><Users size={14} weight="fill" className="text-blue-600"/> {crossFamilyData.length} personas en común</span>
                       <div className="flex bg-slate-200/50 rounded-lg p-1">
                         <button onClick={() => { setFamilyTrendFilter("all"); setFamilyPage(1); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${familyTrendFilter === "all" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>Todas</button>
                         <button onClick={() => { setFamilyTrendFilter("up"); setFamilyPage(1); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${familyTrendFilter === "up" ? "bg-emerald-500 shadow-sm text-white" : "text-slate-500"}`}>Mejoraron</button>
                         <button onClick={() => { setFamilyTrendFilter("down"); setFamilyPage(1); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${familyTrendFilter === "down" ? "bg-red-500 shadow-sm text-white" : "text-slate-500"}`}>Empeoraron</button>
                       </div>
                    </div>
                    <div className="overflow-x-auto relative no-scrollbar min-h-[220px]">
                      <table className="w-full text-left text-sm relative">
                          <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                            <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                                <th className="py-3 pl-4">Persona</th>
                                <th className="py-3 text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <span className="text-[10px] font-bold">{compareData.nombre}</span>
                                    <span className="text-[8px] opacity-70">AÑO {compareData.year}</span>
                                  </div>
                                </th>
                                <th className="py-3 text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <span className="text-[10px] font-bold text-blue-600">ACTUAL</span>
                                    <span className="text-[8px] text-blue-500 opacity-70">AÑO {currentYear}</span>
                                  </div>
                                </th>
                                <th className="py-3 text-center">Evolución</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedFamilies.length === 0 ? (
                               <tr><td colSpan={4} className="text-center py-8 text-xs font-bold text-slate-400">No hay resultados para este filtro.</td></tr>
                            ) : (
                              paginatedFamilies.map((f, i) => (
                                  <tr key={i} onClick={() => openFamilyComparisonModal(f)} className="border-b border-slate-50 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors group">
                                    <td className="py-3 pl-4 font-bold text-slate-800 text-xs group-hover:text-blue-700 underline decoration-transparent group-hover:decoration-blue-300 underline-offset-2 transition-all">{f.nombre}</td>
                                    <td className="py-3 text-center font-bold text-slate-400 text-xs">{f.compareScore}</td>
                                    <td className="py-3 text-center font-bold text-slate-800 text-xs">{f.currentScore}</td>
                                    <td className="py-3 text-center">
                                        {f.trend === "up" ? (
                                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600"><TrendUp size={10} weight="bold"/> Mejoró</span>
                                        ) : f.trend === "down" ? (
                                          <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600"><TrendUp size={10} className="rotate-180" weight="bold"/> Empeoró</span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500"><Minus size={10} weight="bold"/> Igual</span>
                                        )}
                                    </td>
                                  </tr>
                              ))
                            )}
                          </tbody>
                      </table>
                    </div>
                    {/* Paginación de Familias */}
                    {familyTotalPages > 1 && (
                       <div className="bg-slate-50 p-3 border-t border-slate-200 flex items-center justify-between">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pág {familyPage} de {familyTotalPages}</span>
                         <div className="flex gap-2">
                            <button onClick={() => setFamilyPage(p => Math.max(1, p - 1))} disabled={familyPage === 1} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-100 hover:text-blue-600 transition-colors"><CaretLeft size={14} weight="bold"/></button>
                            <button onClick={() => setFamilyPage(p => Math.min(familyTotalPages, p + 1))} disabled={familyPage === familyTotalPages} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-100 hover:text-blue-600 transition-colors"><CaretRight size={14} weight="bold"/></button>
                         </div>
                       </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center text-center p-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <p className="text-sm font-bold text-slate-500 mt-4">No se detectaron personas en común.</p>
                    <p className="text-xs font-medium text-slate-400 mt-1 max-w-[250px]">El sistema cruza respuestas por claves internas; en oficina central se muestran como personas anónimas.</p>
                  </div>
                )}
              </>
            ) : compareData && compareData.total === 0 ? (
              <div className="text-center py-8 text-sm font-bold text-red-500 bg-red-50 rounded-xl">El proyecto seleccionado no contiene respuestas válidas (faltan notas).</div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm font-bold text-slate-400">{compareTargetSchoolLabel ? "Seleccioná un año arriba para cruzar la base de datos." : "Seleccioná un proyecto arriba para cruzar la base de datos."}</div>
            )}
          </div>
        </div>

        {/* RANKING (NPS REGIONAL / COLEGIOS) */}
        <div className="rounded-[32px] border border-white bg-white/85 p-6 shadow-xl backdrop-blur-xl flex flex-col min-h-[450px] lg:h-[520px] lg:max-h-[520px]">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-indigo-600"><MapPin size={20} weight="fill" /></div>
              <div>
                <h3 className="font-display text-base font-black text-slate-900">NPS comparado</h3>
                <p className="text-[10px] font-medium text-slate-400">
                  {npsViewMode === "polo"
                    ? `NPS comparativo del polo ${activeSchoolPolo || ownPolo || fixedPolo || "seleccionado"}.`
                    : "Histórico comparativo por año."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setNpsViewMode("polo")}
                className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${npsViewMode === "polo" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                Polo
              </button>
              <button
                onClick={() => setNpsViewMode("historico")}
                className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${npsViewMode === "historico" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                Históricos
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[320px] lg:min-h-0">
            {npsLoading ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-indigo-100 bg-indigo-50/40 text-center">
                <CircleNotch size={24} weight="bold" className="animate-spin text-indigo-600" />
                <div>
                  <p className="text-sm font-black text-slate-700">Cargando comparación NPS...</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">Preparando proyectos, polo e históricos para mostrar datos definitivos.</p>
                </div>
              </div>
            ) : regionalData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalData} layout="vertical" margin={{ top: 12, right: 24, left: 36, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" domain={[-100, 100]} tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748B", fontWeight: "bold" }} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip cursor={{fill: 'transparent'}} content={<DirectorTooltip />} />
                  <Bar dataKey="nps" name="Puntos NPS" radius={[0, 6, 6, 0]} barSize={20}>
                    {regionalData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getNpsBarColor(entry)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">Sin datos de polos/colegios</div>
            )}
          </div>
        </div>
      </div>

      {/* ASPECTOS MÁS VALORADOS */}
      <div className="rounded-[32px] border border-white bg-white/85 p-6 shadow-xl backdrop-blur-xl flex flex-col h-[350px]">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><Heart size={20} weight="fill" /></div>
            <div>
              <h3 className="font-display text-base font-black text-slate-900">Aspectos más valorados</h3>
              <p className="text-[10px] font-medium text-slate-400">Temáticas destacadas usando todas las respuestas.</p>
            </div>
          </div>
          <HelpTip
            title="Aspectos más valorados"
            body="Fuente: campo “Lo que más valoran” de todas las encuestas. Cuenta menciones por palabras clave de temas en todas las respuestas."
          />
        </div>
        <div className="flex-1 min-h-0">
          {topPositives.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPositives} layout="vertical" margin={{ top: 0, right: 20, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#64748B", fontWeight: "bold" }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip cursor={{fill: 'transparent'}} content={<DirectorTooltip />} />
                <Bar dataKey="count" name="Menciones Positivas" radius={[0, 6, 6, 0]} barSize={16} fill="#34D399" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">Sin suficientes menciones positivas para clasificar</div>
          )}
        </div>
      </div>

      {/* LECTURA DE COMENTARIOS */}
      <div className="rounded-[32px] border border-white bg-white/85 shadow-xl backdrop-blur-xl flex flex-col overflow-hidden">
        
        <div className="p-6 border-b border-slate-100 flex flex-col gap-5 bg-slate-50/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-black text-slate-900 flex items-center gap-2"><ChatCircleText size={20} className="text-blue-600"/> Lupa de Comentarios</h3>
              <p className="text-xs font-medium text-slate-500 mt-1">Filtrá por tema y perfil para analizar las respuestas.</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl bg-slate-200/50 p-1">
                {[5, 10, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDirectorCommentLimit(n)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${directorCommentLimit === n
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    {`${n} res`}
                  </button>
                ))}
              </div>

              <button
                 onClick={() => setCommentRefreshCounter(c => c + 1)}
                 className="flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 hover:text-blue-600 shadow-sm"
              >
                 <ArrowsClockwise size={16} weight="bold" /> Mezclar
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs font-bold text-indigo-700">
            Comentarios marcados en esta sesión: <span className="font-black">{savedCommentIds.length}</span>
          </div>
          <div className="relative">
            <MagnifyingGlass size={16} weight="bold" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={commentSearch}
              onChange={(e) => setCommentSearch(e.target.value)}
              placeholder="Buscar por nombre, apellido o comentario..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>


          <div className="flex flex-wrap items-center gap-2">
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Perfil:</span>
             <button
                onClick={() => { setCommentProfile("Todos"); setCommentRefreshCounter(0); setShowSavedOnly(false); }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${commentProfile === "Todos" && !showSavedOnly ? "bg-slate-800 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
             >
                Todos
             </button>
             <button
                onClick={() => { setCommentProfile("Promotor"); setDirectorTopic("Promotor"); setCommentRefreshCounter(0); setShowSavedOnly(false); }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${commentProfile === "Promotor" && !showSavedOnly ? "bg-emerald-500 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
             >
                Promotores
             </button>
             <button
                onClick={() => { setCommentProfile("Satisfecho"); setDirectorTopic("Satisfecho"); setCommentRefreshCounter(0); setShowSavedOnly(false); }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${commentProfile === "Satisfecho" && !showSavedOnly ? "bg-amber-500 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
             >
                Satisfechos
             </button>
             <button
                onClick={() => { setCommentProfile("Insatisfecho"); setDirectorTopic("Insatisfecho"); setCommentRefreshCounter(0); setShowSavedOnly(false); }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${commentProfile === "Insatisfecho" && !showSavedOnly ? "bg-red-500 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
             >
                Insatisfechos
             </button>
             <button
                onClick={() => { setShowSavedOnly(true); setCommentRefreshCounter(0); }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${showSavedOnly ? "bg-indigo-600 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
             >
                Marcados ({savedCommentIds.length})
             </button>
          </div>

          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tema:</span>
              <HelpTip
                title="Filtro por temas"
                body={canEditThemes
                  ? "Modo admin: acá podés crear, editar y eliminar temas. Cada tema usa palabras clave para clasificar comentarios automáticamente."
                  : "Estos temas son filtros con palabras clave adentro. Te ayudan a encontrar comentarios relacionados más rápido."}
              />
            </div>
            {!themesHydrated ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-blue-100 bg-blue-50/50 px-4 py-3 text-xs font-black text-slate-500">
                <CircleNotch size={16} weight="bold" className="animate-spin text-blue-600" />
                Cargando categorías reales...
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start gap-2">
                  <button
                    onClick={() => { setCommentTheme("Todos"); setCommentRefreshCounter(0); }}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${commentTheme === "Todos" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"}`}
                  >
                    Todas
                  </button>
                  {allThemes.map(t => {
                    const isActiveTheme = commentTheme === t.id;
                    return (
                      <div key={t.id} className="flex flex-col gap-1">
                        <button
                          onClick={() => { setCommentTheme(t.id); setCommentRefreshCounter(0); }}
                          className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${isActiveTheme ? "bg-blue-600 text-white shadow-md shadow-blue-500/30" : "bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-700"}`}
                        >
                          {t.id}
                        </button>
                        {isActiveTheme && canEditThemes && (
                          <div className="flex items-center gap-1 pl-1">
                            <button
                              onClick={() => startEditTheme(t.id)}
                              className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100"
                              title="Editar tema"
                            >
                              <PencilSimple size={12} weight="bold" />
                            </button>
                            <button
                              onClick={() => removeCustomTheme(t.id)}
                              className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-500 transition-colors hover:bg-red-100"
                              title="Eliminar tema"
                            >
                              <Trash size={12} weight="bold" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canEditThemes && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyVarones2025ThemesToDirector}
                      disabled={!projectId || copyVarones2025Loading}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      {copyVarones2025Loading ? "Copiando..." : "Copiar Varones 2025"}
                    </button>
                    <button
                      onClick={() => setIsCreatingTheme((prev) => !prev)}
                      className="flex items-center gap-1 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      <Plus size={12} weight="bold" /> Tema
                    </button>
                    <button
                      onClick={syncThemesNow}
                      disabled={themesSyncing}
                      className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-[11px] font-black text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      {themesSyncing ? "Sincronizando..." : "Sincronizar ahora"}
                    </button>
                  </div>
                )}
                {canEditThemes && themesSyncMessage && (
                  <p className="mt-2 text-[11px] font-bold text-slate-500">{themesSyncMessage}</p>
                )}
              </>
            )}
          </div>
          {isCreatingTheme && canEditThemes && (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 lg:grid-cols-[1fr_2fr_auto]">
              <input
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                placeholder="Nombre del tema"
                className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
              />
              <input
                value={newThemeKeywords}
                onChange={(e) => setNewThemeKeywords(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomTheme()}
                placeholder="Palabras clave separadas por coma"
                className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
              />
              <button
                onClick={addCustomTheme}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-blue-700"
              >
                Guardar
              </button>
            </div>
          )}
          {editingThemeId && canEditThemes && (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-blue-200 bg-white p-3 lg:grid-cols-[1fr_2fr_auto_auto]">
              <input
                value={editingThemeName}
                onChange={(e) => setEditingThemeName(e.target.value)}
                placeholder="Nombre del tema"
                className="rounded-xl border border-blue-100 bg-blue-50/30 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
              />
              <input
                value={editingThemeKeywords}
                onChange={(e) => setEditingThemeKeywords(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveThemeEdits()}
                placeholder="Palabras clave separadas por coma"
                className="rounded-xl border border-blue-100 bg-blue-50/30 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
              />
              <button
                onClick={saveThemeEdits}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-blue-700"
              >
                Guardar cambios
              </button>
              <button
                onClick={() => {
                  setEditingThemeId(null);
                  setEditingThemeName("");
                  setEditingThemeKeywords("");
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div className="p-6 flex-1 bg-slate-50/30">
          <div className="grid gap-5 lg:grid-cols-2">
            {directorComments.length === 0 ? (
              <div className="col-span-2 text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                <MagnifyingGlass size={40} className="mx-auto mb-3 opacity-20 text-slate-500" />
                <p className="text-base font-black text-slate-500">No hay comentarios en este filtro.</p>
                <p className="text-xs font-medium text-slate-400 mt-1">Intentá cambiar el perfil de familia o elegí &ldquo;Todas las temáticas&rdquo;.</p>
              </div>
            ) : (
              directorComments.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-[24px] border p-6 transition-all hover:shadow-lg flex flex-col h-[320px] ${r.type === "Promotor" ? "border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-white" :
                    r.type === "Insatisfecho" ? "border-red-100 bg-gradient-to-b from-red-50/50 to-white" :
                      "border-amber-100 bg-gradient-to-b from-amber-50/50 to-white"
                    }`}
                >
                  <div className="mb-4 flex items-start justify-between shrink-0">
                    <div>
                       <div className="text-sm font-black text-slate-800">{buildName(r)}</div>
                       <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                         {r.colegio} <span className="opacity-60">• {r.year}</span>
                       </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`rounded-xl px-3 py-1 text-xs font-black uppercase tracking-wider ${r.score >= 9 ? "bg-emerald-200/50 text-emerald-800" : r.score >= 7 ? "bg-amber-200/50 text-amber-800" : "bg-red-200/50 text-red-800"}`}>
                        Nota {r.score}
                      </span>
                      <button
                        onClick={() => toggleSaveComment(r.id)}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                          savedCommentIds.includes(r.id)
                            ? "bg-indigo-600 text-white hover:bg-indigo-700"
                            : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {savedCommentIds.includes(r.id) ? "Marcado" : "Marcar"}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {r.positive.trim() && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5"><ThumbsUp size={12} weight="fill"/> Lo que valora</p>
                        <p className="text-[13px] font-medium text-slate-700 leading-relaxed">&ldquo;{highlightText(r.positive, commentSearch, themeKeywords)}&rdquo;</p>
                      </div>
                    )}
                    {r.improvement.trim() && (
                      <div className="bg-white/60 p-3 rounded-2xl border border-white">
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5"><Wrench size={12} weight="fill"/> Oportunidades de mejora</p>
                        <p className="text-[13px] font-medium text-slate-800 leading-relaxed">&ldquo;{highlightText(r.improvement, commentSearch, themeKeywords)}&rdquo;</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
      {historyOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setHistoryOpen(false)}>
          <div className="max-h-[70vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900">Historial de cambios de categorías</h4>
              <button onClick={() => setHistoryOpen(false)} className="text-xs font-black text-slate-500">Cerrar</button>
            </div>
            <div className="space-y-3">
              {historyItems.length === 0 && <p className="text-xs font-semibold text-slate-500">Sin historial disponible todavía.</p>}
              {historyItems.map((item, idx) => (
                <div key={`${item.created_at}-${idx}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-black text-slate-700">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : "Fecha no disponible"}
                        {item.updated_by ? ` • ${item.updated_by}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        Podés aplicar este registro si esos cambios fueron pisados por otra carga.
                      </p>
                    </div>
                    <button
                      onClick={() => applyThemeHistoryItem(item)}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white transition-colors hover:bg-blue-700"
                    >
                      Aplicar este cambio
                    </button>
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-700">
                    {item.changes.map((c, cIdx) => {
                      const added = Array.isArray(c.addedKeywords) && c.addedKeywords.length > 0
                        ? ` · + ${c.addedKeywords.join(", ")}`
                        : "";
                      const removed = Array.isArray(c.removedKeywords) && c.removedKeywords.length > 0
                        ? ` · - ${c.removedKeywords.join(", ")}`
                        : "";
                      const keywords = Array.isArray(c.keywords) && c.keywords.length > 0
                        ? ` · ${c.keywords.join(", ")}`
                        : "";
                      const snapshot = Array.isArray(c.snapshotAfter) ? " · snapshot completo" : "";
                      return (
                        <li key={cIdx}>
                          {String(c.type || "update")} · {String(c.themeId || "categorías")}{keywords}{added}{removed}{snapshot}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
