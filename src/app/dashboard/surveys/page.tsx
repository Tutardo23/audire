"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import {
  ArrowLeft,
  Buildings,
  CaretDown,
  CircleNotch,
  DotsThreeOutlineVertical,
  DownloadSimple,
  FilePdf,
  Folder,
  Trash,
  UploadSimple,
  ChartBar,
  X,
  ShieldCheck
} from "phosphor-react";

import { SignOutButton, useUser } from "@clerk/nextjs";
import {
  eliminarEncuestasDB,
  obtenerEncuestasComparativoPoloBatchDB,
  obtenerEncuestasDB,
  subirEncuestasBatch,
  listarProyectosDB,
  listarProyectosComparacionNpsDB,
} from "../../actions";

import DirectorDashboard from "../../../components/DirectorDashboard"; 
import TeamDashboard from "../../../components/TeamDashboard"; 

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type ViewMode = "director" | "team";
type DirectorTopic = "Promotor" | "Satisfecho" | "Insatisfecho";
type FilterType = "Todos" | "Promotor" | "Satisfecho" | "Insatisfecho";
type UserRole = "admin" | "director" | "equipo" | "oficina" | "other";

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

const schoolCanonicalKey = (value?: string | null) =>
  normalize(value)
    .replace(/^((colegio|jardin)\s+)+/, "")
    .replace(/\s+/g, " ")
    .trim();

const extraerAnioONull = (titulo?: string | null) => {
  const match = String(titulo ?? "").match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
};

const extraerAnio = (titulo: string) => {
  return extraerAnioONull(titulo) ?? new Date().getFullYear();
};

const projectTrack = (name?: string | null): "varones" | "mujeres" | "jardin" | "otro" => {
  const n = normalize(name);
  if (n.includes("jardin")) return "jardin";
  if (n.includes("mujer")) return "mujeres";
  if (n.includes("varon")) return "varones";
  return "otro";
};

const SENTIMENT_RULES = [
  { label: "Crítico" as const, score: 4, patterns: [/desastre|pesimo|pésimo|inaceptable|verguenza|vergüenza|indignante|horrible|injusto|hartos|insoportable|imperdonable/] },
  { label: "Observación" as const, score: 3, patterns: [/\b(falta|faltan|problema|problemas|queja|quejas|arreglar|rotos|roto|sucio|sucia|tarde|nunca|jamas|jamás|mal trato|mala atención)\b/, /\b(no funciona|no responden|no hay|sin respuesta|no llegó|no llego|no tienen)\b/] },
  { label: "Sugerencia" as const, score: 2, patterns: [/\b(sugiero|podrian|podrían|seria bueno|sería bueno|oportunidad|mejorar|ideal|estaria|estaría|sumar|propongo|agregaria|agregaría|se podria|se podría)\b/] },
];

const analizarSentimiento = (texto: string) => {
  const t = normalize(texto);
  if (!t || t.length < 10) return { label: "Neutro" as const, score: 1 };
  for (const rule of SENTIMENT_RULES) {
    const matches = rule.patterns.filter((p) => p.test(t)).length;
    if (rule.label === "Observación" && matches >= 2) return { label: rule.label, score: rule.score };
    if (rule.label !== "Observación" && matches >= 1) return { label: rule.label, score: rule.score };
  }
  return { label: "Neutro" as const, score: 1 };
};

const RISK_WORDS = ["bullying", "maltrato", "acoso", "llora", "depresion", "depresión", "violencia", "golpe", "insulto", "amenaza", "miedo", "terror", "suicid", "abuso"];

const detectarRiesgo = (texto: string) => {
  const t = normalize(texto);
  const found = RISK_WORDS.filter((w) => t.includes(normalize(w)));
  if (found.length >= 2) return { risk: true, riskLevel: "Prioritario" as const, riskWords: found };
  if (found.length === 1) return { risk: true, riskLevel: "Sensible" as const, riskWords: found };
  return { risk: false, riskLevel: "Ninguno" as const, riskWords: [] };
};

const hasScoreColumn = (rows: any[]) => {
  if (!rows?.length) return false;
  const keys = Object.keys(rows[0] || {});
  return Boolean(keys.find(k => normalize(k).includes("valoraci") || normalize(k).includes("1 al 10") || normalize(k).includes("nota") || normalize(k) === "q2" || normalize(k).includes("recomendar")));
};

