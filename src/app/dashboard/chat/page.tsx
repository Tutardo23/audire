"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import gsap from "gsap";
import {
  Sparkle,
  ArrowLeft,
  ArrowUpRight,
  PaperPlaneRight,
  CircleNotch,
  WarningCircle,
  Buildings,
  CaretDown,
  ChartBar,
  Lightning,
  Brain,
  Star,
  PresentationChart,
} from "phosphor-react";

import ReactMarkdown from "react-markdown";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

// ✅ AJUSTÁ ESTE IMPORT AL TUYO
import { obtenerEncuestasDB } from "../../actions"; // <-- EJEMPLO: puede ser "../../actions"

type SurveyRow = {
  id?: string;
  colegio?: string;
  curso?: string;
  polo?: string;
  sexo?: string;
  score?: number | string;
  type?: string;
  positive?: string;
  improvement?: string;
  tags?: any;
  date?: string;
};

type ChatChart = {
  type: "bar" | "pie" | "line";
  title?: string;
  data: { name: string; value: number }[];
  color?: string;
};
type ChatMsg = { role: "user" | "assistant"; content: string; chart?: ChatChart | null };

export default function Page() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <BotApdes />
    </Suspense>
  );
}

function ChatFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] font-sans">
      <div className="flex flex-col items-center gap-4 text-blue-600">
        <CircleNotch size={48} className="animate-spin" />
        <h2 className="font-bold text-slate-700">Cargando Bot APDES...</h2>
      </div>
    </div>
  );
}

const normalize = (str?: string | null) => {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

const parseTags = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[{}]/g, "").trim();
    if (!cleaned) return [];
    return cleaned
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
};

