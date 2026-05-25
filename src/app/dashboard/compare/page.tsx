"use client";

import { useEffect, useMemo, useState, Suspense } from "react"; // ✅ Importamos Suspense
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChartBar,
  CaretUp,
  CaretDown,
  Minus,
  Folder,
  DotsThreeCircle,
  UsersThree,
  Star,
  TrendUp,
  TrendDown,
  ArrowsLeftRight,
  Warning,
} from "phosphor-react";
import { UserButton } from "@clerk/nextjs";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { listarProyectosDB, compararProyectosDB, obtenerEncuestasDB } from "../../actions";

// ─── Types ──────────────────────────────────────────────────────────────────
type Project = { id: string; nombre: string; descripcion: string | null; creado_at: string };

type ProjectStats = {
  projectId: string;
  nombre: string;
  total: number;
  avg: number;
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  participationRate: number;
  topTags: { tag: string; count: number }[];
  bySchool: { colegio: string; avg: number; total: number; nps: number }[];
};

type SurveyRowLite = {
  id?: string;
  colegio?: string;
  curso?: string;
  polo?: string;
  score?: number;
  tags?: string[] | string | null;
};

type CompareMode = "proyectos" | "polos";

const extractProjectYear = (name?: string | null) => {
  const match = String(name ?? "").match(/\b(20\d{2})\b/);
  return match ? match[1] : "";
};

const projectKindRank = (name?: string | null) => {
  const n = normalizeText(String(name ?? ""));
  if (n.includes("varon")) return 1;
  if (n.includes("mujer")) return 2;
  if (n.includes("jardin") || n.includes("jardín")) return 3;
  return 9;
};

const projectKindLabel = (name?: string | null) => {
  const n = normalizeText(String(name ?? ""));
  if (n.includes("varon")) return "Varones";
  if (n.includes("mujer")) return "Mujeres";
  if (n.includes("jardin") || n.includes("jardín")) return "Jardines";
  return "Proyecto";
};


const normalizeText = (value?: string | null) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const parseTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .replace(/[{}]/g, "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
};

const getSessionCache = <T,>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const setSessionCache = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache opcional. Si se llena o falla, no rompemos la página.
  }
};

const calcStatsFromRows = (rows: SurveyRowLite[], projectId: string, nombre: string): ProjectStats => {
  const validRows = rows.filter((row) => Number(row.score || 0) > 0);
  const total = validRows.length;
  const avg = total ? validRows.reduce((acc, row) => acc + Number(row.score || 0), 0) / total : 0;
  const promoters = validRows.filter((row) => Number(row.score || 0) >= 9).length;
  const passives = validRows.filter((row) => {
    const score = Number(row.score || 0);
    return score >= 7 && score <= 8;
  }).length;
  const detractors = validRows.filter((row) => {
    const score = Number(row.score || 0);
    return score > 0 && score <= 6;
  }).length;
  const nps = total ? Math.round(((promoters - detractors) / total) * 100) : 0;

  const tagCount = new Map<string, number>();
  validRows.forEach((row) => {
    parseTags(row.tags).forEach((tag) => {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    });
  });

  const schoolMap = new Map<string, { scores: number[]; total: number }>();
  validRows.forEach((row) => {
    const colegio = String(row.colegio || "Sin colegio");
    const score = Number(row.score || 0);
    const current = schoolMap.get(colegio) || { scores: [], total: 0 };
    current.total += 1;
    if (score > 0) current.scores.push(score);
    schoolMap.set(colegio, current);
  });

  const bySchool = Array.from(schoolMap.entries())
    .map(([colegio, data]) => {
      const totalSchool = data.scores.length;
      const schoolAvg = totalSchool ? data.scores.reduce((a, b) => a + b, 0) / totalSchool : 0;
      const schoolPromoters = data.scores.filter((score) => score >= 9).length;
      const schoolDetractors = data.scores.filter((score) => score > 0 && score <= 6).length;
      const schoolNps = totalSchool ? Math.round(((schoolPromoters - schoolDetractors) / totalSchool) * 100) : 0;
      return { colegio, avg: Number(schoolAvg.toFixed(2)), total: data.total, nps: schoolNps };
    })
    .sort((a, b) => b.total - a.total);

  return {
    projectId,
    nombre,
    total,
    avg: Number(avg.toFixed(2)),
    nps,
    promoters,
    passives,
    detractors,
    participationRate: 0,
    topTags: Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    bySchool,
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Delta({ a, b, invert = false }: { a: number; b: number; invert?: boolean }) {
  const diff = a - b;
  if (diff === 0) return <span className="flex items-center gap-0.5 text-slate-400 text-xs font-bold"><Minus size={12} /> Igual</span>;
  const positive = invert ? diff < 0 : diff > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? <CaretUp size={12} weight="fill" /> : <CaretDown size={12} weight="fill" />}
      {Math.abs(diff).toFixed(1)}
    </span>
  );
}