const procesarDatosCSV = (data: any[], fallbackYear: number): SurveyRow[] => {
  if (!data?.length) return [];
  const keys = Object.keys(data[0] || {});
  const find = (...terms: string[]) => keys.find((k) => terms.some((t) => normalize(k).includes(t)));

  const scoreKey = find("valoraci", "1 al 10", "nota", "q2", "recomendar", "puntuacion", "nps");
  const posKey = find("valoras", "positivo", "q3", "destaca", "aspectos positivos");
  const impKey = find("mejora", "oportunidades", "q4", "podriamos mejorar", "podríamos mejorar", "aspectos negativos");
  
  const colKey = find("colegio", "institucion", "custom_2");
  const poloKey = find("polo", "region", "zona", "custom_4");
  const nameKey = find("nombre", "first_name", "name");
  const lastNameKey = find("apellido", "last_name");
  const courseKey = find("curso", "grado", "departamento", "sala", "anio", "año");
  const sexKey = find("sexo", "genero", "custom_5");

  if (!scoreKey) return [];

  return data
    .filter((row) => row[scoreKey] && !isNaN(parseInt(row[scoreKey])))
    .map((row): SurveyRow => {
      const score = parseInt(row[scoreKey]) || 0;
      const type: SurveyRow["type"] = score >= 9 ? "Promotor" : score >= 7 ? "Satisfecho" : "Insatisfecho";
      const positive = posKey ? String(row[posKey] || "") : "";
      const improvement = impKey ? String(row[impKey] || "") : "";
      const textoCompleto = `${positive} ${improvement}`.trim();

      const { risk, riskLevel, riskWords } = detectarRiesgo(textoCompleto);
      const { label: sentimentLabel, score: sentimentScore } = analizarSentimiento(textoCompleto);

      const dateRaw = row["date_created"] || row["Marca de tiempo (dd/mm/yyyy)"] || new Date().toISOString();
      const dateStr = dateRaw.split(" ")[0]; 
      const dt = new Date(dateStr.includes("/") ? dateStr.split("/").reverse().join("-") : dateStr);
      const year = isNaN(dt.getFullYear()) ? fallbackYear : dt.getFullYear();

      return {
        id: row["respondent_id"] || row["ID de respuesta"] || Math.random().toString(36).slice(2, 11),
        date: dateStr,
        nombre: nameKey ? String(row[nameKey] || "") : "",
        apellido: lastNameKey ? String(row[lastNameKey] || "") : "",
        colegio: colKey ? String(row[colKey] || "APDES") : "APDES",
        curso: courseKey ? String(row[courseKey] || "-") : "-",
        polo: poloKey ? String(row[poloKey] || "General") : "General",
        sexo: sexKey ? String(row[sexKey] || "N/A") : "N/A",
        score, type, positive, improvement, positiveTags: [], improvementTags: [],
        risk, riskLevel, riskWords, sentiment: sentimentLabel, sentimentScore, year,
      };
    });
};

// ─────────────────────────────────────────────
// UI AUX
// ─────────────────────────────────────────────
function SurveysFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] font-sans">
      <div className="flex flex-col items-center gap-4 text-blue-600">
        <CircleNotch size={48} className="animate-spin" />
        <h2 className="font-bold text-slate-700">Cargando datos principales...</h2>
        <p className="max-w-xs text-center text-xs font-semibold text-slate-400">El panel se abre apenas carga el proyecto; NPS histórico y polo siguen preparando datos en segundo plano.</p>
      </div>
    </div>
  );
}

