// src/app/dashboard/reports/page.tsx
"use client";

import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  Buildings,
  CircleNotch,
  FilePdf,
  MagicWand,
  Printer,
  SlidersHorizontal,
  Info,
  ChatCircleText,
  ThumbsUp,
  Lightning,
  CaretDown,
  X,
  WarningOctagon,
  Sparkle,
  Hash,
} from "phosphor-react";
import ReactMarkdown from "react-markdown";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import { obtenerEncuestasDB } from "../../actions";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const normalize = (str?: string | null) =>
  str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type Survey = {
  id?: string;
  colegio?: string;
  curso?: string;
  polo?: string;
  score?: number | string;
  type?: string;
  positive?: string;
  improvement?: string;
  sentiment?: string;
  nombre?: string;
  apellido?: string;
};

type ChartDataItem = { name: string; value: number; fill: string };

// ─────────────────────────────────────────────
// GRÁFICO DE PERFILES
// ─────────────────────────────────────────────
function ProfileChart({ data }: { data: ChartDataItem[] }) {
  if (!data?.length) return null;
  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={55}
            paddingAngle={2} dataKey="value" isAnimationActive={false}>
            {data.map((e, i) => <Cell key={i} fill={e.fill} stroke="white" strokeWidth={2} />)}
          </Pie>
          <Legend verticalAlign="bottom" height={28} iconType="circle"
            wrapperStyle={{ fontSize: "10px", fontWeight: "bold", color: "#64748B" }} />
          <Tooltip contentStyle={{ borderRadius: "10px", border: "none", fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Gráfico de distribución de notas
function ScoreChart({ data }: { data: { score: number; count: number; fill: string }[] }) {
  if (!data?.length) return null;
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
          <XAxis dataKey="score" tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: "bold" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: "10px", border: "none", fontSize: 10 }}
            formatter={(v) => [`${v} resp.`, "Cantidad"]} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false}>
            {data.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────
// TARJETA DE COMENTARIO
// ─────────────────────────────────────────────
function CommentCard({ survey, keyword }: { survey: Survey; keyword: string }) {
  const score = Number(survey.score) || 0;
  const perfil = score >= 9 ? "Promotor" : score >= 7 ? "Satisfecho" : "Insatisfecho";
  const color = perfil === "Promotor" ? "from-emerald-400 to-emerald-600"
    : perfil === "Satisfecho" ? "from-amber-400 to-amber-600"
    : "from-red-400 to-red-600";
  const nombre = [survey.nombre, survey.apellido].filter(Boolean).join(" ") || null;

  const highlight = (text: string) => {
    if (!keyword || !text) return text;
    const kws = keyword.split(",").map(k => normalize(k)).filter(Boolean);
    let result = text;
    // Solo highlight visual — no usamos JSX aquí porque es string para el HTML
    kws.forEach(kw => {
      const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      result = result.replace(re, "**$1**");
    });
    return result;
  };

  return (
    <div className={`rounded-2xl border bg-white/60 p-4 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-md ${
      perfil === "Insatisfecho" ? "border-red-100" : "border-white"
    }`}>
      <div className="flex items-center gap-3 mb-3 pb-2.5 border-b border-slate-100">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black text-white text-base bg-gradient-to-br ${color}`}>
          {score}
        </div>
        <div className="min-w-0">
          {nombre && <p className="text-xs font-black text-slate-800 truncate">{nombre}</p>}
          <p className="text-[10px] font-bold text-slate-400 truncate">{survey.colegio} · {perfil}</p>
        </div>
      </div>
      {survey.positive && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
            <ThumbsUp size={11} weight="fill" />
            <span className="text-[9px] font-black uppercase tracking-widest">Lo positivo</span>
          </div>
          <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
            &ldquo;{survey.positive.slice(0, 200)}{survey.positive.length > 200 ? "…" : ""}&rdquo;
          </p>
        </div>
      )}
      {survey.improvement && (
        <div className="rounded-xl bg-amber-50/70 border border-amber-100/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-amber-600 mb-1">
            <Lightning size={11} weight="fill" />
            <span className="text-[9px] font-black uppercase tracking-widest">Oportunidad</span>
          </div>
          <p className="text-xs text-amber-900 font-medium leading-relaxed italic">
            &ldquo;{survey.improvement.slice(0, 200)}{survey.improvement.length > 200 ? "…" : ""}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// FALLBACK
// ─────────────────────────────────────────────
function ReportsFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB]">
      <CircleNotch size={48} className="animate-spin text-blue-600" />
    </div>
  );
}

// ─────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────
export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsFallback />}>
      <ReportsGenerator />
    </Suspense>
  );
}

function ReportsGenerator() {
  const { user } = useUser();
  const isDirector = user?.publicMetadata?.role === "director";
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";
  const reportRef = useRef<HTMLDivElement>(null);

  const [encuestas, setEncuestas] = useState<Survey[]>([]);
  const [colegios, setColegios] = useState<string[]>(["Todos los colegios"]);
  const [polos, setPolos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Configurador
  const [alcanceTipo, setAlcanceTipo] = useState<"todos" | "colegio" | "polo">("todos");
  const [activeSchool, setActiveSchool] = useState("Todos los colegios");
  const [activePolo, setActivePolo] = useState("");
  const [tema, setTema] = useState("");
  const [keywords, setKeywords] = useState("");

  // Informe
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [profileChartData, setProfileChartData] = useState<ChartDataItem[]>([]);
  const [scoreChartData, setScoreChartData] = useState<{ score: number; count: number; fill: string }[]>([]);
  const [matchedSurveys, setMatchedSurveys] = useState<Survey[]>([]);
  const [reportStats, setReportStats] = useState<any>(null);

  // Cargar encuestas
  useEffect(() => {
    async function load() {
      if (!projectId) { setIsLoading(false); return; }
      try {
        const data = await obtenerEncuestasDB(projectId);
        const lista: Survey[] = Array.isArray(data) ? data : (data as any).rows || [];
        setEncuestas(lista);

        const colMap = new Map<string, string>();
        const poloSet = new Set<string>();
        lista.forEach((item: any) => {
          const col = String(item?.colegio ?? "").trim();
          if (col) colMap.set(normalize(col), col);
          const polo = String(item?.polo ?? "").trim();
          if (polo && polo !== "General") poloSet.add(polo);
        });
        setColegios(["Todos los colegios", ...Array.from(colMap.values()).sort()]);
        setPolos(Array.from(poloSet).sort());
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [projectId]);

  // Scope label para el informe
  const scopeLabel = useMemo(() => {
    if (alcanceTipo === "colegio") return activeSchool;
    if (alcanceTipo === "polo") return `Polo ${activePolo}`;
    return "Todos los colegios";
  }, [alcanceTipo, activeSchool, activePolo]);

  // Filtrado base por alcance
  const scopedData = useMemo(() => {
    if (alcanceTipo === "colegio") return encuestas.filter(r => normalize(r.colegio) === normalize(activeSchool));
    if (alcanceTipo === "polo") return encuestas.filter(r => normalize(r.polo) === normalize(activePolo));
    return encuestas;
  }, [encuestas, alcanceTipo, activeSchool, activePolo]);

  // Preview en tiempo real de cuántas encuestas matchean
  const previewCount = useMemo(() => {
    if (!keywords.trim()) return scopedData.length;
    const kws = keywords.split(",").map(k => normalize(k)).filter(Boolean);
    return scopedData.filter(r => {
      const txt = normalize((r.positive || "") + " " + (r.improvement || ""));
      return kws.some(kw => txt.includes(kw));
    }).length;
  }, [scopedData, keywords]);

  const handleGenerate = async () => {
    if (!tema.trim()) { alert("Ingresá un tema para el informe."); return; }

    setIsGenerating(true);
    setReportMarkdown(null);
    setMatchedSurveys([]);

    try {
      // Filtrar por keywords
      const kwArray = keywords.split(",").map(k => normalize(k)).filter(Boolean);
      const relevant = kwArray.length > 0
        ? scopedData.filter(r => {
            const txt = normalize((r.positive || "") + " " + (r.improvement || ""));
            return kwArray.some(kw => txt.includes(kw));
          })
        : scopedData;

      if (relevant.length === 0) {
        setReportMarkdown(`### ⚠️ Sin datos suficientes\n\nNo se encontraron encuestas con las palabras clave **"${keywords}"** en **${scopeLabel}**.\n\nIntentá ampliar las palabras clave o el alcance.`);
        setIsGenerating(false);
        return;
      }

      setMatchedSurveys(relevant.slice(0, 30)); // mostrar en sidebar

      // Calcular stats
      const total = relevant.length;
      const scores = relevant.map(r => Number(r.score) || 0).filter(s => s > 0);
      const promoters = relevant.filter(r => Number(r.score) >= 9).length;
      const satisfied = relevant.filter(r => { const s = Number(r.score); return s >= 7 && s <= 8; }).length;
      const detractors = relevant.filter(r => { const s = Number(r.score); return s > 0 && s < 7; }).length;
      const avgScore = scores.length ? parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)) : 0;
      const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

      let posSent = 0, negSent = 0;
      relevant.forEach(r => {
        if (r.sentiment === "Constructivo") posSent++;
        else if (r.sentiment === "Molesto" || r.sentiment === "Furioso") negSent++;
      });

      const colegiosRep = Array.from(new Set(relevant.map(r => r.colegio).filter(Boolean)));

      // Distribución de notas
      const scoreDist: Record<number, number> = {};
      for (let i = 1; i <= 10; i++) scoreDist[i] = 0;
      scores.forEach(s => { if (s >= 1 && s <= 10) scoreDist[s]++; });
      setScoreChartData(Object.entries(scoreDist).map(([score, count]) => ({
        score: Number(score), count,
        fill: Number(score) >= 9 ? "#10B981" : Number(score) >= 7 ? "#F59E0B" : "#EF4444",
      })));

      // Chart de perfiles
      setProfileChartData([
        { name: "Promotores", value: promoters, fill: "#10B981" },
        { name: "Satisfechos", value: satisfied, fill: "#F59E0B" },
        { name: "Insatisfechos", value: detractors, fill: "#EF4444" },
      ].filter(s => s.value > 0));

      const stats = {
        total, nps, avgScore,
        promoters: Math.round((promoters/total)*100),
        promoterCount: promoters,
        satisfiedPct: Math.round((satisfied/total)*100),
        satisfiedCount: satisfied,
        detractors: Math.round((detractors/total)*100),
        detractorCount: detractors,
        colegios: colegiosRep,
        sent: {
          pos: Math.round((posSent/total)*100),
          neg: Math.round((negSent/total)*100),
        }
      };
      setReportStats(stats);

      // Payload para la API — datos reales limpios
      const payload = relevant.map(r => {
        const score = Number(r.score) || 0;
        return {
          colegio: r.colegio || "Sin especificar",
          nota: score,
          perfil: score >= 9 ? "Promotor" : score >= 7 ? "Satisfecho" : "Insatisfecho",
          tono: r.sentiment || "Neutro",
          positivo: String(r.positive || "").trim().slice(0, 300),
          mejora: String(r.improvement || "").trim().slice(0, 300),
        };
      }).slice(0, 60);

      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, scope: scopeLabel, comentarios: payload, stats }),
      });

      if (!res.ok) throw new Error("Error API");
      const data = await res.json();
      setReportMarkdown(data.report);

      // Scroll al informe
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    } catch {
      setReportMarkdown("Ocurrió un error al conectar con la IA. Reintentá en unos segundos.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) return <ReportsFallback />;

  if (isDirector) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] font-sans">
        <main className="mx-auto flex min-h-screen w-full max-w-[900px] items-center px-6">
          <div className="w-full rounded-3xl border border-white bg-white/70 p-8 text-center shadow-lg backdrop-blur-xl">
            <h1 className="font-display text-2xl font-black text-slate-900">Informes no habilitados para Dirección</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              En este perfil se prioriza lectura ejecutiva rápida en encuestas y analítica.
            </p>
            <Link
              href={`/dashboard/surveys?projectId=${projectId}`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-blue-800"
            >
              <ArrowLeft size={18} weight="bold" />
              Volver al Panel
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB] font-sans text-slate-900 pb-16 selection:bg-blue-200">

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white bg-white/70 px-4 sm:px-6 py-4 backdrop-blur-xl shadow-sm print:hidden">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={`/dashboard/surveys?projectId=${projectId}`}
              className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-white transition-all border border-white backdrop-blur-xl">
              <ArrowLeft size={17} weight="bold" className="text-blue-700" />
              <span className="hidden sm:inline">Volver</span>
            </Link>
            <div className="flex items-center gap-2">
              <img src="/escudo-apdes.png" alt="APDES" className="h-9 w-auto object-contain drop-shadow-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div>
                <h1 className="font-display text-base font-black tracking-tight text-slate-900">Generador de Informes</h1>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Informes Estratégicos Audire</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {reportMarkdown && (
              <button onClick={() => window.print()}
                className="hidden sm:flex items-center gap-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 px-3 py-2 text-xs font-bold transition-all">
                <Printer size={15} weight="bold" /> Imprimir
              </button>
            )}
            <div className="p-1 rounded-full border-2 border-blue-100 bg-white shadow-sm">
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 w-full max-w-[1600px] px-4 sm:px-6 print:mt-0 print:p-0">
        <div className="flex flex-col xl:flex-row gap-6 items-start">

          {/* ═══════════════════════════════════
              PANEL IZQUIERDO: CONFIGURADOR
              ═══════════════════════════════════ */}
          <aside className="w-full xl:w-[380px] shrink-0 flex flex-col gap-4 print:hidden xl:sticky xl:top-[80px]">

            {/* Configurador principal */}
            <div className="rounded-3xl border border-white bg-white/60 p-6 backdrop-blur-xl shadow-lg">
              <div className="flex items-center gap-2 mb-5 border-b border-slate-100 pb-4">
                <SlidersHorizontal size={18} className="text-blue-600" />
                <h2 className="font-display text-base font-black text-slate-800">Configurar Informe</h2>
              </div>

              <div className="flex flex-col gap-4">

                {/* Tipo de alcance */}
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Alcance</label>
                  <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
                    {[
                      { val: "todos", label: "Todos" },
                      { val: "polo", label: "Polo" },
                      { val: "colegio", label: "Colegio" },
                    ].map(({ val, label }) => (
                      <button key={val} onClick={() => setAlcanceTipo(val as any)}
                        className={`flex-1 rounded-lg py-2 text-xs font-black transition-all ${
                          alcanceTipo === val ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selector dinámico */}
                {alcanceTipo === "colegio" && (
                  <div className="relative flex items-center gap-2 rounded-xl bg-white border border-slate-200 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                    <Buildings size={15} className="absolute left-3 text-slate-400" />
                    <select value={activeSchool} onChange={(e) => setActiveSchool(e.target.value)}
                      className="w-full appearance-none bg-transparent py-3 pl-10 pr-4 text-sm font-bold text-slate-800 outline-none cursor-pointer">
                      {colegios.filter(c => c !== "Todos los colegios").map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <CaretDown size={13} weight="bold" className="absolute right-3 text-slate-400 pointer-events-none" />
                  </div>
                )}

                {alcanceTipo === "polo" && polos.length > 0 && (
                  <div className="relative flex items-center gap-2 rounded-xl bg-white border border-slate-200 shadow-sm focus-within:border-blue-400 transition-all">
                    <Hash size={15} className="absolute left-3 text-slate-400" />
                    <select value={activePolo} onChange={(e) => setActivePolo(e.target.value)}
                      className="w-full appearance-none bg-transparent py-3 pl-10 pr-4 text-sm font-bold text-slate-800 outline-none cursor-pointer">
                      <option value="">Seleccioná un polo...</option>
                      {polos.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <CaretDown size={13} weight="bold" className="absolute right-3 text-slate-400 pointer-events-none" />
                  </div>
                )}

                {/* Tema */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Tema del Informe</label>
                  <input type="text" value={tema} onChange={(e) => setTema(e.target.value)}
                    placeholder="Ej: Educación Física y Deportes"
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm font-bold text-slate-800 outline-none shadow-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                </div>

                {/* Palabras clave */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Palabras Clave (filtro)</label>
                  <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)}
                    placeholder="Ej: deporte, hockey, gimnasia, cancha"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm font-medium text-slate-700 outline-none shadow-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-blue-700 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100">
                    <Info size={13} weight="fill" className="text-blue-500 shrink-0" />
                    <span>{previewCount} encuesta{previewCount !== 1 ? "s" : ""} coinciden con este filtro</span>
                  </div>
                </div>

                <button onClick={handleGenerate} disabled={isGenerating || !tema.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-black text-white hover:bg-blue-800 transition-all active:scale-95 disabled:opacity-60 shadow-md shadow-blue-700/20 mt-1">
                  {isGenerating
                    ? <><CircleNotch size={17} className="animate-spin" /> Redactando informe...</>
                    : <><Sparkle size={17} weight="fill" /> Generar con IA</>}
                </button>
              </div>
            </div>

            {/* Comentarios fuente */}
            {matchedSurveys.length > 0 && (
              <div className="rounded-3xl border border-white bg-white/60 p-5 backdrop-blur-xl shadow-lg">
                <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                  <ChatCircleText size={16} weight="fill" className="text-blue-600" />
                  <h3 className="text-sm font-black text-slate-800">Comentarios fuente</h3>
                  <span className="ml-auto text-[9px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{matchedSurveys.length}</span>
                </div>
                <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {matchedSurveys.map((s, i) => (
                    <CommentCard key={i} survey={s} keyword={keywords} />
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ═══════════════════════════════════
              PANEL DERECHO: HOJA A4
              ═══════════════════════════════════ */}
          <section className="flex-1 w-full print:w-full" ref={reportRef}>
            <div className="relative mx-auto w-full max-w-[820px] min-h-[1000px] bg-white border border-slate-200 shadow-2xl rounded-2xl p-8 sm:p-14 print:border-none print:shadow-none print:rounded-none print:p-0 transition-all">

              {/* Botón imprimir flotante */}
              {reportMarkdown && (
                <button onClick={() => window.print()}
                  className="absolute top-5 right-5 flex items-center gap-2 rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 px-4 py-2 text-xs font-bold transition-all shadow-sm print:hidden">
                  <Printer size={14} weight="bold" /> Imprimir a PDF
                </button>
              )}

              {/* Estado vacío */}
              {!isGenerating && !reportMarkdown && (
                <div className="flex h-full flex-col items-center justify-center text-center opacity-40 py-48 print:hidden">
                  <FilePdf size={60} weight="duotone" className="text-slate-400 mb-4" />
                  <h3 className="font-display text-xl font-bold text-slate-800">Hoja en blanco</h3>
                  <p className="text-sm font-medium text-slate-500 max-w-xs mt-2">Configurá el informe a la izquierda y hacé clic en Generar.</p>
                </div>
              )}

              {/* Generando */}
              {isGenerating && (
                <div className="flex h-full flex-col items-center justify-center py-48">
                  <div className="relative">
                    <CircleNotch size={48} className="animate-spin text-blue-600" />
                    <Sparkle size={20} weight="fill" className="text-amber-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-sm font-black text-slate-600 mt-5">Analizando {previewCount} encuestas...</p>
                  <p className="text-xs font-medium text-slate-400 mt-1 animate-pulse">Redactando con citas reales de las familias</p>
                </div>
              )}

              {/* INFORME GENERADO */}
              {reportMarkdown && (
                <div className="flex flex-col">

                  {/* Encabezado del documento */}
                  <div className="mb-8 pb-6 border-b-2 border-slate-100 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img src="/escudo-apdes.png" alt="Audire" className="h-12 w-auto object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Informe Estratégico</p>
                        <p className="text-sm font-black text-slate-700">Audire Education · APDES Analytics</p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-bold text-slate-400">
                      <p>{new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      <p className="mt-0.5">{scopeLabel}</p>
                    </div>
                  </div>

                  {/* Gráficos de la muestra — solo si hay stats */}
                  {reportStats && (
                    <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 rounded-2xl p-5 border border-slate-100 print:break-inside-avoid">
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Perfil de la muestra</p>
                        <ProfileChart data={profileChartData} />
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Distribución de notas</p>
                        <ScoreChart data={scoreChartData} />
                        <p className="text-[9px] font-medium text-slate-400 mt-1">Nota promedio: <strong className="text-slate-600">{reportStats.avgScore}/10</strong></p>
                      </div>
                      <div className="flex flex-col justify-center gap-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Datos clave</p>
                        {[
                          { label: "Encuestas analizadas", val: reportStats.total, color: "text-slate-700" },
                          { label: "NPS de la muestra", val: `${reportStats.nps > 0 ? "+" : ""}${reportStats.nps}`, color: reportStats.nps >= 0 ? "text-emerald-600" : "text-red-600" },
                          { label: "Promotores", val: `${reportStats.promoterCount} (${reportStats.promoters}%)`, color: "text-emerald-600" },
                          { label: "Insatisfechos", val: `${reportStats.detractorCount} (${reportStats.detractors}%)`, color: "text-red-600" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-1.5 border border-slate-100">
                            <span className="text-[10px] font-semibold text-slate-500">{label}</span>
                            <span className={`text-xs font-black ${color}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cuerpo del informe en Markdown */}
                  <div className="prose prose-slate prose-sm sm:prose-base max-w-none
                    prose-headings:font-display prose-headings:font-black prose-headings:tracking-tight
                    prose-h1:text-3xl prose-h1:text-slate-900 prose-h1:mb-2 prose-h1:pb-3 prose-h1:border-b prose-h1:border-slate-100
                    prose-h2:text-lg prose-h2:text-blue-800 prose-h2:mt-8 prose-h2:mb-3 prose-h2:flex prose-h2:items-center
                    prose-h3:text-base prose-h3:text-slate-700 prose-h3:mt-5 prose-h3:mb-2
                    prose-p:text-slate-700 prose-p:leading-relaxed prose-p:mb-4 prose-p:text-[15px]
                    prose-li:text-slate-700 prose-li:mb-1.5 prose-li:text-[14px]
                    prose-strong:font-black prose-strong:text-slate-900
                    prose-em:text-slate-600 prose-em:not-italic
                    prose-blockquote:border-l-4 prose-blockquote:border-blue-400 prose-blockquote:bg-blue-50/60
                    prose-blockquote:py-3 prose-blockquote:px-5 prose-blockquote:not-italic prose-blockquote:rounded-r-xl
                    prose-blockquote:my-5 prose-blockquote:text-blue-900 prose-blockquote:text-sm
                    prose-hr:border-slate-200 prose-hr:my-8">
                    <ReactMarkdown>{reportMarkdown}</ReactMarkdown>
                  </div>

                  {/* Pie de página */}
                  <div className="mt-12 pt-5 border-t border-slate-200 flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest print:break-inside-avoid">
                    <span>Audire Education / APDES Analytics</span>
                    <span>Generado con IA · {new Date().toLocaleDateString('es-AR')}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