function StatCard({
  label,
  valA,
  valB,
  format = (v: number) => v.toFixed(1),
  invert = false,
  icon,
}: {
  label: string;
  valA: number;
  valB: number;
  format?: (v: number) => string;
  invert?: boolean;
  icon: React.ReactNode;
}) {
  const winner = valA > valB ? "A" : valA < valB ? "B" : "tie";
  return (
    <div className="rounded-[24px] border border-white bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/50 p-5">
      <div className="flex items-center gap-2 mb-4 text-slate-500">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col items-start">
          <span className={`text-3xl font-black font-display tracking-tight ${winner === "A" ? "text-blue-700" : "text-slate-500"}`}>
            {format(valA)}
          </span>
          {winner === "A" && (
            <span className="mt-1 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Líder</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <Delta a={valA} b={valB} invert={invert} />
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">vs</span>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-3xl font-black font-display tracking-tight ${winner === "B" ? "text-indigo-700" : "text-slate-500"}`}>
            {format(valB)}
          </span>
          {winner === "B" && (
            <span className="mt-1 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Líder</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper de Suspense (Solución al Error de Vercel) ────────────────────────
export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] font-sans">
        <div className="flex flex-col items-center gap-4 text-blue-600">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <h2 className="font-bold text-slate-700">Cargando comparador...</h2>
        </div>
      </div>
    }>
      <CompareDashboardLive />
    </Suspense>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
function CompareDashboardLive() {
  const searchParams = useSearchParams();
  const preA = searchParams.get("a") ?? "";
  const preB = searchParams.get("b") ?? "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedA, setSelectedA] = useState(preA);
  const [selectedB, setSelectedB] = useState(preB);
  const [stats, setStats] = useState<{ a: ProjectStats; b: ProjectStats } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [compareMode, setCompareMode] = useState<CompareMode>("proyectos");

  // Comparación por polos: se hace por AÑO y agrupa los proyectos del mismo año
  // (Varones + Mujeres + Jardines). Así un polo se compara contra otro polo completo.
  const [selectedPoloYear, setSelectedPoloYear] = useState("");
  const [poloRows, setPoloRows] = useState<SurveyRowLite[]>([]);
  const [loadedPoloYear, setLoadedPoloYear] = useState("");
  const [loadedYearProjectNames, setLoadedYearProjectNames] = useState<string[]>([]);
  const [poloA, setPoloA] = useState("");
  const [poloB, setPoloB] = useState("");
  const [loadingPoloRows, setLoadingPoloRows] = useState(false);

  // Cargar lista de proyectos
  useEffect(() => {
    (async () => {
      try {
        const data = await listarProyectosDB();
        const lista = Array.isArray(data) ? (data as Project[]) : ((data as any).rows || []);
        setProjects(lista);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  // Comparar automáticamente si vienen params en la URL
  useEffect(() => {
    if (preA && preB) handleCompare(preA, preB);
  }, []);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(projects.map((project) => extractProjectYear(project.nombre)).filter(Boolean))
    );
    return years.sort((a, b) => Number(b) - Number(a));
  }, [projects]);

  useEffect(() => {
    if (selectedPoloYear || yearOptions.length === 0) return;
    const preYear = extractProjectYear(projects.find((project) => project.id === preA)?.nombre || "");
    setSelectedPoloYear(preYear || yearOptions[0]);
  }, [preA, projects, selectedPoloYear, yearOptions]);

  const projectsForYear = useMemo(() => {
    if (!selectedPoloYear) return [] as Project[];
    return projects
      .filter((project) => extractProjectYear(project.nombre) === selectedPoloYear)
      .sort((a, b) => {
        const rank = projectKindRank(a.nombre) - projectKindRank(b.nombre);
        if (rank !== 0) return rank;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [projects, selectedPoloYear]);

  const handleCompare = async (a = selectedA, b = selectedB) => {
    if (!a || !b || a === b) return;
    setLoading(true);
    setStats(null);
    try {
      const result = await compararProyectosDB(a, b);
      setStats(result as any);
    } catch (e) {
      alert("No se pudo obtener la comparación.");
    } finally {
      setLoading(false);
    }
  };

  const loadRowsForProject = async (project: Project) => {
    const cacheKey = `apdes:compare:rows:${project.id}`;
    const cached = getSessionCache<SurveyRowLite[]>(cacheKey);
    if (cached) return cached;

    const data = await obtenerEncuestasDB(project.id);
    const rows = (Array.isArray(data) ? data : ((data as any)?.rows || [])) as SurveyRowLite[];
    setSessionCache(cacheKey, rows);
    return rows;
  };

  const loadPoloRowsForYear = async (year = selectedPoloYear) => {
    if (!year) return [] as SurveyRowLite[];

    const yearProjects = projects
      .filter((project) => extractProjectYear(project.nombre) === year)
      .sort((a, b) => {
        const rank = projectKindRank(a.nombre) - projectKindRank(b.nombre);
        if (rank !== 0) return rank;
        return a.nombre.localeCompare(b.nombre);
      });

    if (yearProjects.length === 0) {
      setPoloRows([]);
      setLoadedPoloYear(year);
      setLoadedYearProjectNames([]);
      return [] as SurveyRowLite[];
    }

    const cacheKey = `apdes:compare:polo-year:${year}:${yearProjects.map((project) => project.id).join(",")}`;
    const cached = getSessionCache<SurveyRowLite[]>(cacheKey);
    if (cached) {
      setPoloRows(cached);
      setLoadedPoloYear(year);
      setLoadedYearProjectNames(yearProjects.map((project) => project.nombre));
      return cached;
    }

    setLoadingPoloRows(true);
    try {
      // Como máximo debería leer Varones, Mujeres y Jardines del año elegido.
      // Después todo se calcula en cliente y queda cacheado en sessionStorage.
      const groupedRows = await Promise.all(
        yearProjects.map(async (project) => {
          const rows = await loadRowsForProject(project);
          return rows.map((row) => ({
            ...row,
            // No se muestra, pero ayuda a distinguir internamente de dónde vino.
            curso: row.curso,
          }));
        })
      );

      const rows = groupedRows.flat();
      setPoloRows(rows);
      setLoadedPoloYear(year);
      setLoadedYearProjectNames(yearProjects.map((project) => project.nombre));
      setSessionCache(cacheKey, rows);
      return rows;
    } catch {
      alert("No se pudieron cargar los datos del año seleccionado.");
      setPoloRows([]);
      setLoadedPoloYear("");
      setLoadedYearProjectNames([]);
      return [] as SurveyRowLite[];
    } finally {
      setLoadingPoloRows(false);
    }
  };

  const availablePolos = useMemo(() => {
    return Array.from(
      new Set(
        poloRows
          .map((row) => String(row.polo || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [poloRows]);

  const handlePoloYearChange = async (year: string) => {
    setSelectedPoloYear(year);
    setPoloRows([]);
    setLoadedPoloYear("");
    setLoadedYearProjectNames([]);
    setPoloA("");
    setPoloB("");
    setStats(null);

    if (!year) return;
    await loadPoloRowsForYear(year);
  };

  const handleComparePolos = async () => {
    if (!selectedPoloYear || !poloA || !poloB || poloA === poloB) return;

    setLoading(true);
    setStats(null);

    try {
      const rows =
        poloRows.length > 0 && loadedPoloYear === selectedPoloYear
          ? poloRows
          : await loadPoloRowsForYear(selectedPoloYear);

      const rowsA = rows.filter((row) => normalizeText(row.polo) === normalizeText(poloA));
      const rowsB = rows.filter((row) => normalizeText(row.polo) === normalizeText(poloB));

      setStats({
        a: calcStatsFromRows(rowsA, `polo-${selectedPoloYear}-a`, `${poloA} · Año ${selectedPoloYear}`),
        b: calcStatsFromRows(rowsB, `polo-${selectedPoloYear}-b`, `${poloB} · Año ${selectedPoloYear}`),
      });
    } catch {
      alert("No se pudo comparar los polos.");
    } finally {
      setLoading(false);
    }
  };

  const projA = projects.find((p) => p.id === selectedA);
  const projB = projects.find((p) => p.id === selectedB);

  // Color tokens
  const colorA = "#2563EB";
  const colorB = "#7C3AED";

  return (
    <div className="min-h-screen bg-[#F4F7FB] pb-16 font-sans overflow-x-hidden text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white bg-white/70 px-6 py-4 backdrop-blur-xl shadow-sm shadow-blue-900/5">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
              <ArrowLeft size={18} weight="bold" />
              Dashboard
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <ArrowsLeftRight size={16} weight="bold" />
              </div>
              <span className="font-black text-slate-900 tracking-tight">Comparador</span>
            </div>
          </div>
          <div className="flex items-center justify-center p-1 rounded-full border-2 border-blue-100 bg-white shadow-sm">
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto mt-10 w-full max-w-[1400px] px-6 space-y-8">

        {/* Selector */}
        <div className="rounded-[32px] border border-white bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/50 p-6 md:p-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-black tracking-tight text-slate-900 mb-1">
                {compareMode === "proyectos" ? "Comparar proyectos" : "Comparar polos"}
              </h2>
              <p className="text-sm font-medium text-slate-500">
                {compareMode === "proyectos"
                  ? "Elegí dos campañas o colegios para ver las diferencias lado a lado."
                  : "Elegí un año y compará polos completos agrupando Varones, Mujeres y Jardines."}
              </p>
            </div>

            <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => {
                  setCompareMode("proyectos");
                  setStats(null);
                }}
                className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
                  compareMode === "proyectos" ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                Proyectos
              </button>
              <button
                onClick={() => {
                  setCompareMode("polos");
                  setStats(null);
                }}
                className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
                  compareMode === "polos" ? "bg-indigo-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                Polos
              </button>
            </div>
          </div>

          {compareMode === "proyectos" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-4 items-end">
                {/* Proyecto A */}
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-blue-600">Proyecto A</label>
                  <select
                    value={selectedA}
                    onChange={(e) => setSelectedA(e.target.value)}
                    disabled={loadingProjects}
                    className="w-full rounded-2xl border-2 border-blue-100 bg-white px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none"
                  >
                    <option value="">— Elegí un proyecto —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === selectedB}>{p.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* VS badge */}
                <div className="flex items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 font-black text-sm">VS</div>
                </div>

                {/* Proyecto B */}
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-indigo-600">Proyecto B</label>
                  <select
                    value={selectedB}
                    onChange={(e) => setSelectedB(e.target.value)}
                    disabled={loadingProjects}
                    className="w-full rounded-2xl border-2 border-indigo-100 bg-white px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none"
                  >
                    <option value="">— Elegí un proyecto —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.id === selectedA}>{p.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Botón */}
                <button
                  onClick={() => handleCompare()}
                  disabled={!selectedA || !selectedB || selectedA === selectedB || loading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-black text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>Comparar <ArrowRight size={16} weight="bold" /></>
                  )}
                </button>
              </div>

              {selectedA && selectedA === selectedB && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-600">
                  <Warning size={14} weight="fill" /> Elegí dos proyectos distintos.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1fr_1fr_auto] gap-4 items-end">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-600">Año</label>
                  <select
                    value={selectedPoloYear}
                    onChange={(e) => handlePoloYearChange(e.target.value)}
                    disabled={loadingProjects || loadingPoloRows}
                    className="w-full rounded-2xl border-2 border-slate-100 bg-white px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none"
                  >
                    <option value="">— Elegí un año —</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>Año {year}</option>
                    ))}
                  </select>
                  {loadingPoloRows && (
                    <p className="mt-2 text-[11px] font-black uppercase tracking-widest text-indigo-500">Cargando proyectos del año...</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-blue-600">Polo A</label>
                  <select
                    value={poloA}
                    onFocus={() => {
                      if (selectedPoloYear && loadedPoloYear !== selectedPoloYear && !loadingPoloRows) {
                        loadPoloRowsForYear(selectedPoloYear);
                      }
                    }}
                    onChange={(e) => setPoloA(e.target.value)}
                    disabled={!selectedPoloYear || loadingPoloRows || availablePolos.length === 0}
                    className="w-full rounded-2xl border-2 border-blue-100 bg-white px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none disabled:opacity-50"
                  >
                    <option value="">— Elegí un polo —</option>
                    {availablePolos.map((polo) => (
                      <option key={polo} value={polo} disabled={polo === poloB}>{polo}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-indigo-600">Polo B</label>
                  <select
                    value={poloB}
                    onFocus={() => {
                      if (selectedPoloYear && loadedPoloYear !== selectedPoloYear && !loadingPoloRows) {
                        loadPoloRowsForYear(selectedPoloYear);
                      }
                    }}
                    onChange={(e) => setPoloB(e.target.value)}
                    disabled={!selectedPoloYear || loadingPoloRows || availablePolos.length === 0}
                    className="w-full rounded-2xl border-2 border-indigo-100 bg-white px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none disabled:opacity-50"
                  >
                    <option value="">— Elegí un polo —</option>
                    {availablePolos.map((polo) => (
                      <option key={polo} value={polo} disabled={polo === poloA}>{polo}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleComparePolos}
                  disabled={!selectedPoloYear || !poloA || !poloB || poloA === poloB || loading || loadingPoloRows}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3.5 text-sm font-black text-white transition-all hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>Comparar polos <ArrowRight size={16} weight="bold" /></>
                  )}
                </button>
              </div>

              {selectedPoloYear && !loadingPoloRows && projectsForYear.length === 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-600">
                  <Warning size={14} weight="fill" /> No encontré proyectos para el año seleccionado.
                </p>
              )}

              {selectedPoloYear && !loadingPoloRows && loadedPoloYear === selectedPoloYear && availablePolos.length < 2 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-600">
                  <Warning size={14} weight="fill" /> Este año no tiene al menos dos polos para comparar.
                </p>
              )}

              {selectedPoloYear && projectsForYear.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-bold text-slate-400">
                    Año seleccionado: <span className="text-slate-600">{selectedPoloYear}</span> · {projectsForYear.length} proyectos detectados.
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">
                    Se agrupan las respuestas del mismo año:{" "}
                    <span className="text-slate-600">
                      {(loadedYearProjectNames.length > 0 ? loadedYearProjectNames : projectsForYear.map((project) => project.nombre)).join(" · ")}
                    </span>
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex h-64 w-full items-center justify-center rounded-[32px] border border-white bg-white/40 backdrop-blur-xl shadow-lg">
            <div className="flex flex-col items-center gap-4 text-blue-600">
              <DotsThreeCircle size={48} className="animate-pulse" weight="fill" />
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{compareMode === "polos" ? "Analizando polos..." : "Analizando proyectos..."}</p>
            </div>
          </div>
        )}

        {/* Resultados */}
        {stats && !loading && (
          <div className="space-y-6">

            {/* Títulos de proyectos */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { s: stats.a, color: "blue", border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", label: "A" },
                { s: stats.b, color: "indigo", border: "border-indigo-200", bg: "bg-indigo-50", text: "text-indigo-700", label: "B" },
              ].map(({ s, border, bg, text, label }) => (
                <div key={label} className={`flex items-center gap-3 rounded-[24px] border-2 ${border} ${bg} px-5 py-4`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${text} border ${border}`}>
                    <Folder size={20} weight="fill" />
                  </div>
                  <div>
                    <p className={`text-xs font-black uppercase tracking-widest ${text} opacity-70`}>{compareMode === "polos" ? "Polo" : "Proyecto"} {label}</p>
                    <p className={`font-display text-lg font-black tracking-tight ${text}`}>{s.nombre}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* KPIs principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="NPS"
                valA={stats.a.nps}
                valB={stats.b.nps}
                format={(v) => `${v}`}
                icon={<TrendUp size={16} weight="bold" />}
              />
              <StatCard
                label="Promedio"
                valA={stats.a.avg}
                valB={stats.b.avg}
                format={(v) => v.toFixed(2)}
                icon={<Star size={16} weight="bold" />}
              />
              <StatCard
                label="Respuestas"
                valA={stats.a.total}
                valB={stats.b.total}
                format={(v) => `${v}`}
                icon={<UsersThree size={16} weight="bold" />}
              />
              <StatCard
                label="Promotores %"
                valA={stats.a.total ? Math.round((stats.a.promoters / stats.a.total) * 100) : 0}
                valB={stats.b.total ? Math.round((stats.b.promoters / stats.b.total) * 100) : 0}
                format={(v) => `${v}%`}
                icon={<ChartBar size={16} weight="bold" />}
              />
            </div>

            {/* Distribución NPS + Tags */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Distribución de respuestas */}
              <div className="rounded-[28px] border border-white bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/50 p-6">
                <h3 className="font-display text-lg font-black tracking-tight text-slate-900 mb-1">Distribución NPS</h3>
                <p className="text-xs font-medium text-slate-400 mb-5">Promotores · Pasivos · Detractores</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      {
                        name: "Promotores",
                        A: stats.a.total ? Math.round((stats.a.promoters / stats.a.total) * 100) : 0,
                        B: stats.b.total ? Math.round((stats.b.promoters / stats.b.total) * 100) : 0,
                      },
                      {
                        name: "Pasivos",
                        A: stats.a.total ? Math.round((stats.a.passives / stats.a.total) * 100) : 0,
                        B: stats.b.total ? Math.round((stats.b.passives / stats.b.total) * 100) : 0,
                      },
                      {
                        name: "Detractores",
                        A: stats.a.total ? Math.round((stats.a.detractors / stats.a.total) * 100) : 0,
                        B: stats.b.total ? Math.round((stats.b.detractors / stats.b.total) * 100) : 0,
                      },
                    ]}
                    barSize={20}
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", fontSize: 12, fontWeight: 700 }}
                      formatter={(v: any) => [`${v}%`]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 8 }} />
                    <Bar dataKey="A" name={stats.a.nombre} fill={colorA} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="B" name={stats.b.nombre} fill={colorB} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Tags comparado */}
              <div className="rounded-[28px] border border-white bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/50 p-6">
                <h3 className="font-display text-lg font-black tracking-tight text-slate-900 mb-1">Temas más mencionados</h3>
                <p className="text-xs font-medium text-slate-400 mb-5">Top tags por proyecto</p>
                <div className="space-y-3">
                  {Array.from(
                    new Set([
                      ...stats.a.topTags.slice(0, 5).map((t) => t.tag),
                      ...stats.b.topTags.slice(0, 5).map((t) => t.tag),
                    ])
                  )
                    .slice(0, 6)
                    .map((tag) => {
                      const cA = stats.a.topTags.find((t) => t.tag === tag)?.count ?? 0;
                      const cB = stats.b.topTags.find((t) => t.tag === tag)?.count ?? 0;
                      const maxVal = Math.max(cA, cB, 1);
                      return (
                        <div key={tag} className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-xs font-bold text-slate-600">{tag}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-blue-600">{cA}</span>
                              <span className="text-xs text-slate-300">|</span>
                              <span className="text-xs font-black text-indigo-600">{cB}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 h-2">
                            <div
                              className="rounded-full transition-all"
                              style={{ width: `${(cA / maxVal) * 50}%`, backgroundColor: colorA, minWidth: cA > 0 ? 4 : 0 }}
                            />
                            <div
                              className="rounded-full transition-all"
                              style={{ width: `${(cB / maxVal) * 50}%`, backgroundColor: colorB, minWidth: cB > 0 ? 4 : 0 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="mt-4 flex gap-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorA }} /><span className="text-xs font-bold text-slate-500">{stats.a.nombre}</span></div>
                  <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorB }} /><span className="text-xs font-bold text-slate-500">{stats.b.nombre}</span></div>
                </div>
              </div>
            </div>

            {/* Comparación por colegio */}
            {(stats.a.bySchool.length > 0 || stats.b.bySchool.length > 0) && (
              <div className="rounded-[28px] border border-white bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/50 p-6">
                <h3 className="font-display text-lg font-black tracking-tight text-slate-900 mb-1">Promedio por colegio</h3>
                <p className="text-xs font-medium text-slate-400 mb-5">{compareMode === "polos" ? "Colegios incluidos dentro de cada polo." : "Rendimiento de cada sede en ambos proyectos."}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-3 text-left text-xs font-black uppercase tracking-widest text-slate-400">Colegio</th>
                        <th className="pb-3 text-center text-xs font-black uppercase tracking-widest text-blue-500">Prom. A</th>
                        <th className="pb-3 text-center text-xs font-black uppercase tracking-widest text-indigo-500">Prom. B</th>
                        <th className="pb-3 text-center text-xs font-black uppercase tracking-widest text-slate-400">Diferencia</th>
                        <th className="pb-3 text-center text-xs font-black uppercase tracking-widest text-slate-400">Resp. A</th>
                        <th className="pb-3 text-center text-xs font-black uppercase tracking-widest text-slate-400">Resp. B</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {Array.from(
                        new Set([
                          ...stats.a.bySchool.map((s) => s.colegio),
                          ...stats.b.bySchool.map((s) => s.colegio),
                        ])
                      ).map((colegio) => {
                        const sA = stats.a.bySchool.find((s) => s.colegio === colegio);
                        const sB = stats.b.bySchool.find((s) => s.colegio === colegio);
                        const diff = (sA?.avg ?? 0) - (sB?.avg ?? 0);
                        return (
                          <tr key={colegio} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 text-sm font-bold text-slate-700">{colegio}</td>
                            <td className="py-3 text-center">
                              {sA ? <span className="font-black text-blue-700">{sA.avg.toFixed(2)}</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-3 text-center">
                              {sB ? <span className="font-black text-indigo-700">{sB.avg.toFixed(2)}</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-3 text-center">
                              {sA && sB ? (
                                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-black ${diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}>
                                  {diff > 0 ? <TrendUp size={10} weight="fill" /> : diff < 0 ? <TrendDown size={10} weight="fill" /> : <Minus size={10} />}
                                  {diff === 0 ? "Igual" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="py-3 text-center text-xs font-bold text-slate-400">{sA?.total ?? "—"}</td>
                            <td className="py-3 text-center text-xs font-bold text-slate-400">{sB?.total ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Resumen ejecutivo */}
            <div className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
              <h3 className="font-display text-lg font-black tracking-tight text-slate-900 mb-4">Resumen ejecutivo</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-2xl bg-white/70 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-blue-600 mb-2">{stats.a.nombre}</p>
                  <ul className="space-y-1 text-slate-600 font-medium">
                    <li>• <span className="font-black text-slate-800">{stats.a.total}</span> respuestas registradas</li>
                    <li>• Promedio de satisfacción: <span className="font-black text-slate-800">{stats.a.avg.toFixed(2)}</span></li>
                    <li>• NPS: <span className={`font-black ${stats.a.nps >= 0 ? "text-emerald-700" : "text-red-600"}`}>{stats.a.nps}</span></li>
                    <li>• Promotores: <span className="font-black text-slate-800">{stats.a.promoters}</span> ({stats.a.total ? Math.round((stats.a.promoters / stats.a.total) * 100) : 0}%)</li>
                  </ul>
                </div>
                <div className="rounded-2xl bg-white/70 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-2">{stats.b.nombre}</p>
                  <ul className="space-y-1 text-slate-600 font-medium">
                    <li>• <span className="font-black text-slate-800">{stats.b.total}</span> respuestas registradas</li>
                    <li>• Promedio de satisfacción: <span className="font-black text-slate-800">{stats.b.avg.toFixed(2)}</span></li>
                    <li>• NPS: <span className={`font-black ${stats.b.nps >= 0 ? "text-emerald-700" : "text-red-600"}`}>{stats.b.nps}</span></li>
                    <li>• Promotores: <span className="font-black text-slate-800">{stats.b.promoters}</span> ({stats.b.total ? Math.round((stats.b.promoters / stats.b.total) * 100) : 0}%)</li>
                  </ul>
                </div>
              </div>
              {/* Conclusión automática */}
              <div className="mt-4 rounded-2xl bg-white/70 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Conclusión</p>
                <p className="text-sm font-medium text-slate-700 leading-relaxed">
                  {stats.a.nps > stats.b.nps
                    ? `"${stats.a.nombre}" supera en NPS por ${stats.a.nps - stats.b.nps} puntos. `
                    : stats.b.nps > stats.a.nps
                    ? `"${stats.b.nombre}" supera en NPS por ${stats.b.nps - stats.a.nps} puntos. `
                    : "Ambos proyectos tienen el mismo NPS. "}
                  {stats.a.avg > stats.b.avg
                    ? `El promedio de satisfacción es mayor en "${stats.a.nombre}" (+${(stats.a.avg - stats.b.avg).toFixed(2)} puntos).`
                    : stats.b.avg > stats.a.avg
                    ? `El promedio de satisfacción es mayor en "${stats.b.nombre}" (+${(stats.b.avg - stats.a.avg).toFixed(2)} puntos).`
                    : "Los promedios de satisfacción son iguales."}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}