function buildCompactContext(rows: SurveyRow[], activeSchool: string) {
  const data =
    activeSchool === "Todos los colegios"
      ? rows
      : rows.filter((r) => normalize(r.colegio) === normalize(activeSchool));

  const total = data.length;
  const scores = data.map((r) => Number(r.score) || 0).filter((n) => n > 0);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "0.0";

  const promoters = data.filter((r) => (Number(r.score) || 0) >= 9).length;
  const passives = data.filter((r) => {
    const s = Number(r.score) || 0;
    return s >= 7 && s <= 8;
  }).length;
  const detractors = data.filter((r) => {
    const s = Number(r.score) || 0;
    return s > 0 && s < 7;
  }).length;

  const nps = total ? Math.round(((promoters - detractors) / total) * 100) : 0;

  // Conteo de tags
  const tagCount = new Map<string, number>();
  for (const r of data) {
    for (const t of parseTags(r.tags)) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  const topTags = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  // Ejemplos cortos (para que el modelo entienda “voz”)
  const examples = data
    .filter((r) => (r.positive || r.improvement) && (Number(r.score) || 0) > 0)
    .slice(0, 10)
    .map((r) => ({
      score: Number(r.score) || 0,
      colegio: r.colegio ?? "",
      curso: r.curso ?? "",
      positive: String(r.positive ?? "").slice(0, 180),
      improvement: String(r.improvement ?? "").slice(0, 180),
      tags: parseTags(r.tags).slice(0, 4),
    }));

  return {
    scope: activeSchool,
    metrics: { total, avg, nps, promoters, passives, detractors },
    topTags,
    examples,
  };
}

function BotApdes() {
  const cardRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const isDirector = user?.publicMetadata?.role === "director";
  const isEquipo = user?.publicMetadata?.role === "equipo";

  const [logoOk, setLogoOk] = useState(true);

  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeSchool, setActiveSchool] = useState<string>("Todos los colegios");
  const [colegios, setColegios] = useState<string[]>(["Todos los colegios"]);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hola. Soy el Bot APDES. Decime qué querés analizar (NPS, principales quejas, plan de acción, comparativas por curso/colegio, etc.).",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    gsap.fromTo(
      cardRef.current,
      { y: 18, opacity: 0, scale: 0.99 },
      { y: 0, opacity: 1, scale: 1, duration: 0.65, ease: "power3.out", delay: 0.05 }
    );
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  useEffect(() => {
    async function load() {
      if (!projectId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorMsg("");
      try {
        const data = await obtenerEncuestasDB(projectId);
        const lista = Array.isArray(data) ? data : (data as any).rows || [];
        setRows(lista);

        const map = new Map<string, string>();
        lista.forEach((item: any) => {
          const raw = String(item?.colegio ?? "").trim();
          if (!raw) return;
          const key = normalize(raw);
          if (!map.has(key)) map.set(key, raw);
        });
        const unique = Array.from(map.values()).sort();
        setColegios(["Todos los colegios", ...unique]);
      } catch (e) {
        console.error(e);
        setErrorMsg("No pude cargar las encuestas de la base. Revisá la conexión/acciones.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [projectId]);

  const context = useMemo(() => buildCompactContext(rows, activeSchool), [rows, activeSchool]);

  // ✅ PROMPTS EJECUTIVOS CON ÍCONOS DE PHOSPHOR
  const quickPrompts = useMemo(
    () => [
      {
        text: "Matriz de Acción: Armá una tabla priorizando las quejas en 'Resolución Rápida (Quick Wins)' vs 'Problemas Estructurales'.",
        icon: <Lightning size={20} weight="duotone" className="text-amber-500" />
      },
      {
        text: "Análisis Oculto: Actuá como un consultor. Leyendo entre líneas, ¿cuál es el 'elefante en la habitación' que más frustra a las familias?",
        icon: <Brain size={20} weight="duotone" className="text-pink-500" />
      },
      {
        text: "Retención y Marketing: Analizá solo a los Promotores. ¿Qué es lo que más valoran de nuestra identidad y cómo lo potenciamos?",
        icon: <Star size={20} weight="duotone" className="text-emerald-500" />
      },
      {
        text: "Radiografía Crítica: Identificá cuál es el segmento (curso o colegio) con peor NPS y graficá qué temas reclaman más.",
        icon: <PresentationChart size={20} weight="duotone" className="text-blue-500" />
      },
    ],
    []
  );

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setSending(true);
    setErrorMsg("");

    const nextMessages: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          scopeSchool: activeSchool,
          prompt: q,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const answer = String(data?.text ?? data?.message ?? data?.content ?? "").trim();
      const chartData = data?.chart ?? null;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer || "No pude generar una respuesta. Probá reformulando.",
          chart: chartData,
        },
      ]);
    } catch (e: any) {
      console.error(e);
      setErrorMsg("Falló el Bot. Revisá /api/chat y tus env vars.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Se cayó el Bot. Probá de nuevo en unos segundos." },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (!projectId) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] font-sans">
        <header className="sticky top-0 z-40 border-b border-white bg-white/70 px-4 sm:px-6 py-4 backdrop-blur-xl shadow-sm shadow-blue-900/5">
          <div className="mx-auto w-full max-w-[1500px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 items-center justify-center">
                {logoOk ? (
                  <img
                    src="/escudo-apdes.png"
                    alt="Escudo APDES"
                    className="h-10 w-auto object-contain drop-shadow-sm"
                    onError={() => setLogoOk(false)}
                  />
                ) : (
                  <span className="font-display text-sm font-black text-slate-900">APDES</span>
                )}
              </div>
              <span className="hidden sm:block font-display text-2xl font-black tracking-tight text-slate-900">
                Bot APDES
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center justify-center p-1 rounded-full border-2 border-blue-100 bg-white shadow-sm hover:border-blue-400 transition-colors">
                <UserButton />
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto mt-10 w-full max-w-[900px] px-6">
          <div className="rounded-3xl border border-white bg-white/60 p-8 backdrop-blur-xl shadow-lg shadow-slate-200/50">
            <h1 className="font-display text-2xl font-black text-slate-900">Elegí un proyecto</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Para usar el Bot APDES, abrí un proyecto desde el Hub.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 transition-all"
            >
              <ArrowLeft size={18} weight="bold" />
              Volver al Hub
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isDirector || isEquipo) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] font-sans">
        <main className="mx-auto flex min-h-screen w-full max-w-[900px] items-center px-6">
          <div className="w-full rounded-3xl border border-white bg-white/70 p-8 text-center shadow-lg backdrop-blur-xl">
            <h1 className="font-display text-2xl font-black text-slate-900">Módulo no habilitado para este perfil</h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Este perfil trabaja sin chat. Volvé al panel principal de encuestas.
            </p>
            <button
              onClick={() => router.push(`/dashboard/surveys?projectId=${projectId}`)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition-all hover:bg-blue-800"
            >
              <ArrowLeft size={18} weight="bold" />
              Volver al Panel
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading) return <ChatFallback />;

  return (
    <div className="min-h-screen bg-[#F4F7FB] font-sans overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-white bg-white/70 px-4 sm:px-6 py-4 backdrop-blur-xl shadow-sm shadow-blue-900/5">
        <div className="mx-auto w-full max-w-[1500px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push(`/dashboard/surveys?projectId=${projectId}`)}
                className="hidden md:flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-white hover:shadow-lg active:scale-95 border border-white backdrop-blur-xl"
                title="Volver al panel"
              >
                <ArrowLeft size={18} weight="bold" className="text-blue-700" />
                <span className="hidden sm:inline">Volver</span>
              </button>

              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 items-center justify-center">
                  {logoOk ? (
                    <img
                      src="/escudo-apdes.png"
                      alt="Escudo APDES"
                      className="h-10 w-auto object-contain drop-shadow-sm"
                      onError={() => setLogoOk(false)}
                    />
                  ) : (
                    <span className="font-display text-sm font-black text-slate-900">APDES</span>
                  )}
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">APDES</p>
                  <h1 className="font-display text-xl font-black tracking-tight text-slate-900 truncate">
                    Bot APDES
                  </h1>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200 hidden sm:block" />

              <div className="relative flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 border border-white backdrop-blur-xl shadow-sm min-w-0">
                <Buildings size={18} className="text-slate-400 shrink-0" />
                <select
                  value={activeSchool}
                  onChange={(e) => setActiveSchool(e.target.value)}
                  className="appearance-none bg-transparent pr-8 text-sm font-bold text-blue-900 outline-none cursor-pointer truncate max-w-[170px] sm:max-w-[320px]"
                >
                  {colegios.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <CaretDown
                  size={14}
                  weight="bold"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => router.push(`/dashboard/surveys?projectId=${projectId}`)}
                className="hidden md:flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm font-bold text-slate-700 transition-all hover:bg-white hover:shadow-lg active:scale-95 border border-white backdrop-blur-xl"
                title="Ver panel"
              >
                <ChartBar size={18} weight="fill" className="text-indigo-600" />
                Panel
              </button>

              <div className="flex items-center justify-center p-1 rounded-full border-2 border-blue-100 bg-white shadow-sm hover:border-blue-400 transition-colors">
                <UserButton />
              </div>
            </div>
          </div>

          <div className="mt-3 md:hidden">
            <button
              onClick={() => router.push(`/dashboard/surveys?projectId=${projectId}`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/60 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-white hover:shadow-lg active:scale-95 border border-white backdrop-blur-xl"
              title="Volver al panel"
            >
              <ArrowLeft size={18} weight="bold" className="text-blue-700" /> Volver al panel
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 w-full max-w-[1500px] px-6 pb-14">
        <div
          ref={cardRef}
          className="grid grid-cols-1 gap-6 lg:grid-cols-5"
        >
          {/* Panel lateral: métricas + prompts */}
          <aside className="lg:col-span-2">
            <div className="rounded-3xl border border-white bg-white/60 p-6 backdrop-blur-xl shadow-lg shadow-slate-200/50">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-black text-slate-900">Contexto</h2>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                  {context.metrics.total} respuestas
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Kpi label="NPS" value={String(context.metrics.nps)} />
                <Kpi label="Promedio" value={`${context.metrics.avg}/10`} />
                <Kpi label="Promotores" value={String(context.metrics.promoters)} />
                <Kpi label="Críticos" value={String(context.metrics.detractors)} />
              </div>

              <div className="mt-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Top temas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {context.topTags.length ? (
                    context.topTags.map((t) => (
                      <span
                        key={t.tag}
                        className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-bold text-slate-700"
                      >
                        #{t.tag} <span className="text-slate-400">({t.count})</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-semibold text-slate-500">Sin etiquetas detectadas.</span>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Prompts rápidos
                </p>
                <div className="mt-3 grid gap-2">
                  {quickPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(p.text)}
                      className="group text-left rounded-2xl border-2 border-blue-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 hover:shadow-md active:scale-95 transition-all cursor-pointer flex items-start gap-3"
                    >
                      <div className="mt-0.5 shrink-0">
                        {p.icon}
                      </div>
                      <span className="flex-1 leading-snug">{p.text}</span>
                      <ArrowUpRight size={16} weight="bold" className="shrink-0 text-blue-400 group-hover:text-blue-600 transition-colors mt-0.5" />
                    </button>
                  ))}
                </div>

                {isAdmin && (
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Tip: como admin, podés pedir “plan de acción por eje” y te lo arma directo.
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Chat */}
          <section className="lg:col-span-3">
            <div className="rounded-3xl border border-white bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/50 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/70 bg-white/50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <Sparkle size={20} weight="fill" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-black text-slate-900">Bot APDES</h2>
                    <p className="text-xs font-semibold text-slate-500">
                      Alcance: <span className="text-slate-700">{activeSchool}</span>
                    </p>
                  </div>
                </div>

                <span className="hidden sm:inline-flex rounded-full bg-slate-900/5 px-3 py-1 text-xs font-bold text-slate-600">
                  Respuestas: {context.metrics.total}
                </span>
              </div>

              {errorMsg && (
                <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-red-700">
                  <WarningCircle size={18} weight="fill" />
                  <p className="text-sm font-bold">{errorMsg}</p>
                </div>
              )}

              <div className="h-[58vh] overflow-auto px-5 py-4 space-y-3">
                {messages.map((m, idx) => (
                  <Bubble key={idx} role={m.role} content={m.content} chart={m.chart} />
                ))}

                {sending && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <CircleNotch size={18} className="animate-spin" />
                    <span className="text-sm font-bold">Pensando…</span>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              <div className="border-t border-white/70 bg-white/50 px-4 py-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                  className="flex items-end gap-3"
                >
                  <div className="flex-1">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ej: 'Dame un plan de acción priorizado por urgencia e impacto'…"
                      rows={2}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                    />
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                      Tip: pedí “tabla: problema → causa → acción → responsable → plazo”.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800 transition-all disabled:opacity-60"
                  >
                    <PaperPlaneRight size={18} weight="bold" />
                    Enviar
                  </button>
                </form>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white/60 p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 font-display text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

const CHART_COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#84CC16"];

function InlineChart({ chart }: { chart: ChatChart }) {
  if (!chart?.data?.length) return null;
  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl bg-white/95 border border-slate-100 shadow-xl p-3 text-xs">
        <p className="font-bold text-slate-600 mb-0.5">{label || payload[0]?.name}</p>
        <p className="font-black text-slate-900">{payload[0]?.value?.toLocaleString()}</p>
      </div>
    );
  };
  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white/90 p-4">
      {chart.title && <p className="text-xs font-black text-slate-700 mb-3">{chart.title}</p>}
      {chart.type === "pie" && (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35} paddingAngle={3}>
              {chart.data.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<Tip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
      {chart.type === "line" && (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chart.data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} />
            <Line type="monotone" dataKey="value" stroke={chart.color ?? "#3B82F6"} strokeWidth={2.5} dot={{ fill: chart.color ?? "#3B82F6", r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
      {(chart.type === "bar" || (chart.type !== "pie" && chart.type !== "line")) && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chart.data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }} barSize={22}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="value" radius={[6,6,0,0]}>
              {chart.data.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Bubble({ role, content, chart }: { role: "user" | "assistant"; content: string; chart?: ChatChart | null }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-blue-700 text-white rounded-br-lg font-semibold"
            : "bg-white/80 text-slate-800 border border-white rounded-bl-lg"
        }`}
      >
        {isUser ? (
          content
        ) : (
          <>
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-base font-black text-slate-900 mt-4 mb-2 first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-black text-slate-900 mt-4 mb-2 first:mt-0 border-b border-slate-200 pb-1">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-black text-blue-700 mt-3 mb-1 first:mt-0">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-sm text-slate-700 mb-2 last:mb-0 font-medium">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="my-2 space-y-1 pl-4">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-2 space-y-1 pl-4 list-decimal">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-sm text-slate-700 font-medium flex gap-2 items-start">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                  <span>{children}</span>
                </li>
              ),
              strong: ({ children }) => (
                <strong className="font-black text-slate-900">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-slate-600">{children}</em>
              ),
              blockquote: ({ children }: { children?: React.ReactNode }) => (
                <blockquote className="border-l-4 border-blue-300 pl-3 my-2 text-slate-500 italic text-xs bg-blue-50/60 py-1 rounded-r-lg">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-3 border-slate-200" />,
              code: ({ children }) => (
                <code className="bg-slate-100 text-blue-700 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
          {chart && <InlineChart chart={chart} />}
          </>
        )}
      </div>
    </div>
  );
}
