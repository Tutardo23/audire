"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Star,
  Smiley,
  Warning,
  ThumbsUp,
  Wrench,
  Funnel,
  MagnifyingGlass,
  X,
  CaretLeft,
  CaretRight,
  Bookmarks,
  Plus,
  SortDescending,
  PencilSimple,
  Info,
  Users
} from "phosphor-react";
import {
  obtenerTemasProyectoDB,
  guardarTemasProyectoDB,
  obtenerParticipacionFamiliarProyectoDB,
  obtenerConfiguracionEquipoProyectoDB,
  guardarConfiguracionEquipoProyectoDB,
  obtenerFamiliasCompartidasProyectoDB,
} from "../app/actions";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type FilterType = "Todos" | "Promotor" | "Satisfecho" | "Insatisfecho";

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
  sentiment: "Crítico" | "Observación" | "Sugerencia" | "Neutro";
  sentimentScore: number;
  year: number;
};

type CustomCategory = {
  name: string;
  keywords: string[];
};

const DEFAULT_RADAR_CATEGORIES: CustomCategory[] = [
  { name: "Infraestructura", keywords: ["infraestructura", "baño", "limpieza", "comedor"] },
  { name: "Académico", keywords: ["docente", "evaluación", "actividad"] },
  { name: "Convivencia", keywords: ["norma", "celular", "respeto"] },
  { name: "Horarios", keywords: ["horario", "tiempo"] },
  { name: "Deportes", keywords: ["deporte"] },
];

const DEFAULT_POSITIVE_TONE_RULES = "agradezco, excelente, contento, feliz, recomiendo";
const DEFAULT_CONSTRUCTIVE_TONE_RULES = "deberia, mejorar, faltaria, sugerencia, podrian";