function ViewModeSwitch({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
      <button onClick={() => setViewMode("director")} className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${viewMode === "director" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Vista Director</button>
      <button onClick={() => setViewMode("team")} className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${viewMode === "team" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Vista Equipo</button>
    </div>
  );
}

const getUserRole = (rawRole: unknown): UserRole => {
  const role = String(rawRole ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "director") return "director";
  if (role === "equipo") return "equipo";
  if (role === "oficina") return "oficina";
  return "other";
};

const getScopedFilters = (metadata: Record<string, unknown> | undefined) => {
  const colegio = String(metadata?.colegio ?? metadata?.school ?? "").trim();
  const polo = String(metadata?.polo ?? metadata?.region ?? "").trim();
  return {
    colegio: colegio || undefined,
    polo: polo || undefined,
  };
};

const schoolBrand = (school: string) => {
  const n = normalize(school);
  if (n.includes("mirasoles")) return { ring: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700" };
  if (n.includes("buen ayre")) return { ring: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" };
  if (n.includes("portezuelo")) return { ring: "border-indigo-200", bg: "bg-indigo-50", text: "text-indigo-700" };
  if (n.includes("pucara")) return { ring: "border-amber-200", bg: "bg-blue-50", text: "text-blue-800" };
  if (n.includes("torreon")) return { ring: "border-cyan-200", bg: "bg-cyan-50", text: "text-cyan-700" };
  if (n.includes("arroyos")) return { ring: "border-sky-200", bg: "bg-sky-50", text: "text-sky-700" };
  if (n.includes("cerros")) return { ring: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" };
  return { ring: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700" };
};

const schoolInitials = (school: string) =>
  school
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

const schoolLogoPath = (school: string) => {
  const n = normalize(school);
  if (n.includes("jardin buen molino")) return "/jardinbuenmolino.png";
  if (n.includes("jardin cauquen")) return "/jardincauquen.png";
  if (n.includes("jardin los cerritos")) return "/jardincerritos.png";
  if (n.includes("jardin crisol")) return "/jardincrisol.png";
  if (n.includes("jardin los senderos")) return "/jardinlossenderos.png";
  if (n.includes("jardin platero")) return "/jardinplatero.png";
  if (n.includes("jardin torreon")) return "/jardintorreon.png";
  if (n.includes("bosque del plata")) return "/bosquedelplata.png";
  if (n.includes("buen ayre")) return "/buenayre.png";
  if (n.includes("cinco rios")) return "/cincorios.png";
  if (n.includes("crisol")) return "/crisol.png";
  if (n.includes("los arroyos")) return "/losarroyos.png";
  if (n.includes("los caminos")) return "/loscaminos.png";
  if (n.includes("los candiles")) return "/loscandiles.png";
  if (n.includes("los cerros")) return "/loscerros.png";
  if (n.includes("los molinos")) return "/losmolinos.png";
  if (n.includes("los olivos")) return "/losolivos.png";
  if (n.includes("mirasoles")) return "/mirasoles.png";
  if (n.includes("portezuelo")) return "/portezuelo.png";
  if (n.includes("pucara")) return "/pucara.png";
  if (n.includes("torreon")) return "/torreon.png";
  return "";
};

const connectedRowsCacheKey = (projectId: string, idsKey: string) =>
  projectId && idsKey ? `apdes:connected-rows:${projectId}:${idsKey}` : "";

const readConnectedRowsCache = (projectId: string, idsKey: string): SurveyRow[] | null => {
  if (typeof window === "undefined") return null;
  const key = connectedRowsCacheKey(projectId, idsKey);
  if (!key) return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeConnectedRowsCache = (projectId: string, idsKey: string, rows: SurveyRow[]) => {
  if (typeof window === "undefined") return;
  const key = connectedRowsCacheKey(projectId, idsKey);
  if (!key) return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Si el navegador bloquea storage o se llena, no rompemos el dashboard.
  }
};

// ─────────────────────────────────────────────
// PÁGINA PRINCIPAL Y NAVEGACIÓN
// ─────────────────────────────────────────────
export default function Page() {
  return (
    <Suspense fallback={<SurveysFallback />}>
      <AnalyticsDashboardLive />
    </Suspense>
  );
}

function AnalyticsDashboardLive() {
  const { user } = useUser();
  const userRole = getUserRole(user?.publicMetadata?.role);
  const scopedFilters = getScopedFilters(user?.publicMetadata as Record<string, unknown> | undefined);
  const isAdmin = userRole === "admin";
  const isDirector = userRole === "director";
  const isTeam = userRole === "equipo";
  const isOffice = userRole === "oficina";
  const canChooseSchool = isAdmin || isTeam || isOffice;
  const canSwitchView = isAdmin;
  const canViewTeam = isAdmin || isTeam || isOffice;
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [directorCommentLimit, setDirectorCommentLimit] = useState<number>(20); 
  const [directorTopic, setDirectorTopic] = useState<DirectorTopic>("Satisfecho");
  const [viewMode, setViewMode] = useState<ViewMode>(canViewTeam ? "team" : "director");
  const [logoOk, setLogoOk] = useState(true);
  const [audireLogoOk, setAudireLogoOk] = useState(true);

  const [activeSchool, setActiveSchool] = useState("Todos los colegios");
  const [colegiosSurvey, setColegiosSurvey] = useState<string[]>(["Todos los colegios"]);

  const [encuestas, setEncuestas] = useState<SurveyRow[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [connectedProjectIds, setConnectedProjectIds] = useState<string[]>([]);
  const [connectedRows, setConnectedRows] = useState<SurveyRow[]>([]);
  const [connectedRowsLoading, setConnectedRowsLoading] = useState(true);

  // Equipo state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("Todos");
  const [currentPage, setCurrentPage] = useState(1);
  const schoolTheme = schoolBrand(activeSchool);
  const schoolLogo = activeSchool === "Todos los colegios" ? "/escudo-apdes.png" : schoolLogoPath(activeSchool);
  const effectiveViewMode: ViewMode = viewMode === "team" && canViewTeam ? "team" : "director";

  useEffect(() => {
    setLogoOk(true);
  }, [activeSchool]);

  useEffect(() => {
    if (isAdmin) return;
    setViewMode(isTeam || isOffice ? "team" : "director");
  }, [isAdmin, isTeam, isOffice]);

  useEffect(() => {
    // Solo Director queda fijo al colegio asignado.
    // Equipo y Oficina central eligen colegio igual que Admin.
    if (isTeam || isOffice) return;
    if (scopedFilters.colegio) {
      setActiveSchool(scopedFilters.colegio);
    }
  }, [scopedFilters.colegio, isTeam, isOffice]);

  useEffect(() => {
    if (!projectId) return;
    const md = (user?.publicMetadata as Record<string, unknown> | undefined) ?? {};
    const rawCompare = md.compare_project_ids ?? md.compareProjectIds ?? [];
    const compareIds = Array.isArray(rawCompare) ? rawCompare.map((x) => String(x)).filter(Boolean) : [];
    const rawVisible = md.project_ids ?? md.projectIds ?? [];
    const visibleIds = Array.isArray(rawVisible) ? rawVisible.map((x) => String(x)).filter(Boolean) : [];

    // Fuente principal: configuración persistente de Admin > Perfiles.
    // Fallback para roles operativos sin compare explícito: proyectos visibles.
    if (compareIds.length > 0 || !isAdmin) {
      const chosen = compareIds.length > 0 ? compareIds : visibleIds;
      setConnectedProjectIds(chosen.filter((id) => id !== projectId));
      return;
    }

    // Solo admin sin compare configurado: puede usar conexión temporal de menú.
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(`project-links:${projectId}`);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setConnectedProjectIds(parsed.map((x) => String(x)));
    } catch {
      setConnectedProjectIds([]);
    }
  }, [isAdmin, projectId, user?.publicMetadata]);

  const projectName = useMemo(() => {
     const p = allProjects.find(x => x.id === projectId);
     return p ? p.nombre : "Cargando...";
  }, [allProjects, projectId]);

  const projectYear = useMemo(() => {
    return extraerAnioONull(projectName) ?? new Date().getFullYear();
  }, [projectName]);

  const headerTitle = useMemo(() => {
    const assignedSchool = String(scopedFilters.colegio || "").trim();
    const selectedSchool = String(activeSchool || "").trim();

    // Si el usuario está parado en un colegio concreto, el encabezado debe mostrar
    // el colegio + año, no el nombre general del proyecto tipo "Varones - 2025".
    // Esto aplica para admin, director y equipo.
    if (selectedSchool && selectedSchool !== "Todos los colegios") {
      return `${selectedSchool} - ${projectYear}`;
    }

    // Si el perfil no puede elegir colegio pero tiene colegio asignado, mostramos
    // su colegio aunque el selector interno esté en "Todos los colegios".
    if (assignedSchool && !canChooseSchool) {
      return `${assignedSchool} - ${projectYear}`;
    }

    return projectName;
  }, [activeSchool, canChooseSchool, projectName, projectYear, scopedFilters.colegio]);

  const poloCompareProjectIds = useMemo(() => {
    if (!projectId) return [] as string[];
    const current = allProjects.find((p) => String(p.id) === String(projectId));
    const currentName = String(current?.nombre || "");
    const currentYear = extraerAnio(currentName);

    return allProjects
      .filter((p) => String(p.id) !== String(projectId))
      .filter((p) => {
        const name = String(p?.nombre || "");
        return extraerAnio(name) === currentYear;
      })
      .map((p) => String(p.id));
  }, [allProjects, projectId]);

  const historicalCompareProjectIds = useMemo(() => {
    if (!projectId) return [] as string[];
    const current = allProjects.find((p) => String(p.id) === String(projectId));
    const currentName = String(current?.nombre || "");
    const currentTrack = projectTrack(currentName);
    const currentYear = extraerAnio(currentName);

    return allProjects
      .filter((p) => String(p.id) !== String(projectId))
      .filter((p) => {
        const name = String(p?.nombre || "");
        const sameTrack = currentTrack === "otro" || projectTrack(name) === currentTrack;
        const differentYear = extraerAnio(name) !== currentYear;
        return sameTrack && differentYear;
      })
      .map((p) => String(p.id));
  }, [allProjects, projectId]);

  const effectiveCompareProjectIds = useMemo(() => {
    const union = new Set<string>([
      ...connectedProjectIds.map(String),
      ...poloCompareProjectIds.map(String),
      ...historicalCompareProjectIds.map(String),
    ]);
    union.delete(String(projectId));
    return Array.from(union);
  }, [connectedProjectIds, poloCompareProjectIds, historicalCompareProjectIds, projectId]);

  const effectiveCompareProjectIdsKey = useMemo(() => {
    return effectiveCompareProjectIds.map(String).sort().join("|");
  }, [effectiveCompareProjectIds]);

  // CARGA DE DATOS
  useEffect(() => {
    let cancelled = false;

    async function cargarDatos() {
      if (!projectId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Antes esto se hacía en cascada:
        // 1) proyectos visibles → 2) proyectos de comparación → 3) encuestas.
        // Eso dejaba la pantalla mucho tiempo en "Cargando datos...".
        // Ahora se dispara todo en paralelo y la vista principal aparece apenas
        // están listas las encuestas del proyecto actual.
        const [projectsResult, surveysResult] = await Promise.allSettled([
          listarProyectosDB(),
          obtenerEncuestasDB(projectId),
        ]);

        if (cancelled) return;

        const projs = projectsResult.status === "fulfilled"
          ? Array.isArray(projectsResult.value)
            ? projectsResult.value
            : ((projectsResult.value as any)?.rows || [])
          : [];

        const mergedProjectsMap = new Map<string, any>();
        projs.forEach((p: any) => {
          if (p?.id) mergedProjectsMap.set(String(p.id), p);
        });
        const mergedProjects = Array.from(mergedProjectsMap.values());
        setAllProjects(mergedProjects);

        // EXTRAER AÑO DEL NOMBRE DEL PROYECTO ACTUAL
        const proyectoActual = mergedProjects.find((p: any) => String(p.id) === String(projectId));
        const anioDetectado = extraerAnio(proyectoActual?.nombre || "");

        if (surveysResult.status !== "fulfilled") {
          throw surveysResult.reason;
        }

        const data = surveysResult.value;
        const lista: any[] = Array.isArray(data) ? data : (data as any).rows || [];
        
        const enriched: SurveyRow[] = lista.map((item): SurveyRow => {
          const positive = String(item.positive ?? "");
          const improvement = String(item.improvement ?? "");
          const textoCompleto = `${positive} ${improvement}`.trim();
          const { risk, riskLevel, riskWords } = detectarRiesgo(textoCompleto);
          const { label: sentimentLabel, score: sentimentScore } = analizarSentimiento(textoCompleto);
          const score = Number(item.score) || 0;
          const dt = new Date(item.date || item.created_at);
          
          // El año del gráfico histórico debe salir del proyecto, no de la fecha de carga.
          // Si una encuesta 2025 se cargó en 2026, igual debe seguir agrupando como 2025.
          const year = anioDetectado || (!isNaN(dt.getTime()) ? dt.getFullYear() : new Date().getFullYear());

          return {
            id: String(item.id ?? Math.random().toString(36).slice(2, 11)),
            projectId: String(projectId),
            projectName: String(proyectoActual?.nombre || projectName || ""),
            date: String(item.date ?? "Reciente"),
            nombre: String(item.nombre ?? ""),
            apellido: String(item.apellido ?? ""),
            colegio: String(item.colegio ?? "APDES"),
            curso: String(item.curso ?? "-"),
            polo: String(item.polo ?? "General"),
            sexo: String(item.sexo ?? "N/A"),
            score, type: score >= 9 ? "Promotor" : score >= 7 ? "Satisfecho" : "Insatisfecho",
            positive, improvement, positiveTags: [], improvementTags: [],
            risk, riskLevel, riskWords, sentiment: sentimentLabel, sentimentScore, year,
            anonFamilyKey: String((item as any).anonFamilyKey ?? ""),
            anonCompositeKey: String((item as any).anonCompositeKey ?? ""),
          };
        });

        setEncuestas(enriched);
        const map = new Map<string, string>();
        enriched.forEach((item) => {
          const raw = item.colegio.trim();
          if (!raw) return;
          const key = schoolCanonicalKey(raw);
          if (!map.has(key)) map.set(key, raw);
        });

        let uniqueSchools = Array.from(map.values()).sort();
        if (scopedFilters.colegio && !isTeam && !isOffice) {
          uniqueSchools = uniqueSchools.filter((c) => normalize(c) === normalize(scopedFilters.colegio));
        }
        setColegiosSurvey(["Todos los colegios", ...uniqueSchools]);
        if (scopedFilters.colegio && !isTeam && !isOffice) setActiveSchool(scopedFilters.colegio);
      } catch (error) {
        if (!cancelled) console.error("Error cargando:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    cargarDatos();

    return () => {
      cancelled = true;
    };
  }, [projectId, scopedFilters.colegio, isAdmin, isTeam, isOffice]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompareProjectsForDirector() {
      // Los proyectos de comparación/NPS solo se necesitan en Vista Director.
      // Equipo y Oficina Central no deben disparar esta carga.
      if (!projectId || effectiveViewMode !== "director") {
        setConnectedProjectIds([]);
        setConnectedRows([]);
        setConnectedRowsLoading(false);
        return;
      }

      try {
        const result = await listarProyectosComparacionNpsDB();
        if (cancelled) return;

        const compareProjs = Array.isArray(result)
          ? result
          : ((result as any)?.rows || []);

        setAllProjects((prev) => {
          const merged = new Map<string, any>();
          prev.forEach((p: any) => {
            if (p?.id) merged.set(String(p.id), p);
          });
          compareProjs.forEach((p: any) => {
            if (p?.id) merged.set(String(p.id), p);
          });
          return Array.from(merged.values());
        });

        if (!isAdmin && compareProjs.length > 0) {
          setConnectedProjectIds(
            compareProjs
              .map((p: any) => String(p.id))
              .filter((id: string) => id !== String(projectId))
          );
        }
      } catch {
        if (!cancelled && !isAdmin) {
          setConnectedProjectIds([]);
        }
      }
    }

    loadCompareProjectsForDirector();

    return () => {
      cancelled = true;
    };
  }, [projectId, effectiveViewMode, isAdmin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
        setIsProfileOpen(false);
      }
    };
    if (isMenuOpen || isProfileOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMenuOpen, isProfileOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadConnectedRows() {
      // Esta carga es SOLO para la Vista Director.
      // Equipo no usa NPS histórico/conectado; si la dejamos activa, dispara un POST por cada proyecto conectado.
      if (effectiveViewMode !== "director") {
        setConnectedRows([]);
        setConnectedRowsLoading(false);
        return;
      }

      const ids = effectiveCompareProjectIdsKey
        ? effectiveCompareProjectIdsKey.split("|").filter(Boolean)
        : [];

      if (ids.length === 0) {
        setConnectedRows([]);
        setConnectedRowsLoading(false);
        return;
      }

      const cached = readConnectedRowsCache(projectId, effectiveCompareProjectIdsKey);
      if (cached) {
        setConnectedRows(cached);
        setConnectedRowsLoading(false);
        return;
      }

      setConnectedRowsLoading(true);

      try {
        const batchRows = await obtenerEncuestasComparativoPoloBatchDB(ids);
        if (cancelled) return;

        // Una sola Server Action trae todos los proyectos comparativos.
        // Evita disparar un POST por cada proyecto/año y mantiene funcionando el NPS comparado.
        const rowsByProject = new Map<string, any[]>();
        (Array.isArray(batchRows) ? batchRows : []).forEach((row: any) => {
          const sourceProjectId = String(row?.project_id || row?.projectId || "");
          if (!sourceProjectId) return;
          const bucket = rowsByProject.get(sourceProjectId) || [];
          bucket.push(row);
          rowsByProject.set(sourceProjectId, bucket);
        });

        const datasets = ids.map((id) => ({
          projectId: id,
          projectName: allProjects.find((p) => String(p.id) === String(id))?.nombre || "",
          rows: rowsByProject.get(String(id)) || [],
        }));

        const rows = datasets.flatMap((dataset: any) => {
          const lista: any[] = Array.isArray(dataset.rows) ? dataset.rows : dataset.rows?.rows || [];
          const sourceProjectId = String(dataset.projectId || "");
          const sourceProjectName = String(dataset.projectName || "");
          const sourceProjectYear = extraerAnioONull(sourceProjectName);
          return lista.map((item) => {
            // Los proyectos conectados se usan para NPS/histórico/polo.
            // La action liviana ya no trae comentarios para no duplicar transferencia.
            const score = Number(item.score) || 0;
            const dt = new Date(item.date || item.created_at);
            return {
              id: String(item.id ?? `${sourceProjectId}-${Math.random().toString(36).slice(2, 11)}`),
              date: String(item.date ?? "Reciente"),
              nombre: "",
              apellido: "",
              colegio: String(item.colegio ?? "APDES"),
              curso: "-",
              polo: String(item.polo ?? "General"),
              sexo: "N/A",
              score,
              type: score >= 9 ? "Promotor" : score >= 7 ? "Satisfecho" : "Insatisfecho",
              positive: "",
              improvement: "",
              positiveTags: [],
              improvementTags: [],
              risk: false,
              riskLevel: "Ninguno",
              riskWords: [],
              sentiment: "Neutro",
              sentimentScore: 0,
              year: sourceProjectYear ?? (!isNaN(dt.getTime()) ? dt.getFullYear() : new Date().getFullYear()),
              projectId: sourceProjectId,
              projectName: sourceProjectName,
              anonFamilyKey: String((item as any).anonFamilyKey ?? ""),
              anonCompositeKey: String((item as any).anonCompositeKey ?? ""),
            } as SurveyRow;
          });
        });

        setConnectedRows(rows);
        writeConnectedRowsCache(projectId, effectiveCompareProjectIdsKey, rows);
      } catch {
        if (!cancelled) setConnectedRows([]);
      } finally {
        if (!cancelled) setConnectedRowsLoading(false);
      }
    }

    loadConnectedRows();
    return () => {
      cancelled = true;
    };
  }, [effectiveViewMode, effectiveCompareProjectIdsKey, allProjects, projectId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectId) { router.push("/dashboard"); return; }
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { alert("Solo .csv"); input.value = ""; return; }
    setIsLoading(true);
    
    const anioActual = extraerAnio(projectName);

    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rawRows = results.data as any[];
          if (!rawRows.length) { alert("El CSV está vacío."); return; }
          if (!hasScoreColumn(rawRows)) { alert("Falta la columna de nota."); return; }
          const datosListos = procesarDatosCSV(rawRows, anioActual);
          if (!datosListos.length) { alert("No hay filas válidas."); return; }

          await subirEncuestasBatch(datosListos, projectId);
          alert("¡Actualizado!");
          window.location.reload();
        } catch (err) { console.error(err); alert("Error al subir."); } 
        finally { setIsLoading(false); input.value = ""; }
      },
      error: () => { setIsLoading(false); alert("Error leyendo CSV."); input.value = ""; },
    });
  };

  const handleClearBase = async () => {
    if (!projectId) { router.push("/dashboard"); return; }
    if (!confirm("¿Borrar todo?")) return;
    setIsLoading(true);
    try { await eliminarEncuestasDB(projectId); window.location.reload(); } 
    catch { alert("Error al limpiar."); } 
    finally { setIsLoading(false); }
  };

  const scopedData = useMemo(() => {
    const matchesSchool = (left: string, right: string) => {
      const a = schoolCanonicalKey(left);
      const b = schoolCanonicalKey(right);
      return a.includes(b) || b.includes(a);
    };
    return activeSchool === "Todos los colegios"
      ? encuestas
      : encuestas.filter((r) => matchesSchool(String(r.colegio ?? ""), activeSchool));
  }, [encuestas, activeSchool]);

  const stats = useMemo(() => {
    const schoolData = scopedData;
    const total = schoolData.length;
    const promoters = schoolData.filter((r) => r.score >= 9).length;
    const passives = schoolData.filter((r) => r.score >= 7 && r.score <= 8).length;
    const detractors = schoolData.filter((r) => r.score > 0 && r.score < 7).length;
    const nps = total ? Math.round(((promoters - detractors) / total) * 100) : 0;
    const avg = total ? (schoolData.reduce((a, r) => a + r.score, 0) / total).toFixed(1) : "0.0";
    const riskTotal = schoolData.filter((r) => r.risk).length;
    return { schoolData, total, promoters, passives, detractors, nps, avg, riskTotal };
  }, [scopedData]);

  // Alias explícito para evitar errores de build por referencias legacy (`directorStats`)
  const directorStats = stats;

  const npsComparisonRows = useMemo(() => {
    // IMPORTANTE:
    // Para el NPS comparado no usamos stats.schoolData porque stats ya viene
    // filtrado por el colegio seleccionado. Si Oficina/Admin elige un colegio,
    // necesitamos seguir teniendo todo el proyecto actual para poder armar:
    // - NPS Polo: colegio seleccionado + colegios del mismo polo.
    // - NPS Históricos: años/proyectos vinculados filtrados por ese colegio.
    // Usar encuestas evita que el gráfico quede con una sola barra.
    if (connectedRows.length === 0) return encuestas;
    return [...encuestas, ...connectedRows];
  }, [connectedRows, encuestas]);

  const resolvedOwnPolo = useMemo(() => {
    if (scopedFilters.polo) return scopedFilters.polo;

    // Director usa el colegio asignado. Oficina/Equipo no tienen colegio fijo,
    // así que cuando eligen un colegio usamos ese colegio activo para calcular el polo.
    const schoolForPolo = scopedFilters.colegio || (activeSchool !== "Todos los colegios" ? activeSchool : "");
    if (!schoolForPolo) return undefined;

    const targetSchool = schoolCanonicalKey(schoolForPolo);
    if (!targetSchool) return undefined;

    const matched = npsComparisonRows.find((row) => {
      const rowSchool = schoolCanonicalKey(String(row.colegio ?? ""));
      return rowSchool === targetSchool;
    });

    const polo = String(matched?.polo ?? "").trim();
    return polo || undefined;
  }, [scopedFilters.polo, scopedFilters.colegio, activeSchool, npsComparisonRows]);

  const filteredResponses = useMemo(() => {
    return stats.schoolData
      .filter((r) => {
        const sl = normalize(searchTerm);
        const matchSearch =
          !sl ||
          normalize(r.nombre).includes(sl) ||
          normalize(r.apellido).includes(sl) ||
          normalize(`${r.nombre} ${r.apellido}`).includes(sl) ||
          normalize(r.colegio).includes(sl) ||
          normalize(r.curso).includes(sl) ||
          normalize(r.polo).includes(sl) ||
          normalize(r.positive).includes(sl) ||
          normalize(r.improvement).includes(sl);
        let matchType = true;
        if (filterType === "Promotor") matchType = r.type === "Promotor";
        else if (filterType === "Satisfecho") matchType = r.type === "Satisfecho";
        else if (filterType === "Insatisfecho") matchType = r.type === "Insatisfecho";
        return matchSearch && matchType;
      })
      .sort((a, b) => {
        if (a.riskLevel === "Prioritario" && b.riskLevel !== "Prioritario") return -1;
        if (a.riskLevel !== "Prioritario" && b.riskLevel === "Prioritario") return 1;
        if (a.riskLevel === "Sensible" && b.riskLevel === "Ninguno") return -1;
        if (a.riskLevel === "Ninguno" && b.riskLevel === "Sensible") return 1;
        if (a.sentimentScore !== b.sentimentScore) return b.sentimentScore - a.sentimentScore;
        return a.score - b.score;
      });
  }, [stats.schoolData, searchTerm, filterType]);

  const downloadCSV = () => {
    const headers = ["Fecha", "Nombre", "Apellido", "Colegio", "Curso", "Polo", "Sexo", "Nota", "Perfil", "Aspectos valorados", "Oportunidades de mejora", "Tono", "Tema sensible", "Nivel sensible"];
    const rows = filteredResponses.map((r) => [r.date, r.nombre, r.apellido, r.colegio, r.curso, r.polo, r.sexo, r.score, r.type, `"${r.positive.replace(/"/g, '""')}"`, `"${r.improvement.replace(/"/g, '""')}"`, r.sentiment, r.risk ? "SI" : "NO", r.riskLevel]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Encuestas_${activeSchool.replace(/\s+/g, "_")}_${filterType}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const Header = ({ showBack = true }: { showBack?: boolean }) => (
    <header className={`sticky top-0 z-40 border-b px-4 py-4 shadow-sm backdrop-blur-xl sm:px-6 ${schoolTheme.ring} ${schoolTheme.bg}`}>
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {showBack && (
              <Link href="/dashboard" className="hidden items-center gap-2 rounded-xl border border-white bg-white/60 px-3 py-2 text-sm font-bold text-slate-700 backdrop-blur-xl transition-all hover:bg-white hover:shadow-lg md:flex">
                <ArrowLeft size={18} weight="bold" className="text-blue-700" />
                <span className="hidden sm:inline">Volver</span>
              </Link>
            )}

            <div className="hidden min-h-[52px] items-center rounded-2xl border border-white/80 bg-white/90 px-4 py-2 shadow-sm backdrop-blur-xl sm:flex">
              {audireLogoOk ? (
                <img
                  src="/audire.png"
                  alt="Audire"
                  className="h-11 w-auto max-w-[180px] object-contain"
                  onError={() => setAudireLogoOk(false)}
                />
              ) : (
                <span className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-700">Audire</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeSchool === "Todos los colegios" ? (
                logoOk ? (
                  <img src="/escudo-apdes.png" alt="APDES" className="h-9 w-auto object-contain drop-shadow-sm" onError={() => setLogoOk(false)} />
                ) : (
                  <span className="font-display text-sm font-black text-slate-900">APDES</span>
                )
              ) : (
                logoOk && schoolLogo ? (
                  <img src={schoolLogo} alt={activeSchool} className="h-9 w-auto object-contain drop-shadow-sm" onError={() => setLogoOk(false)} />
                ) : (
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-xs font-black ${schoolTheme.ring} ${schoolTheme.text}`}>
                    {schoolInitials(activeSchool)}
                  </div>
                )
              )}
              <span className={`hidden font-display text-xl font-black tracking-tight sm:block max-w-[400px] truncate ${schoolTheme.text}`}>{headerTitle}</span>
                  <span className="hidden rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 sm:inline-flex">
                    Familias
                  </span>
            </div>
            <div className="hidden h-7 w-px bg-slate-200 sm:block" />
            {canChooseSchool ? (
              <div className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm backdrop-blur-xl ${schoolTheme.ring} ${schoolTheme.bg}`}>
                <div className={`flex h-7 w-7 items-center justify-center ${activeSchool === "Todos los colegios" || !logoOk || !schoolLogo ? `rounded-lg border bg-white text-[10px] font-black ${schoolTheme.ring} ${schoolTheme.text}` : ""}`}>
                  {activeSchool === "Todos los colegios" ? (
                    <ShieldCheck size={14} weight="fill" />
                  ) : logoOk && schoolLogo ? (
                    <img src={schoolLogo} alt={activeSchool} className="h-7 w-7 object-contain" onError={() => setLogoOk(false)} />
                  ) : (
                    schoolInitials(activeSchool)
                  )}
                </div>
                <Buildings size={16} className={`shrink-0 ${schoolTheme.text}`} />
                <select value={activeSchool} onChange={(e) => { setActiveSchool(e.target.value); setCurrentPage(1); }} className="max-w-[160px] cursor-pointer appearance-none truncate bg-transparent pr-7 text-sm font-bold text-blue-900 outline-none sm:max-w-[300px]">
                  {colegiosSurvey.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <CaretDown size={13} weight="bold" className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${schoolTheme.text}`} />
              </div>
            ) : (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-black ${schoolTheme.ring} ${schoolTheme.bg} ${schoolTheme.text}`}>
                <Buildings size={16} />
                <span>{isOffice ? "Oficina central" : isTeam ? "Equipo" : scopedFilters.colegio || (isDirector ? "Colegio asignado por admin" : activeSchool)}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setIsMenuOpen(true)} className="relative flex items-center gap-2 rounded-xl border border-white bg-white/60 px-3 py-2 text-sm font-bold text-slate-700 backdrop-blur-xl transition-all hover:bg-white hover:shadow-lg">
              <DotsThreeOutlineVertical size={18} weight="bold" className="text-blue-700" />
              <span className="hidden sm:inline">Menú</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className={`flex h-14 w-14 items-center justify-center rounded-full border-4 bg-white p-1 shadow-md transition-all hover:scale-[1.02] ${schoolTheme.ring}`}
                aria-label="Abrir menú de sesión"
              >
                <img
                  src={activeSchool === "Todos los colegios" ? "/escudo-apdes.png" : (schoolLogo || "/escudo-apdes.png")}
                  alt="Escudo de sesión"
                  className="h-10 w-10 object-contain"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src.endsWith("/escudo-apdes.png")) return;
                    img.src = "/escudo-apdes.png";
                  }}
                />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white bg-white/95 p-2 shadow-2xl backdrop-blur-xl">
                  <SignOutButton>
                    <button className="flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-slate-800">
                      Cerrar sesión
                    </button>
                  </SignOutButton>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="md:hidden">
            <Link href="/dashboard" className="flex w-full items-center justify-center gap-2 rounded-xl border border-white bg-white/60 px-4 py-2.5 text-sm font-bold text-slate-700 backdrop-blur-xl transition-all hover:bg-white">
              <ArrowLeft size={18} weight="bold" className="text-blue-700" /> Volver al Hub
            </Link>
          </div>
          {canSwitchView ? (
            <ViewModeSwitch viewMode={viewMode} setViewMode={setViewMode} />
          ) : (
            <div className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">
              {isOffice ? "Perfil Oficina central" : isDirector ? "Perfil Dirección" : "Perfil Equipo"}
            </div>
          )}
        </div>
      </div>
    </header>
  );

  if (!projectId) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-[32px] border border-white bg-white/80 p-10 shadow-2xl backdrop-blur-xl text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-6 shadow-inner">
            <Folder size={32} weight="duotone" />
          </div>
          <h1 className="font-display text-3xl font-black text-slate-900 mb-3 tracking-tight">Sin proyecto activo</h1>
          <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
            Selecciona una encuesta desde el Hub Principal para comenzar el análisis.
          </p>
          <Link href="/dashboard" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-[15px] font-black text-white transition-all hover:bg-blue-700 active:scale-95">
            <ArrowLeft size={18} weight="bold" /> Regresar al Hub
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <SurveysFallback />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F4F7FB] pb-12 font-sans">
      <Header />
      <main className="mx-auto mt-8 w-full max-w-[1600px] px-6">
        {effectiveViewMode === "director" ? (
          <DirectorDashboard
            stats={directorStats}
            filteredResponses={effectiveViewMode === "director" ? directorStats.schoolData : filteredResponses}
            directorCommentLimit={directorCommentLimit}
            setDirectorCommentLimit={setDirectorCommentLimit}
            directorTopic={directorTopic}
            setDirectorTopic={setDirectorTopic}
            activeSchool={activeSchool}
            regionalRows={npsComparisonRows}
            fixedPolo={scopedFilters.polo}
            userId={user?.id}
            canEditThemes={isAdmin}
            projectId={projectId}
            currentProjectName={projectName}
            ownSchool={isOffice || isTeam ? undefined : scopedFilters.colegio}
            ownPolo={resolvedOwnPolo}
            allowedCompareProjectIds={effectiveCompareProjectIds}
            npsLoading={connectedRowsLoading}
          />
        ) : (
          <TeamDashboard 
            stats={stats}
            filteredResponses={filteredResponses}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterType={filterType}
            setFilterType={setFilterType}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            downloadCSV={downloadCSV}
            projectId={projectId}
            activeSchool={activeSchool}
            canEditConfig={isAdmin}
            anonymizePeople={isOffice}
          />
        )}
      </main>

      {/* Menú lateral */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto border-l border-white bg-white/90 p-6 shadow-2xl backdrop-blur-2xl">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">APDES</p>
                <h3 className="font-display text-2xl font-black text-slate-900">Menú de Gestión</h3>
              </div>
              <button onClick={() => setIsMenuOpen(false)} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 shadow-sm"><X size={15} weight="bold" /> Cerrar</button>
            </div>
            
            <Link href="/dashboard" onClick={() => setIsMenuOpen(false)} className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white p-4 text-sm font-black shadow-md shadow-blue-500/30 transition-all hover:bg-blue-700 active:scale-95"><ArrowLeft size={18} weight="bold" /> Volver al Hub Principal</Link>
            
            {isAdmin && (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div><h4 className="text-sm font-black text-slate-900">Añadir Respuestas (CSV)</h4></div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95 hover:bg-emerald-700 shadow-sm shadow-emerald-500/30"><UploadSimple size={16} weight="bold" /> Subir archivo <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" /></label>
                </div>
              </div>
            )}

            <div className={`mb-4 grid gap-3 ${isDirector || isOffice ? "grid-cols-1" : "grid-cols-2"}`}>
              <Link href={`/dashboard/analytics?projectId=${projectId}`} onClick={() => setIsMenuOpen(false)} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200"><ChartBar size={24} weight="fill" className="text-indigo-500" /> Analítica Avanzada</Link>
              {!isDirector && !isOffice && (
                <Link href={`/dashboard/reports?projectId=${projectId}`} onClick={() => setIsMenuOpen(false)} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-red-600 hover:border-red-200"><FilePdf size={24} weight="fill" className="text-red-500" /> Generar Informes</Link>
              )}
            </div>

            {canSwitchView && (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-black text-slate-900 mb-3">Perspectiva de Lectura</h4>
                <ViewModeSwitch viewMode={viewMode} setViewMode={setViewMode} />
              </div>
            )}

            {isAdmin && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-black text-slate-900">Exportación de Datos</h4>
                <button onClick={downloadCSV} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800 shadow-md active:scale-95"><DownloadSimple size={16} weight="bold" /> Descargar Excel (CSV)</button>
              </div>
            )}

            {isAdmin && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h4 className="text-sm font-black text-red-700">Zona de Peligro</h4></div>
                  <button onClick={handleClearBase} className="flex items-center gap-2 rounded-xl bg-white border border-red-200 px-4 py-2 text-xs font-bold text-red-600 transition-all active:scale-95 hover:bg-red-100"><Trash size={16} weight="bold" /> Purgar Datos</button>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <h4 className="text-sm font-black text-indigo-700 mb-2">Conectar proyectos del mismo polo</h4>
                <p className="text-xs font-semibold text-indigo-600 mb-3">Solo admin ve esto. Dirección hereda la comparación en NPS por polo.</p>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl bg-white p-3 border border-indigo-100">
                  {allProjects.filter((p) => p.id !== projectId).map((p) => {
                    const checked = connectedProjectIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setConnectedProjectIds((prev) => {
                              const next = e.target.checked ? [...new Set([...prev, p.id])] : prev.filter((id) => id !== p.id);
                              if (typeof window !== "undefined") {
                                window.sessionStorage.setItem(`project-links:${projectId}`, JSON.stringify(next));
                              }
                              return next;
                            });
                          }}
                        />
                        <span>{p.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