const categoriesKey = (categories: CustomCategory[]) =>
  JSON.stringify(
    categories
      .map((category) => ({
        name: category.name.trim(),
        keywords: Array.from(new Set(category.keywords.map((x) => x.trim()).filter(Boolean))).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

const teamSettingsKey = (positiveRules: string, constructiveRules: string) =>
  JSON.stringify({
    positiveToneRules: positiveRules.trim(),
    constructiveToneRules: constructiveRules.trim(),
  });

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const normalize = (str?: string | null) => String(str ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const normalizeSchoolForCompare = (value?: string | null) => {
  const raw = String(value ?? "").trim();

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'´`.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  // Varones
  if (normalized.includes("bosque") && normalized.includes("plata")) return "bosque del plata";
  if (normalized.includes("los olivos")) return "colegio los olivos";
  if (normalized.includes("los molinos")) return "colegio los molinos";
  if (normalized.includes("cinco rios")) return "colegio cinco rios";
  if (normalized.includes("los caminos")) return "colegio los caminos";
  if (normalized.includes("los arroyos")) return "colegio los arroyos";
  if (normalized.includes("pucara")) return "colegio pucara";

  // Mujeres
  if (normalized.includes("el buen ayre") || normalized.includes("el buen ayr")) return "colegio el buen ayre";
  if (normalized.includes("el torreon") || (normalized.includes("colegio") && normalized.includes("torreon"))) return "colegio el torreon";
  if (normalized.includes("los cerros")) return "colegio los cerros";
  if (normalized.includes("mirasoles")) return "colegio mirasoles";
  if (normalized.includes("portezuelo")) return "colegio portezuelo";
  if (normalized.includes("candiles")) return "los candiles";
  if (normalized.includes("colegio crisol")) return "colegio crisol";

  // Jardines
  if (normalized.includes("jardin") && normalized.includes("crisol")) return "jardin crisol";
  if (normalized.includes("jardin") && normalized.includes("torreon")) return "jardin torreon de los rios";
  if (normalized.includes("torreon de los rios")) return "jardin torreon de los rios";
  if (normalized.includes("buen molino")) return "jardin buen molino";
  if (normalized.includes("los cerritos")) return "jardin los cerritos";
  if (normalized.includes("senderos")) return "jardin los senderos";
  if (normalized.includes("platero")) return "jardin platero";
  if (normalized.includes("cauquen")) return "jardin cauquen";

  return normalized;
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

const getMostFrequentYear = (rows: any[]): number => {
  const counts: Record<number, number> = {};
  rows.forEach((row) => {
    const year = Number(row?.year);
    if (Number.isFinite(year) && year > 2000) counts[year] = (counts[year] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? Number(sorted[0][0]) : new Date().getFullYear();
};

const sameSchoolName = (a?: string | null, b?: string | null) =>
  normalizeSchoolForCompare(a) === normalizeSchoolForCompare(b);

const schoolGroupForDashboard = (value?: string | null): "varones" | "mujeres" | "jardines" | "otro" => {
  const school = normalizeSchoolForCompare(value);

  if (
    school === "colegio pucara" ||
    school === "colegio cinco rios" ||
    school === "colegio los arroyos" ||
    school === "bosque del plata" ||
    school === "colegio los caminos" ||
    school === "colegio los olivos" ||
    school === "colegio los molinos"
  ) {
    return "varones";
  }

  if (
    school === "colegio los cerros" ||
    school === "colegio el torreon" ||
    school === "colegio mirasoles" ||
    school === "colegio el buen ayre" ||
    school === "colegio portezuelo" ||
    school === "colegio crisol" ||
    school === "los candiles"
  ) {
    return "mujeres";
  }

  if (school.startsWith("jardin ")) return "jardines";

  return "otro";
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
  const re = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const parts = t.split(re);

  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="rounded bg-blue-200/80 px-1 font-black text-blue-900 not-italic">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

const percentage = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const hasMeaningfulComment = (value?: string | null) => String(value ?? "").trim().length > 3;

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

// ─────────────────────────────────────────────
// UI COMPONENTES AUXILIARES
// ─────────────────────────────────────────────
const SENTIMENT_CONFIG = {
  Crítico: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  Observación: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
  Sugerencia: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  Neutro: { bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200" },
};

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

function SentimentBadge({ sentiment }: { sentiment: SurveyRow["sentiment"] }) {
  const cfg = SENTIMENT_CONFIG[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      ● {sentiment}
    </span>
  );
}

function KpiCard({ title, value, subtitle, icon, accent = "text-slate-900" }: { title: string; value: string | number; subtitle?: string; icon?: React.ReactNode; accent?: string; }) {
  return (
    <div className="rounded-[24px] border border-white bg-white/80 px-5 py-4 shadow-xl backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</span>
        {icon}
      </div>
      <div className={`mt-2 font-display text-4xl font-black ${accent}`}>{value}</div>
      {subtitle && <div className="mt-1 text-[10px] text-slate-400 font-bold">{subtitle}</div>}
    </div>
  );
}

const anonymousPersonLabel = (id?: string | null) => {
  const raw = String(id ?? "");
  let hash = 0;

  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 10000;
  }

  const code = String(hash || 1).padStart(4, "0");
  return `Persona xxxx-${code}`;
};

const getPersonDisplayName = (row: Partial<SurveyRow> | null | undefined, anonymizePeople = false) => {
  if (anonymizePeople) return anonymousPersonLabel(row?.id);
  const name = `${row?.nombre ?? ""} ${row?.apellido ?? ""}`.trim();
  return name || "Familia anónima";
};

const getShortPersonDisplayName = (row: Partial<SurveyRow> | null | undefined, anonymizePeople = false) => {
  if (anonymizePeople) return anonymousPersonLabel(row?.id);
  return row?.nombre || row?.apellido ? `${row?.nombre ?? ""} ${row?.apellido ?? ""}`.trim() : "Familia anónima";
};

// ─────────────────────────────────────────────
// TARJETA DE RESPUESTA (COMPACTA Y CON SCROLL)
// ─────────────────────────────────────────────
function SurveyCard({
  res,
  searchTerm,
  extraKeywords,
  isSaved,
  onToggleSave,
  anonymizePeople = false,
}: {
  res: SurveyRow;
  searchTerm: string;
  extraKeywords: string[];
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  anonymizePeople?: boolean;
}) {
  const displayName = getPersonDisplayName(res, anonymizePeople);

  return (
    <div className="group flex flex-col overflow-hidden rounded-[24px] border border-white bg-white/80 p-5 shadow-xl backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl">
      
      {/* Header Compacto */}
      <div className="mb-4 flex items-start justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-lg font-black text-white shadow-inner ${
              res.score >= 9 ? "bg-emerald-500" : res.score >= 7 ? "bg-amber-500" : "bg-red-500"
            }`}
          >
            {res.score}
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-800">{displayName}</div>
            <div className="truncate text-[10px] font-bold text-slate-400">
              {res.colegio} • {res.curso}
            </div>
            <div className="truncate text-[9px] font-bold text-slate-400 uppercase">{res.year}</div>
          </div>
        </div>

        <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black uppercase ${
            res.type === "Promotor" ? "bg-emerald-50 text-emerald-600" :
            res.type === "Satisfecho" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
          }`}
        >
          {res.type}
        </span>
      </div>

      {/* Contenido (con scroll interno para que no se agiganten) */}
      <div className="flex flex-1 flex-col gap-3">
        {res.positive && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-emerald-600">
              <ThumbsUp size={12} weight="fill" />
              <span className="text-[10px] font-black uppercase tracking-widest">Lo que valora</span>
            </div>
            <p className="max-h-20 overflow-y-auto break-words text-xs font-medium leading-relaxed text-slate-700 pr-1 custom-scrollbar">
              &ldquo;{highlightText(res.positive, searchTerm, extraKeywords)}&rdquo;
            </p>
          </div>
        )}

        {res.improvement && (
          <div className="rounded-xl border border-amber-100/50 bg-amber-50/70 p-3">
            <div className="mb-1 flex items-center gap-2 text-amber-700">
              <Wrench size={12} weight="fill" />
              <span className="text-[10px] font-black uppercase tracking-widest">Oportunidades de mejora</span>
            </div>
            <p className="max-h-24 overflow-y-auto break-words text-xs font-medium leading-relaxed text-amber-900 pr-1 custom-scrollbar">
              &ldquo;{highlightText(res.improvement, searchTerm, extraKeywords)}&rdquo;
            </p>
          </div>
        )}

        {!res.positive && !res.improvement && (
           <p className="text-[10px] font-bold text-slate-400 uppercase text-center mt-4">Sin comentarios de texto</p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <SentimentBadge sentiment={res.sentiment} />
        <button
          onClick={() => onToggleSave(res.id)}
          className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
            isSaved ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {isSaved ? "Marcado" : "Marcar"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL: TEAM DASHBOARD
// ─────────────────────────────────────────────

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

const sharedFamiliesCacheKey = (projectId?: string, school?: string) =>
  projectId && school && school !== "Todos los colegios"
    ? `apdes:shared-families:${projectId}:${normalize(school)}`
    : "";

const readSharedFamiliesCache = (projectId?: string, school?: string) => {
  if (typeof window === "undefined") return null;
  const key = sharedFamiliesCacheKey(projectId, school);
  if (!key) return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeSharedFamiliesCache = (projectId: string | undefined, school: string | undefined, data: any) => {
  if (typeof window === "undefined" || !data) return;
  const key = sharedFamiliesCacheKey(projectId, school);
  if (!key) return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Si el dato pesa mucho o el navegador bloquea storage, no rompemos la vista.
  }
};

type TeamDashboardProps = {
  stats: any;
  filteredResponses: SurveyRow[];
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  filterType: FilterType;
  setFilterType: (val: FilterType) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  downloadCSV: () => void;
  projectId?: string;
  activeSchool?: string;
  canEditConfig?: boolean;
  anonymizePeople?: boolean;
};

export default function TeamDashboard({
  stats,
  filteredResponses,
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
  currentPage,
  setCurrentPage,
  downloadCSV,
  projectId,
  activeSchool = "Todos los colegios",
  canEditConfig = false,
  anonymizePeople = false,
}: TeamDashboardProps) {
  void downloadCSV;
  
  // Estados para nuevas funciones
  const [sortBy, setSortBy] = useState<"recientes" | "mayor" | "menor">("recientes");
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(DEFAULT_RADAR_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [savedCommentIds, setSavedCommentIds] = useState<string[]>([]);
  const [savedFilter, setSavedFilter] = useState<"all" | "saved">("all");
  const [sessionSeed] = useState<number>(() => Date.now());
  const [selectedDetail, setSelectedDetail] = useState<SurveyRow | null>(null);
  const [selectedRadarTopic, setSelectedRadarTopic] = useState<string | null>(null);
  const [toneSeed, setToneSeed] = useState<number>(() => Date.now());
  const [commentFocusFilter, setCommentFocusFilter] = useState<FilterType>("Todos");
  
  // Formulario nueva categoría
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatWords, setNewCatWords] = useState("");
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [editingCatNewName, setEditingCatNewName] = useState("");
  const [editingCatWords, setEditingCatWords] = useState("");
  const [editingToneRules, setEditingToneRules] = useState(false);
  const [positiveToneRules, setPositiveToneRules] = useState(DEFAULT_POSITIVE_TONE_RULES);
  const [constructiveToneRules, setConstructiveToneRules] = useState(DEFAULT_CONSTRUCTIVE_TONE_RULES);
  const [familyParticipation, setFamilyParticipation] = useState<any | null>(null);
  const [familyParticipationLoading, setFamilyParticipationLoading] = useState(false);
  const [sharedFamilies, setSharedFamilies] = useState<any | null>(null);
  const [sharedFamiliesLoading, setSharedFamiliesLoading] = useState(false);
  const [themesHydrated, setThemesHydrated] = useState(false);
  const [teamSettingsHydrated, setTeamSettingsHydrated] = useState(false);
  const [syncingProjectConfig, setSyncingProjectConfig] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const skipNextThemeSaveRef = useRef(false);
  const skipNextTeamSettingsSaveRef = useRef(false);
  const lastSavedCategoriesKeyRef = useRef<string>(categoriesKey(DEFAULT_RADAR_CATEGORIES));
  const lastSavedTeamSettingsKeyRef = useRef<string>(teamSettingsKey(DEFAULT_POSITIVE_TONE_RULES, DEFAULT_CONSTRUCTIVE_TONE_RULES));

  const familyParticipationScopedSummary = useMemo(() => {
    if (!familyParticipation) return null;
    const rows = Array.isArray(familyParticipation?.porColegio) ? familyParticipation.porColegio : [];
    if (activeSchool === "Todos los colegios") return familyParticipation.resumen || null;
    const selected = rows.find((row: any) => sameSchoolName(String(row?.colegio || ""), activeSchool));
    if (!selected) return null;
    const totalFamilias = Number(selected?.totalFamilias || 0);
    const familiasConRespuesta = Number(selected?.familiasConRespuesta || 0);
    return {
      totalFamilias,
      familiasConRespuesta,
      porcentajeParticipacion: totalFamilias ? Math.round((familiasConRespuesta / totalFamilias) * 1000) / 10 : 0,
      soloMadre: Number(selected?.soloMadre || 0),
      soloPadre: Number(selected?.soloPadre || 0),
      ambos: Number(selected?.ambos || 0),
    };
  }, [familyParticipation, activeSchool]);

  const showFamilyExtendedBreakdown = activeSchool === "Todos los colegios";

  const familyParticipationByPolo = useMemo(() => {
    const rows = Array.isArray(familyParticipation?.porColegio) ? familyParticipation.porColegio : [];
    const scopedRows = activeSchool === "Todos los colegios"
      ? rows
      : rows.filter((row: any) => sameSchoolName(String(row?.colegio || ""), activeSchool));
    const byPolo = new Map<string, { totalFamilias: number; familiasConRespuesta: number }>();
    scopedRows.forEach((row: any) => {
      const polo = String(row?.polo || "Sin polo");
      const current = byPolo.get(polo) || { totalFamilias: 0, familiasConRespuesta: 0 };
      current.totalFamilias += Number(row?.totalFamilias || 0);
      current.familiasConRespuesta += Number(row?.familiasConRespuesta || 0);
      byPolo.set(polo, current);
    });
    return Array.from(byPolo.entries())
      .map(([polo, value]) => ({
        polo,
        totalFamilias: value.totalFamilias,
        familiasConRespuesta: value.familiasConRespuesta,
        porcentaje: value.totalFamilias ? Math.round((value.familiasConRespuesta / value.totalFamilias) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.porcentaje - a.porcentaje);
  }, [familyParticipation, activeSchool]);

  const familyChildrenRows = useMemo(() => {
    const rows = Array.isArray(familyParticipation?.porColegio) ? familyParticipation.porColegio : [];
    return rows
      .filter((row: any) => activeSchool === "Todos los colegios" || sameSchoolName(String(row?.colegio || ""), activeSchool))
      .map((row: any) => ({
        colegio: String(row?.colegio || "Sin colegio"),
        totalFamilias: Number(row?.totalFamilias || 0),
        hijosPorFamilia: normalizeChildrenComposition(row?.hijosPorFamilia),
      }))
      .filter((row: any) => row.totalFamilias > 0);
  }, [familyParticipation, activeSchool]);

  const familyChildrenSummary = useMemo(() => {
    if (!familyChildrenRows.length) return null;
    return aggregateChildrenComposition(familyChildrenRows);
  }, [familyChildrenRows]);

  const selectedSchoolForSharedFamilies = activeSchool !== "Todos los colegios" ? activeSchool : "";

  const sharedFamiliesProjectYear = useMemo(() => getMostFrequentYear(filteredResponses || []), [filteredResponses]);

  const staticFamilyDistribution = useMemo(() => {
    return getStaticFamilyDistribution(selectedSchoolForSharedFamilies, sharedFamiliesProjectYear);
  }, [selectedSchoolForSharedFamilies, sharedFamiliesProjectYear]);

  const sharedFamiliesTableRows = useMemo(() => {
    if (staticFamilyDistribution) {
      return staticFamilyDistribution.rows.map((row, index) => ({
        id: `${row.label}-${index}`,
        label: row.label,
        familias: row.familias,
      }));
    }

    if (!Array.isArray(sharedFamilies?.combinaciones)) return [];

    return sharedFamilies.combinaciones
      .map((item: any, index: number) => ({
        id: String(item?.label || `fila-${index}`),
        label: String(item?.label || "Sin recorrido"),
        familias: Number(item?.familias || 0),
      }))
      .filter((item: any) => item.familias > 0);
  }, [staticFamilyDistribution, sharedFamilies]);

  const sharedFamiliesTotalForTable = Number(staticFamilyDistribution?.total || 0) ||
    sharedFamiliesTableRows.reduce((acc: number, row: any) => acc + Number(row.familias || 0), 0);

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

  useEffect(() => {
    let mounted = true;

    // Importante: en Equipo NO cargamos este cruce en “Todos los colegios”.
    // Solo se consulta Neon cuando el usuario selecciona un colegio puntual.
    if (!projectId || !selectedSchoolForSharedFamilies || staticFamilyDistribution) {
      setSharedFamilies(null);
      setSharedFamiliesLoading(false);
      return () => {
        mounted = false;
      };
    }

    const cached = readSharedFamiliesCache(projectId, selectedSchoolForSharedFamilies);
    if (cached) {
      setSharedFamilies(cached);
      setSharedFamiliesLoading(false);
      return () => {
        mounted = false;
      };
    }

    setSharedFamiliesLoading(true);

    cachedClientAction(
      `apdes:action:shared-families:${projectId}:${normalize(selectedSchoolForSharedFamilies)}`,
      () => obtenerFamiliasCompartidasProyectoDB(projectId, selectedSchoolForSharedFamilies),
    )
      .then((data) => {
        if (!mounted) return;
        setSharedFamilies(data);
        writeSharedFamiliesCache(projectId, selectedSchoolForSharedFamilies, data);
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
  }, [projectId, selectedSchoolForSharedFamilies, staticFamilyDistribution]);

  const handleAddCategory = () => {
    if (!canEditConfig) return;
    if (!newCatName.trim() || !newCatWords.trim()) return;
    const keywords = newCatWords.split(",").map(w => w.trim()).filter(Boolean);
    if (keywords.length === 0) return;
    
    setCustomCategories([...customCategories, { name: newCatName.trim(), keywords }]);
    setNewCatName("");
    setNewCatWords("");
    setIsCreatingCat(false);
  };

  const removeCategory = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEditConfig) return;
    setCustomCategories(customCategories.filter(c => c.name !== name));
    if (activeCategory === name) setActiveCategory(null);
  };

  const startEditCategory = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEditConfig) return;
    const cat = customCategories.find((c) => c.name === name);
    if (!cat) return;
    setEditingCatName(cat.name);
    setEditingCatNewName(cat.name);
    setEditingCatWords(cat.keywords.join(", "));
  };

  const saveCategoryEdit = () => {
    if (!canEditConfig) return;
    if (!editingCatName) return;
    const keywords = editingCatWords.split(",").map((w) => w.trim()).filter(Boolean);
    if (keywords.length === 0) return;
    const newName = editingCatNewName.trim();
    if (!newName) return;
    setCustomCategories((prev) => prev.map((c) => (c.name === editingCatName ? { ...c, name: newName, keywords } : c)));
    if (activeCategory === editingCatName) setActiveCategory(newName);
    setEditingCatName(null);
    setEditingCatNewName("");
    setEditingCatWords("");
  };

  const mapThemesToCategories = (themes: unknown): CustomCategory[] => {
    if (!Array.isArray(themes)) return [];
    return themes
      .map((t) => ({
        name: String((t as { id?: unknown })?.id ?? "").trim(),
        keywords: Array.isArray((t as { keywords?: unknown })?.keywords)
          ? ((t as { keywords?: unknown[] }).keywords ?? []).map((x) => String(x).trim()).filter(Boolean)
          : [],
      }))
      .filter((x) => x.name && x.keywords.length > 0);
  };

  const loadProjectTeamConfig = async ({ showMessage = false }: { showMessage?: boolean } = {}) => {
    if (!projectId) return;
    if (showMessage) {
      setSyncingProjectConfig(true);
      setSyncMessage("");
    }

    try {
      const [themes, teamSettings] = showMessage
        ? await Promise.all([
            obtenerTemasProyectoDB(projectId),
            obtenerConfiguracionEquipoProyectoDB(projectId),
          ])
        : await cachedClientAction(
            `apdes:action:team-config:${projectId}`,
            () => Promise.all([
              obtenerTemasProyectoDB(projectId),
              obtenerConfiguracionEquipoProyectoDB(projectId),
            ]),
          );

      const mapped = mapThemesToCategories(themes);
      if (mapped.length > 0) {
        lastSavedCategoriesKeyRef.current = categoriesKey(mapped);
        skipNextThemeSaveRef.current = true;
        setCustomCategories(mapped);
      } else {
        // Si la base no devuelve categorías, no mostramos defaults viejos ni guardamos encima.
        // Esto evita pisar cambios de otra PC/cuenta por una carga incompleta o lenta.
        lastSavedCategoriesKeyRef.current = "";
        skipNextThemeSaveRef.current = true;
        setCustomCategories([]);
        if (showMessage) setSyncMessage("No hay categorías guardadas para este proyecto.");
      }

      const nextPositiveToneRules = String(teamSettings?.positiveToneRules || DEFAULT_POSITIVE_TONE_RULES);
      const nextConstructiveToneRules = String(teamSettings?.constructiveToneRules || DEFAULT_CONSTRUCTIVE_TONE_RULES);
      lastSavedTeamSettingsKeyRef.current = teamSettingsKey(nextPositiveToneRules, nextConstructiveToneRules);
      skipNextTeamSettingsSaveRef.current = true;
      setPositiveToneRules(nextPositiveToneRules);
      setConstructiveToneRules(nextConstructiveToneRules);

      if (showMessage) setSyncMessage("Sincronizado con el proyecto.");
    } catch {
      if (showMessage) setSyncMessage("No se pudo sincronizar. Revisá conexión/permisos.");
    } finally {
      setThemesHydrated(true);
      setTeamSettingsHydrated(true);
      if (showMessage) setSyncingProjectConfig(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && projectId) {
      try {
        window.sessionStorage.removeItem(`team-config:${projectId}`);
      } catch {
        // Evita reutilizar categorías/criterios viejos cacheados por versiones anteriores.
      }
    }

    if (!projectId) {
      setThemesHydrated(false);
      setTeamSettingsHydrated(false);
      setCustomCategories(DEFAULT_RADAR_CATEGORIES);
      setPositiveToneRules(DEFAULT_POSITIVE_TONE_RULES);
      setConstructiveToneRules(DEFAULT_CONSTRUCTIVE_TONE_RULES);
      lastSavedCategoriesKeyRef.current = categoriesKey(DEFAULT_RADAR_CATEGORIES);
      lastSavedTeamSettingsKeyRef.current = teamSettingsKey(DEFAULT_POSITIVE_TONE_RULES, DEFAULT_CONSTRUCTIVE_TONE_RULES);
      return;
    }

    setThemesHydrated(false);
    setTeamSettingsHydrated(false);
    setCustomCategories([]);
    lastSavedCategoriesKeyRef.current = "";
    loadProjectTeamConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !themesHydrated || !canEditConfig) return;
    if (skipNextThemeSaveRef.current) {
      skipNextThemeSaveRef.current = false;
      return;
    }

    const currentKey = categoriesKey(customCategories);
    if (!currentKey || currentKey === lastSavedCategoriesKeyRef.current) return;

    const payload = customCategories.map((c) => ({ id: c.name, keywords: c.keywords }));
    guardarTemasProyectoDB(projectId, payload)
      .then(() => {
        lastSavedCategoriesKeyRef.current = currentKey;
      })
      .catch(() => undefined);
  }, [customCategories, projectId, themesHydrated, canEditConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem("team:saved-comments");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setSavedCommentIds(parsed.map((x) => String(x)));
    } catch {
      setSavedCommentIds([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("team:saved-comments", JSON.stringify(savedCommentIds));
  }, [savedCommentIds]);

  useEffect(() => {
    if (!projectId || !teamSettingsHydrated || !canEditConfig) return;
    if (skipNextTeamSettingsSaveRef.current) {
      skipNextTeamSettingsSaveRef.current = false;
      return;
    }

    const currentKey = teamSettingsKey(positiveToneRules, constructiveToneRules);
    if (!currentKey || currentKey === lastSavedTeamSettingsKeyRef.current) return;

    const timeoutId = window.setTimeout(() => {
      guardarConfiguracionEquipoProyectoDB(projectId, {
        positiveToneRules,
        constructiveToneRules,
      })
        .then(() => {
          lastSavedTeamSettingsKeyRef.current = currentKey;
        })
        .catch(() => undefined);
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [positiveToneRules, constructiveToneRules, projectId, teamSettingsHydrated, canEditConfig]);

  const toggleSaveComment = (id: string) => {
    setSavedCommentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Dataset base para radar + tono (no depende de categoría activa)
  const processedResponses = useMemo(() => {
    let result = [...filteredResponses];

    const search = normalize(searchTerm);
    if (search) {
      result = result.filter((r) => {
        const haystack = normalize([
          anonymizePeople ? "" : r.nombre,
          anonymizePeople ? "" : r.apellido,
          r.colegio,
          r.curso,
          r.polo,
          r.positive,
          r.improvement,
        ].join(" "));
        return haystack.includes(search);
      });
    }

    if (savedFilter === "saved") {
      result = result.filter((r) => savedCommentIds.includes(r.id));
    }

    if (sortBy === "mayor") result.sort((a, b) => b.score - a.score);
    if (sortBy === "menor") result.sort((a, b) => a.score - b.score);
    if (sortBy === "recientes") {
      result.sort((a, b) => {
        const aHash = `${a.id}-${sessionSeed}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const bHash = `${b.id}-${sessionSeed}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        return aHash - bHash;
      });
    }

    return result;
  }, [filteredResponses, searchTerm, sortBy, savedFilter, savedCommentIds, sessionSeed, anonymizePeople]);

  // Filtro por categoría SOLO para comentarios del bloque inferior
  const commentResponses = useMemo(() => {
    if (!activeCategory) return processedResponses;
    const cat = customCategories.find(c => c.name === activeCategory);
    if (!cat || cat.keywords.length === 0) return processedResponses;
    return processedResponses.filter((r) => {
      const fullText = normalize(`${r.positive} ${r.improvement}`);
      return cat.keywords.some((kw) => fullText.includes(normalize(kw)));
    });
  }, [processedResponses, activeCategory, customCategories]);

  const activeKeywords = activeCategory ? customCategories.find(c => c.name === activeCategory)?.keywords || [] : [];
  const itemsPerPage = 8;
  const totalPages = Math.ceil(commentResponses.length / itemsPerPage) || 1;
  const paginatedResponses = commentResponses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const topOperationalIssues = useMemo(() => {
    const categoriesSource: CustomCategory[] = customCategories;

    const counter = new Map<string, number>();
    categoriesSource.forEach((cat) => counter.set(cat.name, 0));
    processedResponses.forEach((r) => {
      const text = normalize(`${r.improvement} ${r.positive}`);
      categoriesSource.forEach((cat) => {
        if (cat.keywords.some((kw) => text.includes(normalize(kw)))) {
          counter.set(cat.name, (counter.get(cat.name) ?? 0) + 1);
        }
      });
    });
    return categoriesSource
      .map((cat) => ({ topic: cat.name, count: counter.get(cat.name) ?? 0, keywords: cat.keywords }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [processedResponses, customCategories]);

  const radarTopicDetail = useMemo(() => {
    if (!selectedRadarTopic) return null;
    const selected = topOperationalIssues.find((x) => x.topic === selectedRadarTopic);
    if (!selected) return null;
    const matches = processedResponses.filter((r) => {
      const text = normalize(`${r.improvement} ${r.positive}`);
      return selected.keywords.some((kw) => text.includes(normalize(kw)));
    });
    return {
      topic: selected.topic,
      mentions: matches.length,
      byType: {
        Promotor: matches.filter((r) => r.type === "Promotor").length,
        Satisfecho: matches.filter((r) => r.type === "Satisfecho").length,
        Insatisfecho: matches.filter((r) => r.type === "Insatisfecho").length,
      },
      samples: matches.slice(0, 8),
    };
  }, [selectedRadarTopic, topOperationalIssues, processedResponses]);

  const radarActionQueue = useMemo(() => {
    return topOperationalIssues.slice(0, 5).map((item) => {
      const matches = processedResponses.filter((r) => {
        const text = normalize(`${r.improvement} ${r.positive}`);
        return item.keywords.some((kw) => text.includes(normalize(kw)));
      });
      const detr = matches.filter((r) => r.type === "Insatisfecho").length;
      const sat = matches.filter((r) => r.type === "Satisfecho").length;
      const prom = matches.filter((r) => r.type === "Promotor").length;
      const detrPct = matches.length ? Math.round((detr / matches.length) * 100) : 0;
      const urgency =
        detrPct >= 45 ? "Alta" :
        detrPct >= 30 ? "Media" :
        "Baja";
      return {
        ...item,
        mentions: matches.length,
        detr,
        sat,
        prom,
        detrPct,
        urgency,
      };
    });
  }, [topOperationalIssues, processedResponses]);

  const toneOrder = (id: string, seed: number) =>
    `${id}-${seed}`.split("").reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 1000003, 7);

  const focusResponses = useMemo(() => {
    if (commentFocusFilter === "Todos") return processedResponses;
    return processedResponses.filter((r) => r.type === commentFocusFilter);
  }, [processedResponses, commentFocusFilter]);

  const positivePool = useMemo(() => {
    const positiveKeywords = positiveToneRules.split(",").map((x) => normalize(x)).filter(Boolean);

    return [...focusResponses]
      // Positivos = todo lo que las familias valoran, sin depender de nota alta.
      .filter((r) => hasMeaningfulComment(r.positive))
      .sort((a, b) => {
        const aText = normalize(a.positive);
        const bText = normalize(b.positive);
        const aPriority = positiveKeywords.some((kw) => aText.includes(kw)) ? 0 : 1;
        const bPriority = positiveKeywords.some((kw) => bText.includes(kw)) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return toneOrder(a.id, sessionSeed) - toneOrder(b.id, sessionSeed);
      });
  }, [focusResponses, sessionSeed, positiveToneRules]);

  const positiveCases = useMemo(() => {
    if (positivePool.length === 0) return [];
    const size = Math.min(4, positivePool.length);
    const offset = ((toneSeed % positivePool.length) + positivePool.length) % positivePool.length;
    return Array.from({ length: size }).map((_, idx) => positivePool[(offset + idx) % positivePool.length]);
  }, [positivePool, toneSeed]);

  const constructiveCases = useMemo(() => {
    const constructiveKeywords = constructiveToneRules.split(",").map((x) => normalize(x)).filter(Boolean);

    const pool = [...focusResponses]
      // Oportunidades de mejora = todas las sugerencias/mejoras, sin depender de nota baja.
      // Una misma familia puede aparecer en Positivos y también acá si escribió ambos campos.
      .filter((r) => hasMeaningfulComment(r.improvement))
      .sort((a, b) => {
        const aText = normalize(a.improvement);
        const bText = normalize(b.improvement);
        const aPriority = constructiveKeywords.some((kw) => aText.includes(kw)) ? 0 : 1;
        const bPriority = constructiveKeywords.some((kw) => bText.includes(kw)) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return toneOrder(a.id, sessionSeed + 97) - toneOrder(b.id, sessionSeed + 97);
      });

    if (pool.length === 0) return [];
    const size = Math.min(4, pool.length);
    const offset = (((toneSeed * 3) % pool.length) + pool.length) % pool.length;
    return Array.from({ length: size }).map((_, idx) => pool[(offset + idx) % pool.length]);
  }, [focusResponses, toneSeed, sessionSeed, constructiveToneRules]);

  return (
    <div className="flex flex-col">
      {selectedDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setSelectedDetail(null)}>
          <div className="w-full max-w-2xl rounded-[24px] border border-white bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl font-black text-slate-900">{getPersonDisplayName(selectedDetail, anonymizePeople)}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{selectedDetail.colegio} • {selectedDetail.curso}</p>
              </div>
              <button onClick={() => setSelectedDetail(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X size={16} weight="bold" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Lo positivo</p>
                <div className="mt-2 max-h-[50vh] overflow-y-auto pr-1">
                  <p className="text-sm font-medium leading-relaxed text-slate-700">&ldquo;{selectedDetail.positive || "Sin respuesta"}&rdquo;</p>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Oportunidades de mejora</p>
                <div className="mt-2 max-h-[50vh] overflow-y-auto pr-1">
                  <p className="text-sm font-medium leading-relaxed text-slate-700">&ldquo;{selectedDetail.improvement || "Sin respuesta"}&rdquo;</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {radarTopicDetail && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setSelectedRadarTopic(null)}>
          <div className="w-full max-w-3xl rounded-[24px] border border-white bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl font-black text-slate-900">Radar: {radarTopicDetail.topic}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Menciones: {radarTopicDetail.mentions}</p>
              </div>
              <button onClick={() => setSelectedRadarTopic(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
                <p className="text-[10px] font-black uppercase text-emerald-700">Promotores</p>
                <p className="text-2xl font-black text-emerald-700">{radarTopicDetail.byType.Promotor}</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
                <p className="text-[10px] font-black uppercase text-amber-700">Satisfechos</p>
                <p className="text-2xl font-black text-amber-700">{radarTopicDetail.byType.Satisfecho}</p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
                <p className="text-[10px] font-black uppercase text-red-700">Insatisfechos</p>
                <p className="text-2xl font-black text-red-700">{radarTopicDetail.byType.Insatisfecho}</p>
              </div>
            </div>
            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {radarTopicDetail.samples.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">{getPersonDisplayName(r, anonymizePeople)}</span>
                    <span className="text-[10px] font-bold text-slate-500">{r.type} • Nota {r.score}</span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-slate-700">“{r.improvement || r.positive || "Sin comentario"}”</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 1. KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2 flex items-center gap-5 rounded-[24px] border border-white bg-white/80 px-6 py-5 shadow-xl backdrop-blur-xl sm:col-span-4 lg:col-span-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">NPS</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`font-display text-5xl font-black leading-none ${stats.nps >= 0 ? "text-slate-900" : "text-red-600"}`}>{stats.nps}</span>
            </div>
          </div>
          <div className="h-12 w-px bg-slate-200" />
          <div className="flex flex-col gap-1">
            <span className="text-lg font-black text-slate-800 leading-none">{stats.total}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">respuestas totales</span>
          </div>
        </div>
        <KpiCard
          title="Participación familiar"
          value={`${familyParticipationScopedSummary?.porcentajeParticipacion ?? 0}%`}
          subtitle={`${familyParticipationScopedSummary?.familiasConRespuesta ?? 0} de ${familyParticipationScopedSummary?.totalFamilias ?? 0} familias`}
          accent="text-blue-600"
          icon={<Users size={18} weight="fill" className="text-blue-500" />}
        />
        <KpiCard title="Promotores" value={stats.promoters} subtitle={`${percentage(stats.promoters, stats.total)}% del total`} accent="text-emerald-600" icon={<Star size={18} weight="fill" className="text-emerald-500" />} />
        <KpiCard title="Satisfechos" value={stats.passives} subtitle={`${percentage(stats.passives, stats.total)}% del total`} accent="text-amber-600" icon={<Smiley size={18} weight="fill" className="text-amber-500" />} />
        <KpiCard title="Insatisfechos" value={stats.detractors} subtitle={`${percentage(stats.detractors, stats.total)}% del total`} accent="text-red-600" icon={<Warning size={18} weight="fill" className="text-red-500" />} />
      </div>

      {familyParticipationLoading && (
        <div className="mb-6 rounded-[24px] border border-white bg-white/80 p-5 shadow-xl backdrop-blur-xl">
          <p className="text-sm font-black text-slate-700">Cargando participación familiar...</p>
        </div>
      )}

      {familyParticipation && (
        <div className="mb-6 rounded-[24px] border border-white bg-white/80 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-slate-900">Participación familiar</h4>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Cobertura por familias, no por encuestas individuales
              </p>
            </div>
            <HelpTip
              title="Cómo leer participación familiar"
              body="Familias con respuesta significa que respondió al menos un adulto de esa familia. Solo madre y solo padre son familias donde respondió un solo adulto. Ambos significa que respondieron madre y padre de la misma familia."
            />
          </div>

          <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
            <p className="text-xs font-black text-blue-900">
              Estos indicadores cuentan familias, no cantidad de respuestas.
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-blue-700">
              “Familias con respuesta” = solo madre + solo padre + ambos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard
              title="Total familias"
              value={familyParticipationScopedSummary?.totalFamilias ?? 0}
              subtitle="Familias únicas"
              accent="text-slate-900"
              icon={<Users size={18} weight="fill" className="text-slate-500" />}
            />
            <KpiCard
              title="Familias con respuesta"
              value={familyParticipationScopedSummary?.familiasConRespuesta ?? 0}
              subtitle={`${familyParticipationScopedSummary?.porcentajeParticipacion ?? 0}% del universo`}
              accent="text-emerald-600"
              icon={<ThumbsUp size={18} weight="fill" className="text-emerald-500" />}
            />
            <KpiCard
              title="Solo madre"
              value={familyParticipationScopedSummary?.soloMadre ?? 0}
              subtitle="Respondió madre, no padre"
              accent="text-pink-600"
              />
            <KpiCard
              title="Solo padre"
              value={familyParticipationScopedSummary?.soloPadre ?? 0}
              subtitle="Respondió padre, no madre"
              accent="text-indigo-600"
              />
            <KpiCard
              title="Ambos"
              value={familyParticipationScopedSummary?.ambos ?? 0}
              subtitle="Madre y padre"
              accent="text-violet-600"
              />
          </div>

          {showFamilyExtendedBreakdown && (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 md:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Participación familiar consolidada</p>
              <p className="mt-1 text-sm font-black text-slate-800">
                {familyParticipationScopedSummary?.familiasConRespuesta ?? 0} familias alcanzadas
              </p>
            </div>
          </div>
          )}

          {showFamilyExtendedBreakdown && (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Colegio</th>
                  <th className="px-3 py-2 text-right">Familias</th>
                  <th className="px-3 py-2 text-right">Con respuesta</th>
                  <th className="px-3 py-2 text-right">Solo madre</th>
                  <th className="px-3 py-2 text-right">Solo padre</th>
                  <th className="px-3 py-2 text-right">Ambos</th>
                  <th className="px-3 py-2 text-right">% familias</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(familyParticipation.porColegio) ? familyParticipation.porColegio : [])
                  .filter((row: any) => activeSchool === "Todos los colegios" || sameSchoolName(String(row?.colegio || ""), activeSchool))
                  .map((row: any) => (
                  <tr key={row.colegio} className="border-t border-slate-100 text-slate-700">
                    <td className="px-3 py-2 font-black">{row.colegio}</td>
                    <td className="px-3 py-2 text-right">{row.totalFamilias}</td>
                    <td className="px-3 py-2 text-right font-black text-emerald-700">{row.familiasConRespuesta}</td>
                    <td className="px-3 py-2 text-right text-pink-700">{row.soloMadre}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{row.soloPadre}</td>
                    <td className="px-3 py-2 text-right text-violet-700">{row.ambos}</td>
                    <td className="px-3 py-2 text-right font-black">{row.porcentajeParticipacion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          
        </div>
      )}

      {activeSchool !== "Todos los colegios" && (sharedFamiliesLoading || sharedFamilies || staticFamilyDistribution) && (
        <div className="mb-6 rounded-[24px] border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-700">
                {staticFamilyDistribution
                  ? `Distribución de familias ${staticFamilyDistribution.titleSchool} en el Polo ${staticFamilyDistribution.polo}`
                  : "Dónde más tienen hijos estas familias"}
              </p>
              <p className="mt-1 text-xs font-semibold text-sky-900">
                Total: {sharedFamiliesTotalForTable} familias.
              </p>
            </div>
            {(staticFamilyDistribution?.year || sharedFamilies?.year) && (
              <p className="text-[11px] font-bold text-sky-700">Año {staticFamilyDistribution?.year || sharedFamilies.year}</p>
            )}
          </div>

          {sharedFamiliesLoading && !staticFamilyDistribution && !sharedFamilies?.resumen ? (
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
                    <td className="px-3 py-3 text-right font-black">{sharedFamiliesTotalForTable}</td>
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

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white bg-white/80 p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-slate-900">Radar de oportunidades</h4>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Temas frecuentes en el filtro activo</p>
            </div>
            <HelpTip
              title="Radar de oportunidades"
              body="Fuente: comentarios de lo que las familias valoran y de oportunidades de mejora. Agrupa por categorías/palabras clave para priorizar los temas con más menciones."
            />
          </div>
            <div className="mt-4 space-y-2">
            {topOperationalIssues.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                No hay menciones suficientes para construir prioridades.
              </p>
            ) : (
              radarActionQueue.map((item, idx) => (
                <button aria-label={`Ver detalle del tema ${item.topic}`} key={item.topic} onClick={() => setSelectedRadarTopic(item.topic)} className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-blue-50">
                  <span className="text-xs font-bold text-slate-700">
                    {idx + 1}. {item.topic}
                    
                  </span>
                  <span className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-black text-white">{item.mentions}</span>
                </button>
              ))
            )}
            <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{canEditConfig ? "El radar es informativo. La edición de temas se gestiona abajo en “Categorías de análisis”." : "El radar es informativo y usa los criterios definidos por administración."}</p>
            <div className="pt-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Temas editables</p>
              <div className="flex flex-wrap gap-1">
                {customCategories.map((cat) => (
                  <span key={cat.name} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                    {cat.name}
                  </span>
                ))}
                {customCategories.length === 0 && <span className="text-[10px] font-semibold text-slate-400">{canEditConfig ? "Crealos abajo en “Categorías de análisis”." : "Todavía no hay temas configurados."}</span>}
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Qué es este radar</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Ordena los temas por cantidad de menciones dentro del filtro actual. Cada tema se define por palabras clave y se puede editar abajo.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white bg-white/80 p-5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-slate-900">Comentarios por foco</h4>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Filtrá por perfil y revisá positivos u oportunidades de mejora.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setToneSeed((prev) => prev + 1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-100"
              >
                Rotar
              </button>
              <HelpTip
                title="Comentarios por foco"
                body="Los criterios no excluyen comentarios: ayudan a priorizar y resaltar ejemplos dentro de Positivos y Oportunidades de mejora."
              />
              {canEditConfig && (
                <button aria-label="Editar criterios de comentarios por foco" onClick={() => setEditingToneRules((p) => !p)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700">
                  Editar criterios
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
            <span className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Perfil</span>
            {(["Todos", "Promotor", "Satisfecho", "Insatisfecho"] as FilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setCommentFocusFilter(type);
                  setToneSeed((prev) => prev + 1);
                }}
                className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  commentFocusFilter === type
                    ? type === "Promotor"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : type === "Satisfecho"
                        ? "bg-amber-500 text-white shadow-sm"
                        : type === "Insatisfecho"
                          ? "bg-red-600 text-white shadow-sm"
                          : "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-500 hover:bg-slate-100"
                }`}
              >
                {type === "Todos" ? "Todos" : type === "Promotor" ? "Promotores" : type === "Satisfecho" ? "Satisfechos" : "Insatisfechos"}
              </button>
            ))}
          </div>

          {editingToneRules && canEditConfig && (
            <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Cómo usar: separá palabras por coma</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input value={positiveToneRules} onChange={(e) => setPositiveToneRules(e.target.value)} className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-slate-700" placeholder="Criterios Positivos" />
                <input value={constructiveToneRules} onChange={(e) => setConstructiveToneRules(e.target.value)} className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-slate-700" placeholder="Criterios Oportunidades de mejora" />
              </div>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">Positivos</p>
              <div className="space-y-2">
                {positiveCases.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                    Sin positivos para este perfil/filtro.
                  </p>
                ) : (
                  positiveCases.map((item) => (
                    <button key={item.id} onClick={() => setSelectedDetail(item)} className="w-full rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800">{getPersonDisplayName(item, anonymizePeople)}</span>
                        <span className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white">Nota {item.score}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-700">
                        &ldquo;{String(item.positive).slice(0, 95)}{String(item.positive).length > 95 ? "…" : ""}&rdquo;
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-blue-600">Oportunidades de mejora</p>
              <div className="space-y-2">
                {constructiveCases.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                    Sin oportunidades de mejora para este perfil/filtro.
                  </p>
                ) : (
                  constructiveCases.map((item) => (
                    <button key={item.id} onClick={() => setSelectedDetail(item)} className="w-full rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800">{getPersonDisplayName(item, anonymizePeople)}</span>
                        <span className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-black text-white">Nota {item.score}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-700">
                        &ldquo;{String(item.improvement).slice(0, 95)}{String(item.improvement).length > 95 ? "…" : ""}&rdquo;
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CATEGORÍAS PERSONALIZADAS */}
      <div className="mb-6 rounded-[24px] border border-white bg-blue-50/50 p-5 shadow-sm backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-blue-100 p-2 text-blue-600 shrink-0">
            <Bookmarks size={20} weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div>
                <h4 className="text-sm font-black text-slate-900">Categorías de Análisis</h4>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{canEditConfig ? "Creá y editá criterios por palabras clave para controlar el radar del proyecto" : "Criterios de lectura definidos por administración"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => loadProjectTeamConfig({ showMessage: true })}
                  disabled={!projectId || syncingProjectConfig}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 shadow-sm transition-all hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncingProjectConfig ? "Sincronizando..." : "Sincronizar ahora"}
                </button>
                {canEditConfig && (
                  <>
                    <button 
                      onClick={() => setIsCreatingCat(!isCreatingCat)} 
                      className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 shadow-sm transition-all hover:bg-blue-600 hover:text-white"
                    >
                      <Plus size={12} weight="bold" /> Nueva
                    </button>
                  </>
                )}
              </div>
            </div>
            {syncMessage && (
              <p className="mb-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700">
                {syncMessage}
              </p>
            )}
            {canEditConfig && (
              <div className="mb-3 rounded-xl border border-blue-100 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Cómo editar temas (rápido)</p>
                <ul className="mt-1 space-y-1 text-xs font-semibold text-slate-600">
                  <li>1) Elegí un tema y tocá el ícono de lápiz.</li>
                  <li>2) Cambiá nombre y palabras clave separadas por coma.</li>
                  <li>3) Guardá y el radar se recalcula automáticamente.</li>
                  <li>4) Los cambios quedan guardados para todas las cuentas que abran este mismo proyecto.</li>
                </ul>
              </div>
            )}

            {isCreatingCat && canEditConfig && (
              <div className="mb-4 mt-3 flex flex-col sm:flex-row gap-2 rounded-xl bg-white p-3 border border-blue-100 shadow-sm">
                <input 
                  type="text" 
                  placeholder="Nombre (ej: Baños)" 
                  value={newCatName} 
                  onChange={(e) => setNewCatName(e.target.value)} 
                  className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-blue-200" 
                />
                <input 
                  type="text" 
                  placeholder="Palabras separadas por coma (ej: sucio, papel, agua)" 
                  value={newCatWords} 
                  onChange={(e) => setNewCatWords(e.target.value)} 
                  className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none border border-transparent focus:border-blue-200" 
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                />
                <button 
                  onClick={handleAddCategory} 
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 transition-colors"
                >
                  Guardar
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {!themesHydrated && (
                <span className="text-xs font-semibold text-slate-400">Cargando categorías del proyecto...</span>
              )}
              {themesHydrated && customCategories.length === 0 && !isCreatingCat && (
                 <span className="text-xs font-semibold text-slate-400">{canEditConfig ? "Aún no hay categorías. Agregá una para empezar a filtrar." : "Aún no hay categorías guardadas para este proyecto."}</span>
              )}
              {themesHydrated && customCategories.map(cat => (
                 <div 
                   key={cat.name} 
                   onClick={() => { setActiveCategory(activeCategory === cat.name ? null : cat.name); setCurrentPage(1); }}
                   className={`group flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                     activeCategory === cat.name 
                       ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                       : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                   }`}
                 >
                   <span>{cat.name}</span>
                   {canEditConfig && (
                     <>
                       <button 
                         onClick={(e) => startEditCategory(cat.name, e)}
                         className={`rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100 ${activeCategory === cat.name ? "text-white hover:bg-blue-700" : "hover:bg-slate-100 text-slate-400"}`}
                         title="Editar palabras clave"
                       >
                         <PencilSimple size={12} weight="bold" />
                       </button>
                       <button 
                         onClick={(e) => removeCategory(cat.name, e)} 
                         className={`rounded-full p-0.5 opacity-50 transition-opacity hover:opacity-100 ${activeCategory === cat.name ? "text-white hover:bg-blue-700" : "hover:bg-slate-100 text-slate-400"}`}
                       >
                         <X size={12} weight="bold" />
                       </button>
                     </>
                   )}
                 </div>
              ))}
            </div>
            {editingCatName && canEditConfig && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-blue-100 bg-white p-3 sm:flex-row">
                <input
                  value={editingCatNewName}
                  onChange={(e) => setEditingCatNewName(e.target.value)}
                  placeholder="Nombre del tema"
                  className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none border border-blue-100"
                />
                <input
                  value={editingCatWords}
                  onChange={(e) => setEditingCatWords(e.target.value)}
                  placeholder="Palabras separadas por coma"
                  className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none border border-blue-100"
                />
                <button onClick={saveCategoryEdit} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700">Guardar criterios</button>
                <button onClick={() => { setEditingCatName(null); setEditingCatNewName(""); setEditingCatWords(""); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">Cancelar</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR (Filtros, Orden y Buscador) */}
      <div className="sticky top-[100px] z-30 mb-5 flex flex-col gap-4 rounded-[24px] border border-white bg-white/85 p-4 shadow-md backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        
        {/* Filtros Base */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Funnel size={18} weight="fill" />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["Todos", "Promotor", "Satisfecho", "Insatisfecho"] as FilterType[]).map((f) => (
              <button 
                key={f} 
                onClick={() => { setFilterType(f); setCurrentPage(1); }} 
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                  filterType === f 
                  ? "bg-slate-800 text-white shadow-md" 
                  : "bg-transparent text-slate-500 hover:bg-slate-100"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-2 flex items-center gap-1 rounded-lg bg-indigo-50 p-1">
            <button
              onClick={() => { setSavedFilter("all"); setCurrentPage(1); }}
              className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${savedFilter === "all" ? "bg-white text-indigo-700 shadow-sm" : "text-indigo-500"}`}
            >
              Todos
            </button>
            <button
              onClick={() => { setSavedFilter("saved"); setCurrentPage(1); }}
              className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${savedFilter === "saved" ? "bg-indigo-600 text-white shadow-sm" : "text-indigo-600"}`}
            >
              Marcados ({savedCommentIds.length})
            </button>
          </div>
        </div>

        {/* Buscador y Orden */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-56">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar apellido, colegio o comentario..." 
              value={searchTerm} 
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-300 focus:ring-2 shadow-sm" 
            />
            {searchTerm && <button onClick={() => { setSearchTerm(""); setCurrentPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={13} weight="bold" /></button>}
          </div>

          <div className="relative flex w-full sm:w-auto items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <SortDescending size={16} className="text-slate-400 shrink-0" />
            <select 
              value={sortBy} 
              onChange={(e) => { setSortBy(e.target.value as any); setCurrentPage(1); }}
              className="appearance-none bg-transparent pr-4 text-xs font-bold text-slate-700 outline-none cursor-pointer w-full"
            >
              <option value="recientes">Recientes</option>
              <option value="mayor">Mayor nota</option>
              <option value="menor">Menor nota</option>
            </select>
          </div>
          {/* Descarga deshabilitada por confidencialidad. */}
        </div>
      </div>

      {/* 4. GRILLA DE CARDS */}
      {paginatedResponses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white/50 py-16 text-center">
          <MagnifyingGlass size={32} weight="duotone" className="mb-2 text-slate-300" />
          <h3 className="font-display text-sm font-black text-slate-600 uppercase tracking-widest">Sin resultados</h3>
          <p className="mt-1 text-xs font-bold text-slate-400">No hay respuestas que coincidan con los filtros actuales.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
          {paginatedResponses.map((res) => (
            <SurveyCard
              key={res.id}
              res={res}
              searchTerm={searchTerm}
              extraKeywords={activeKeywords}
              isSaved={savedCommentIds.includes(res.id)}
              onToggleSave={toggleSaveComment}
              anonymizePeople={anonymizePeople}
            />
          ))}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between rounded-[24px] border border-white bg-white/80 p-5 shadow-xl backdrop-blur-xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Página <span className="text-slate-900">{currentPage}</span> de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:opacity-40 shadow-sm"><CaretLeft size={16} weight="bold" /></button>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:opacity-40 shadow-sm"><CaretRight size={16} weight="bold" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
