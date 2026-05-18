"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  PresentationChart,
  CircleNotch,
  Buildings,
  MapPin,
  Target,
  TrendUp,
  CaretDown,
  WarningOctagon,
  MagnifyingGlass,
  Hash,
  Smiley,
  Sparkle,
  Heart,
  ChartBar,
  ArrowRight,
} from "phosphor-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  CartesianGrid, ScatterChart, Scatter, ZAxis, LabelList,
} from "recharts";
import { obtenerEncuestasDB } from "../../actions";

// ─────────────────────────────────────────────
// SUSPENSE WRAPPER
// ─────────────────────────────────────────────
export default function Page() {
  return (
    <Suspense fallback={<AnalyticsFallback />}>
      <AdvancedAnalyticsInner />
    </Suspense>
  );
}

function AnalyticsFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#F4F7FB]">
      <div className="flex flex-col items-center gap-4">
        <CircleNotch size={48} className="animate-spin text-blue-600" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cargando analytics...</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────
const normalize = (str?: string | null) =>
  str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

const canonTag = (t: string) => {
  const nt = normalize(t);
  if (nt.startsWith("docent") || nt.startsWith("docenc")) return "Docencia";
  if (nt.startsWith("infra")) return "Infraestructura";
  if (nt.startsWith("norm")) return "Normativas";
  if (nt.startsWith("activ")) return "Actividades";
  if (nt.startsWith("labor")) return "Laboral/Recursos";
  if (nt.startsWith("comunic")) return "Comunicación";
  return "General";
};

const STOPWORDS = new Set([
  "de","la","el","y","a","en","que","los","las","un","una","por","para","con","no","es","se","al","del",
  "lo","muy","mas","más","si","sí","ya","pero","como","porque","tambien","también","hay","fue","son",
  "esto","esta","está","mi","mis","su","sus","me","nos","les","todo","todos","todas","uno","donde",
  "cuando","asi","así","ser","tener","hacer","puede","pueden","cada","mucho","muchos","muchas","poco",
  "bien","mal","nos","les","nos","que","cual","cuales","para","ante","bajo","cabe","con","contra",
  "desde","durante","entre","hacia","hasta","mediante","sino","sobre","tras","versus",
]);

const POS_WORDS = new Set([
  "excelente","genial","buen","bueno","buena","buenas","buenisimo","buenísimo","gracias","feliz",
  "contento","mejor","mejora","orden","limpio","linda","lindo","hermoso","hermosa","recomiendo",
  "super","súper","increible","increíble","perfecto","perfecta","calido","cálido","calida","cálida",
  "amor","amoroso","dedica","dedicada","compromiso","confianza","seguro","segura","tranquilo","felices",
  "alegre","atento","atenta","puntual","responsable","profesional","cariño","excelentes","notable",
]);

const NEG_WORDS = new Set([
  "malo","mala","pesimo","pésimo","horrible","falta","faltan","problema","queja","sucio","sucia",
  "demora","caro","caras","mal","ruido","inseguro","insegura","frio","frío","calor","rotos","roto",
  "rota","insuficiente","desorden","desorganizado","atraso","molesto","molesta","peligroso","nunca",
  "jamas","jamás","terrible","desastre","inaceptable","vergüenza","indignante","fatal","deficiente",
]);

const tokenize = (text: string) =>
  String(text ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(Boolean);

const topWordsFromField = (rows: any[], field: "positive" | "improvement", topN = 10) => {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const w of tokenize(r[field] ?? "")) {
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN)
    .map(([word, count]) => ({ word, count }));
};

// ─────────────────────────────────────────────
// FILTRO INTELIGENTE DE FALSOS POSITIVOS
// ─────────────────────────────────────────────
const esMejoraValida = (texto: string, nota: number): boolean => {
  if (!texto) return false;
  
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  if (t.length < 12) return false;

  const regexBasura = /^(no tengo|ninguna|ninguno|nada|por el momento|todo bien|todo excelente|todo espectacular|nada para mejorar|ninguna sugerencia|nada que agregar|ninguna observacion|estamos (muy|enormemente)? agradecidos)/i;
  if (regexBasura.test(t)) return false;

  if (nota >= 9 && (t.includes("agradecido") || t.includes("excelente") || t.includes("felicitaciones"))) {
      if (!t.includes("pero") && !t.includes("sugiero") && !t.includes("estaria bueno") && !t.includes("mejorar")) {
          return false;
      }
  }

  return true;
};

// ✅ Top frases reales con nombre del autor
type PhraseItem = { phrase: string; name: string | null; score: number };
const topPhrasesFromField = (rows: any[], field: "positive" | "improvement", topN = 5): PhraseItem[] => {
  const items: PhraseItem[] = rows
    .filter(r => field === "improvement" ? esMejoraValida(String(r[field] ?? ""), Number(r.score)) : true)
    .map((r) => ({
      phrase: String(r[field] ?? "").trim(),
      name: r.displayName ?? null,
      score: Number(r.score) || 0,
    }))
    .filter((p) => p.phrase.length >= 15 && p.phrase.length <= 350)
    .sort((a, b) => {
      if (field === "improvement") {
        return a.score - b.score; // Prioriza las quejas de detractores primero
      }
      const scoreA = Math.abs(a.phrase.length - 80);
      const scoreB = Math.abs(b.phrase.length - 80);
      return scoreA - scoreB;
    });
  const seen = new Set<string>();
  const unique: PhraseItem[] = [];
  for (const p of items) {
    const key = p.phrase.substring(0, 40).toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
    if (unique.length >= topN) break;
  }
  return unique;
};

const topWordsFromRows = (rows: any[], topN = 12) => {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const w of tokenize(`${r.positive ?? ""} ${r.improvement ?? ""}`)) {
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN)
    .map(([word, count]) => ({ word, count }));
};

const getSentimentFromRows = (rows: any[]) => {
  let pos = 0, neg = 0;
  for (const r of rows) {
    for (const w of tokenize(`${r.positive ?? ""} ${r.improvement ?? ""}`)) {
      if (POS_WORDS.has(w)) pos++;
      if (NEG_WORDS.has(w)) neg++;
    }
  }
  const total = pos + neg;
  const score = total === 0 ? 0 : Math.round(((pos - neg) / total) * 100);
  const label = score >= 18 ? "Positivo" : score <= -18 ? "Negativo" : "Neutral";
  return { pos, neg, score, label };
};

const countKeywordInRows = (rows: any[], keyword: string) => {
  const k = normalize(keyword);
  if (!k) return 0;
  let c = 0;
  for (const r of rows) {
    const text = normalize(`${r.positive ?? ""} ${r.improvement ?? ""}`);
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    c += (text.match(re) || []).length;
  }
  return c;
};

const keywordByTag = (rows: any[], keyword: string) => {
  const k = normalize(keyword);
  if (!k) return [];
  const map = new Map<string, number>();
  for (const r of rows) {
    const text = normalize(`${r.positive ?? ""} ${r.improvement ?? ""}`);
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const hits = (text.match(re) || []).length;
    if (!hits) continue;
    const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
    const canon = tags.length ? tags.map(canonTag) : ["General"];
    canon.forEach((t) => map.set(t, (map.get(t) || 0) + hits));
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
};

// ─────────────────────────────────────────────
// MAPA DE CALOR: Curso × Tema
// ─────────────────────────────────────────────
// Heatmap perfil × tema: para un colegio seleccionado
const buildHeatmapByProfile = (rows: any[]) => {
  const TAGS = ["Docencia","Infraestructura","Normativas","Actividades","Comunicación","General"];
  const PROFILES = ["Promotor","Satisfecho","Insatisfecho"];
  const cells: Record<string, Record<string, { sum: number; count: number }>> = {};

  for (const row of rows) {
    const profile = String(row.type ?? "Insatisfecho");
    if (!PROFILES.includes(profile)) continue;
    const score = Number(row.score) || 0;
    if (!score) continue;
    const tags: string[] = Array.isArray(row.tags) ? row.tags.map(canonTag) : ["General"];
    for (const tag of tags) {
      if (!TAGS.includes(tag)) continue;
      if (!cells[profile]) cells[profile] = {};
      if (!cells[profile][tag]) cells[profile][tag] = { sum: 0, count: 0 };
      cells[profile][tag].sum += score;
      cells[profile][tag].count += 1;
    }
  }
  return { courses: PROFILES.filter(p => cells[p]), rowLabel: "perfil", tags: TAGS, cells };
};

const buildHeatmap = (rows: any[], groupBy: "curso" | "colegio" | "polo" = "colegio") => {
  const TAGS = ["Docencia", "Infraestructura", "Normativas", "Actividades", "Comunicación", "General"];

  const getValue = (r: any) => String(r[groupBy] ?? "-").trim();

  const groups = Array.from(new Set(rows.map(getValue)))
    .filter((v) => v && v !== "-" && v !== "Otros" && v.length > 0)
    .slice(0, 10);

  if (groups.length === 0) return { courses: [], rowLabel: groupBy, tags: TAGS, cells: {} };

  const cells: Record<string, Record<string, { sum: number; count: number }>> = {};

  for (const row of rows) {
    const group = getValue(row);
    if (!groups.includes(group)) continue;
    const score = Number(row.score) || 0;
    if (score === 0) continue;

    const tags: string[] = Array.isArray(row.tags) ? row.tags.map(canonTag) : ["General"];
    for (const tag of tags) {
      if (!TAGS.includes(tag)) continue;
      if (!cells[group]) cells[group] = {};
      if (!cells[group][tag]) cells[group][tag] = { sum: 0, count: 0 };
      cells[group][tag].sum += score;
      cells[group][tag].count += 1;
    }
  }

  return { courses: groups, rowLabel: groupBy, tags: TAGS, cells };
};

// Interpolate red→yellow→green based on score 0–10
const scoreToColor = (score: number | null): string => {
  if (score === null) return "#F8FAFC";
  if (score >= 9) return "#D1FAE5";
  if (score >= 8) return "#A7F3D0";
  if (score >= 7) return "#FEF3C7";
  if (score >= 6) return "#FDE68A";
  if (score >= 5) return "#FECACA";
  return "#FCA5A5";
};

const scoreToTextColor = (score: number | null): string => {
  if (score === null) return "#CBD5E1";
  if (score >= 7) return "#065F46";
  if (score >= 5) return "#92400E";
  return "#991B1B";
};

// ─────────────────────────────────────────────
// GAUGE DE SENTIMIENTO (SVG puro)
// ─────────────────────────────────────────────
function SentimentGauge({ score, label }: { score: number; label: string }) {
  // score: -100 a 100 → aguja: -90° a +90°
  const clampedScore = Math.max(-100, Math.min(100, score));
  const angleDeg = (clampedScore / 100) * 90; // -90 a +90

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cx = 120, cy = 110, r = 80;

  // Arco de fondo: de -180° a 0° (semicírculo superior)
  const arcStart = -180;
  const arcEnd = 0;
  const pathArc = (startDeg: number, endDeg: number, color: string, thickness = 18) => {
    const s = toRad(startDeg);
    const e = toRad(endDeg);
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  // Aguja: parte de cx,cy, apunta a -90° + angleDeg (arriba = -90°)
  const needleAngle = -90 + angleDeg;
  const needleLen = 65;
  const nx = cx + needleLen * Math.cos(toRad(needleAngle));
  const ny = cy + needleLen * Math.sin(toRad(needleAngle));

  const gaugeColor = score >= 18 ? "#10B981" : score <= -18 ? "#EF4444" : "#F59E0B";

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="130" viewBox="0 0 240 130">
        {/* Arco rojo */}
        <path d={pathArc(-180, -120, "#FCA5A5")} fill="none" stroke="#FCA5A5" strokeWidth="18" strokeLinecap="round" />
        {/* Arco amarillo */}
        <path d={pathArc(-120, -60, "#FDE68A")} fill="none" stroke="#FDE68A" strokeWidth="18" strokeLinecap="round" />
        {/* Arco verde */}
        <path d={pathArc(-60, 0, "#A7F3D0")} fill="none" stroke="#A7F3D0" strokeWidth="18" strokeLinecap="round" />

        {/* Aguja */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={gaugeColor} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill={gaugeColor} />

        {/* Labels */}
        <text x="22" y="118" fontSize="9" fontWeight="800" fill="#EF4444" textAnchor="middle">Negativo</text>
        <text x="120" y="30" fontSize="9" fontWeight="800" fill="#94A3B8" textAnchor="middle">Neutral</text>
        <text x="218" y="118" fontSize="9" fontWeight="800" fill="#10B981" textAnchor="middle">Positivo</text>
      </svg>
      <div className="text-center -mt-2">
        <span className="font-display text-3xl font-black" style={{ color: gaugeColor }}>{score > 0 ? "+" : ""}{score}</span>
        <p className="text-xs font-bold text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// NPS GAUGE (semi-arco SVG)
// ─────────────────────────────────────────────
function NpsGauge({ nps, total }: { nps: number; total: number }) {
  const clamped = Math.max(-100, Math.min(100, nps));
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cx = 100, cy = 90, r = 70;

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
        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{total} respuestas</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HEATMAP COMPONENT
// ─────────────────────────────────────────────
function HeatmapGrid({ courses, tags, cells }: {
  courses: string[];
  tags: string[];
  cells: Record<string, Record<string, { sum: number; count: number }>>;
}) {
  if (courses.length === 0) {
    return <p className="text-sm text-slate-400 font-medium text-center py-8">Sin datos disponibles — verificá que las encuestas tengan curso o colegio.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 pb-2 w-24">Curso</th>
            {tags.map((tag) => (
              <th key={tag} className="text-center text-[9px] font-black uppercase tracking-widest text-slate-400 pb-2 px-1">
                {tag.replace("Laboral/Recursos", "Laboral").replace("Infraestructura", "Infra")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {courses.map((curso) => (
            <tr key={curso}>
              <td className="text-[10px] font-black text-slate-700 pr-2 py-0.5 truncate max-w-[90px]">{curso}</td>
              {tags.map((tag) => {
                const cell = cells[curso]?.[tag];
                const avg = cell ? parseFloat((cell.sum / cell.count).toFixed(1)) : null;
                return (
                  <td key={tag} className="text-center py-0.5 px-0.5">
                    <div
                      className="rounded-lg px-1 py-2 text-[10px] font-black transition-all hover:scale-110 cursor-default"
                      style={{
                        backgroundColor: scoreToColor(avg),
                        color: scoreToTextColor(avg),
                        minWidth: "36px",
                      }}
                      title={avg !== null ? `${curso} × ${tag}: ${avg}/10 (${cell!.count} resp.)` : "Sin datos"}
                    >
                      {avg !== null ? avg : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-3 justify-end">
        {[
          { color: "#FCA5A5", label: "< 6" },
          { color: "#FDE68A", label: "6–7" },
          { color: "#A7F3D0", label: "≥ 7" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-[9px] font-bold text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TOOLTIP MATRIZ
// ─────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white">
      <p className="font-black text-slate-800 mb-2 border-b border-slate-100 pb-2 uppercase tracking-wide text-xs">{data.tag}</p>
      <p className="text-xs font-bold text-slate-600"><span className="text-indigo-500">Nota Promedio:</span> {data.x} / 10</p>
      <p className="text-xs font-bold text-slate-600 mt-1"><span className="text-emerald-500">Menciones:</span> {data.y}</p>
    </div>
  );
};

// ─────────────────────────────────────────────
// NORMALIZAR DB
// ─────────────────────────────────────────────
const normalizarDesdeDB = (rows: any[]) =>
  (rows || []).map((r: any) => {
    const score = Number(r.score) || 0;
    const tagsRaw: string[] = Array.isArray(r.tags)
      ? r.tags.map((t: any) => String(t))
      : typeof r.tags === "string"
      ? r.tags.replace(/[{}]/g, "").split(",").map((x: string) => x.trim()).filter(Boolean)
      : [];
    const tags = tagsRaw.length > 0 ? tagsRaw.map(canonTag) : ["General"];
    const nombre = String(r.nombre ?? "").trim();
    const apellido = String(r.apellido ?? "").trim();
    const displayName = nombre || apellido ? `${nombre} ${apellido}`.trim() : null;
    return {
      score,
      colegio: String(r.colegio ?? "Otros").trim(),
      type: score >= 9 ? "Promotor" : score >= 7 ? "Satisfecho" : "Insatisfecho",
      sexo: String(r.sexo ?? "N/A"),
      curso: String(r.curso ?? "-"),
      polo: String(r.polo ?? "General"),
      tags,
      positive: String(r.positive ?? ""),
      improvement: String(r.improvement ?? ""),
      displayName,
    };
  }).filter((r) => r.score > 0);

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
function AdvancedAnalyticsInner() {
  const { user } = useUser();
  const role = user?.publicMetadata?.role;
  const canUseChat = false;
  const scopedSchool = String(user?.publicMetadata?.colegio ?? user?.publicMetadata?.school ?? "").trim();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const [activeSchool, setActiveSchool] = useState("Todos los colegios");
  const [colegiosSurvey, setColegiosSurvey] = useState<string[]>(["Todos los colegios"]);
  const [encuestas, setEncuestas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    async function cargar() {
      if (!projectId) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const data = await obtenerEncuestasDB(projectId);
        const rows = Array.isArray(data) ? data : (data as any).rows || [];
        const procesado = normalizarDesdeDB(rows);
        setEncuestas(procesado);
        const schools = Array.from(new Set(procesado.map((r: any) => r.colegio)))
          .filter((c) => c && c !== "Otros" && normalize(c) !== "todos los colegios")
          .sort() as string[];
        if (scopedSchool) {
          setColegiosSurvey([scopedSchool]);
          setActiveSchool(scopedSchool);
        } else {
          setColegiosSurvey(["Todos los colegios", ...schools]);
        }
      } catch (e) {
        console.error(e);
        setEncuestas([]);
      } finally {
        setIsLoading(false);
      }
    }
    cargar();
  }, [projectId, scopedSchool]);

  const charts = useMemo(() => {
    if (!encuestas.length) return null;
    const matchSchool = (value: string, filter: string) => {
      const a = normalize(value);
      const b = normalize(filter);
      return a.includes(b) || b.includes(a);
    };
    const isGlobal = activeSchool === "Todos los colegios";
    const fd = isGlobal ? encuestas : encuestas.filter((r) => matchSchool(String(r.colegio ?? ""), activeSchool));

    // NPS
    const promoters = fd.filter((r) => r.score >= 9).length;
    const insatisfechos = fd.filter((r) => r.score > 0 && r.score < 7).length;
    const nps = fd.length ? Math.round(((promoters - insatisfechos) / fd.length) * 100) : 0;
    const avg = fd.length ? parseFloat((fd.reduce((a, r) => a + r.score, 0) / fd.length).toFixed(1)) : 0;

    // ── RANKING: siempre todos los colegios, resaltando el seleccionado
    const rankingMap: Record<string, { name: string; prom: number; insat: number; total: number; sumScore: number }> = {};
    encuestas.forEach((r) => {
      const key = String(r.colegio || "Sin especificar").trim();
      if (!rankingMap[key]) rankingMap[key] = { name: key, prom: 0, insat: 0, total: 0, sumScore: 0 };
      rankingMap[key].total++;
      rankingMap[key].sumScore += r.score;
      if (r.type === "Promotor") rankingMap[key].prom++;
      if (r.type === "Insatisfecho") rankingMap[key].insat++;
    });
    const rankingData = Object.values(rankingMap)
      .filter((s) => s.total >= 2)
      .map((s) => ({
        name: s.name.length > 16 ? s.name.substring(0, 14) + ".." : s.name,
        fullName: s.name,
        NPS: Math.round(((s.prom - s.insat) / s.total) * 100),
        avg: parseFloat((s.sumScore / s.total).toFixed(1)),
        total: s.total,
      }))
      .sort((a, b) => b.NPS - a.NPS);

    // ── RADAR y MATRIZ: usan fd (filtrado por colegio si aplica)
    const tagMap: Record<string, number> = { Docencia: 0, Infraestructura: 0, Normativas: 0, Actividades: 0, "Comunicación": 0, General: 0 };
    fd.forEach((r) => r.tags.forEach((t: string) => { if (tagMap[t] !== undefined) tagMap[t]++; }));
    const radarData = Object.keys(tagMap).map((key) => ({ subject: key, A: tagMap[key] }));

    const matrixMap: Record<string, { sum: number; count: number }> = {};
    fd.forEach((r) => r.tags.forEach((t: string) => {
      if (!matrixMap[t]) matrixMap[t] = { sum: 0, count: 0 };
      matrixMap[t].sum += r.score;
      matrixMap[t].count++;
    }));
    const matrixData = Object.keys(matrixMap).map((tag) => ({
      tag,
      x: parseFloat((matrixMap[tag].sum / matrixMap[tag].count).toFixed(1)),
      y: matrixMap[tag].count,
      z: matrixMap[tag].count * 15,
    }));

    // ── GÉNERO: usa fd
    const sexMap: Record<string, number> = {};
    fd.forEach((r) => {
      const s = normalize(r.sexo).includes("masc") ? "Varones" : normalize(r.sexo).includes("fem") ? "Mujeres" : "N/A";
      sexMap[s] = (sexMap[s] || 0) + 1;
    });
    const genderData = Object.keys(sexMap).filter((k) => k !== "N/A")
      .map((k) => ({ name: k, value: sexMap[k] }));

    // ── STACKED (Perfiles):
    //    Global → por colegio (comparar todos)
    //    Un colegio → por curso (desglosar ese colegio)
    const stackSource = fd;
    const stackGroupKey = isGlobal ? "colegio" : "polo";
    const stackedMap: Record<string, any> = {};
    stackSource.forEach((r) => {
      const p = String(r[stackGroupKey] || "Otros").trim();
      if (!stackedMap[p]) stackedMap[p] = { name: String(p).substring(0, 16), Promotores: 0, Satisfechos: 0, Insatisfechos: 0, total: 0 };
      stackedMap[p].total++;
      if (r.type === "Promotor") stackedMap[p].Promotores++;
      else if (r.type === "Satisfecho") stackedMap[p].Satisfechos++;
      else stackedMap[p].Insatisfechos++;
    });
    const stackedData = Object.values(stackedMap).sort((a, b) => b.total - a.total).slice(0, 8);
    const stackedLabel = isGlobal ? "Por colegio" : "Por polo/zona";

    // Insights
    const topWords = topWordsFromRows(fd, 12);
    const sentiment = getSentimentFromRows(fd);
    const tagTop = Object.entries(tagMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "General";

    const poloMap = new Map<string, number>();
    fd.forEach((r) => {
      const p = String(r.polo ?? "General").trim();
      poloMap.set(p, (poloMap.get(p) || 0) + 1);
    });
    const poloTop = Array.from(poloMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "General";

    const detrPct = fd.length ? Math.round((insatisfechos / fd.length) * 100) : 0;

    // Palabras positivas y de mejora
    const topPositiveWords = topWordsFromField(fd, "positive", 8);
    const topImprovementWords = topWordsFromField(fd, "improvement", 8);

    // ✅ Frases reales más representativas con el nuevo filtro
    const topPositivePhrases = topPhrasesFromField(fd, "positive", 5);
    const topImprovementPhrases = topPhrasesFromField(fd, "improvement", 5);

    // ✅ NUEVO: heatmap
    // Heatmap global: colegio × tema
    const heatmap = buildHeatmap(encuestas, "colegio");

    // Heatmap colegio: perfil (Promotor/Satisfecho/Insatisfecho) × tema
    const heatmapByProfile = buildHeatmapByProfile(fd);

    // Stacked por tema: qué perfil tiene cada tema en el colegio seleccionado
    const stackedByTag: any[] = [];
    const TAGS_LIST = ["Docencia","Infraestructura","Normativas","Actividades","Comunicación","General"];
    TAGS_LIST.forEach((tag) => {
      const tagRows = fd.filter((r: any) => r.tags.includes(tag));
      if (!tagRows.length) return;
      stackedByTag.push({
        name: tag,
        Promotores: tagRows.filter((r: any) => r.type === "Promotor").length,
        Satisfechos: tagRows.filter((r: any) => r.type === "Satisfecho").length,
        Insatisfechos: tagRows.filter((r: any) => r.type === "Insatisfecho").length,
        total: tagRows.length,
      });
    });
    stackedByTag.sort((a, b) => b.total - a.total);

    // ✅ NUEVO: distribución de notas 1-10
    const scoreDistRaw: Record<number, number> = {};
    for (let i = 1; i <= 10; i++) scoreDistRaw[i] = 0;
    fd.forEach((r) => { if (r.score >= 1 && r.score <= 10) scoreDistRaw[r.score]++; });
    const scoreDist = Object.entries(scoreDistRaw).map(([score, count]) => ({
      score: Number(score), count,
      fill: Number(score) >= 9 ? "#10B981" : Number(score) >= 7 ? "#F59E0B" : "#EF4444",
    }));

    // Keyword
    const keywordCount = countKeywordInRows(fd, keyword);
    const keywordByTagData = keywordByTag(fd, keyword).slice(0, 6);

    return {
      nps, avg, rankingData, radarData, matrixData, genderData, stackedData, stackedLabel, activeSchool,
      total: fd.length, topWords, sentiment, tagTop, poloTop, detrPct,
      topPositiveWords, topImprovementWords,
      topPositivePhrases, topImprovementPhrases,
      heatmap, heatmapByProfile, stackedByTag, scoreDist,
      keywordCount, keywordByTagData, promoters, insatisfechos,
      satisfechos: fd.filter((r) => r.score >= 7 && r.score <= 8).length,
    };
  }, [encuestas, activeSchool, keyword]);

  if (!projectId) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] font-sans">
        <header className="sticky top-0 z-40 border-b border-white bg-white/80 px-6 py-4 backdrop-blur-xl shadow-sm">
          <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4">
            <Link href="/dashboard" className="p-2 bg-slate-100 rounded-xl text-slate-500 hover:bg-slate-200 transition-all">
              <ArrowLeft size={20} weight="bold" />
            </Link>
            <h1 className="font-display text-xl font-black">Analytics Avanzado</h1>
          </div>
        </header>
        <main className="mx-auto mt-8 w-full max-w-[1200px] px-6">
          <div className="bg-white p-8 rounded-[32px] border border-white shadow-xl flex flex-col items-center py-20 text-center">
            <PresentationChart size={40} weight="duotone" className="text-blue-500 mb-4" />
            <h2 className="font-display text-2xl font-black text-slate-900">Elegí un proyecto</h2>
            <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-700 transition-all">
              <ArrowLeft size={18} weight="bold" /> Volver al Hub
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading || !charts) return <AnalyticsFallback />;

  return (
    <div className="min-h-screen bg-[#F4F7FB] pb-16 font-sans overflow-x-hidden text-slate-900">

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white bg-white/70 px-4 sm:px-6 py-3 backdrop-blur-xl shadow-sm shadow-blue-900/5">
        <div className="mx-auto w-full max-w-[1600px]">

          {/* ── DESKTOP ── */}
          <div className="hidden md:flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href={`/dashboard/surveys?projectId=${projectId}`}
                className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-white hover:shadow-lg transition-all border border-white backdrop-blur-xl"
              >
                <ArrowLeft size={17} weight="bold" className="text-blue-700" /> Volver
              </Link>
              <img src="/escudo-apdes.png" alt="APDES" className="h-9 w-auto object-contain drop-shadow-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div className="min-w-0">
                <h1 className="font-display text-base font-black tracking-tight text-slate-900">Centro de Comando</h1>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Analytics Avanzado</span>
              </div>
              <div className="h-7 w-px bg-slate-200" />
              <div className="relative flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 border border-white backdrop-blur-xl shadow-sm">
                <Buildings size={15} className="text-slate-400 shrink-0" />
                <select value={activeSchool} disabled={Boolean(scopedSchool)} onChange={(e) => setActiveSchool(e.target.value)}
                  className="appearance-none bg-transparent pr-7 text-sm font-bold outline-none cursor-pointer truncate max-w-[260px] text-blue-900 disabled:cursor-not-allowed disabled:text-slate-500">
                  {colegiosSurvey.map((col) => <option key={col} value={col}>{col}</option>)}
                </select>
                <CaretDown size={13} weight="bold" className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 border border-white backdrop-blur-xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                <MagnifyingGlass size={14} className="text-slate-400" weight="bold" />
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Explorar palabra..." className="w-32 bg-transparent text-sm font-bold outline-none text-slate-700 placeholder:text-slate-400" />
              </div>
              {canUseChat && (
                <Link href={`/dashboard/chat?projectId=${projectId}`}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-2 text-sm font-bold text-white transition-all shadow-sm">
                  <Sparkle size={14} weight="fill" /> Bot APDES
                </Link>
              )}
            </div>
          </div>

          {/* ── MOBILE: 2 filas limpias ── */}
          <div className="md:hidden space-y-2">
            {/* Fila 1: logo + título + user */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <img src="/escudo-apdes.png" alt="APDES" className="h-8 w-auto object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none">APDES</p>
                  <h1 className="font-display text-sm font-black text-slate-900 truncate">Centro de Comando</h1>
                </div>
              </div>
              <Link href={`/dashboard/surveys?projectId=${projectId}`}
                className="flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-2 text-xs font-bold text-slate-700 border border-white backdrop-blur-xl shrink-0">
                <ArrowLeft size={14} weight="bold" className="text-blue-700" /> Volver
              </Link>
            </div>

            {/* Fila 2: selector colegio full width */}
            <div className="relative flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2.5 border border-white backdrop-blur-xl shadow-sm w-full">
              <Buildings size={15} className="text-slate-400 shrink-0" />
              <select value={activeSchool} disabled={Boolean(scopedSchool)} onChange={(e) => setActiveSchool(e.target.value)}
                className="appearance-none bg-transparent pr-7 text-sm font-bold outline-none cursor-pointer w-full text-blue-900 disabled:cursor-not-allowed disabled:text-slate-500">
                {colegiosSurvey.map((col) => <option key={col} value={col}>{col}</option>)}
              </select>
              <CaretDown size={13} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none" />
            </div>

            {/* Fila 3: buscador full width */}
            <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2.5 border border-white backdrop-blur-xl w-full">
              <MagnifyingGlass size={14} className="text-slate-400 shrink-0" />
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder="Explorar palabra clave..." className="w-full bg-transparent text-sm font-bold outline-none text-slate-700 placeholder:text-slate-400" />
            </div>
          </div>

        </div>
      </header>

      <main className="mx-auto mt-8 w-full max-w-[1600px] px-6 space-y-6">

        {/* ══════════════════════════════════════
            FILA 1: NPS Gauge + Sentimiento + KPIs rápidos
            ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

          {/* NPS Gauge */}
          <div className="lg:col-span-3 bg-white/80 rounded-[28px] border border-white shadow-xl backdrop-blur-xl p-6 flex flex-col items-center justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">NPS del Proyecto</p>
            <NpsGauge nps={charts.nps} total={charts.total} />
            <div className="mt-4 grid grid-cols-3 gap-2 w-full">
              {[
                { label: "Promotores", value: charts.promoters, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Satisfechos", value: charts.satisfechos, color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Insatisf.", value: charts.insatisfechos, color: "text-red-600", bg: "bg-red-50" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-2 text-center`}>
                  <span className={`font-black text-lg ${color}`}>{value}</span>
                  <p className="text-[9px] font-bold text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sentimiento Gauge */}
          <div className="lg:col-span-3 bg-white/80 rounded-[28px] border border-white shadow-xl backdrop-blur-xl p-6 flex flex-col items-center justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Pulso Emocional</p>
            <p className="text-[9px] text-slate-400 font-medium mb-3">Basado en análisis de texto</p>
            <SentimentGauge score={charts.sentiment.score} label={charts.sentiment.label} />
            <div className="mt-3 flex gap-4 text-xs font-bold">
              <span className="text-emerald-600">{charts.sentiment.pos} señales positivas</span>
              <span className="text-slate-300">|</span>
              <span className="text-red-500">{charts.sentiment.neg} negativas</span>
            </div>
          </div>

          {/* Distribución notas 1-10 */}
          <div className="lg:col-span-3 bg-white/80 rounded-[28px] border border-white shadow-xl backdrop-blur-xl p-6 flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Distribución de Notas</p>
            <p className="text-xs font-medium text-slate-500 mb-3">Cada nota del 1 al 10</p>
            <div className="flex-1 min-h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.scoreDist} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                  <XAxis dataKey="score" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: "bold" }} />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.05)" }}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 20px rgba(0,0,0,0.08)", fontSize: 11 }}
                    formatter={(v) => [`${v} respuestas`, "Cantidad"]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={16}>
                    {charts.scoreDist.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Insights rápidos */}
          <div className="lg:col-span-3 bg-white/80 rounded-[28px] border border-white shadow-xl backdrop-blur-xl p-6 flex flex-col gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Insights Clave</p>
            {[
              { icon: <Hash size={14} weight="bold" />, label: "Tema principal", value: charts.tagTop, color: "text-indigo-500 bg-indigo-50" },
              { icon: <MapPin size={14} weight="bold" />, label: "Polo más activo", value: charts.poloTop, color: "text-teal-500 bg-teal-50" },
              { icon: <WarningOctagon size={14} weight="bold" />, label: "% Insatisfechos", value: `${charts.detrPct}%`, color: "text-red-500 bg-red-50" },
              { icon: <TrendUp size={14} weight="bold" />, label: "Nota promedio", value: `${charts.avg}/10`, color: "text-blue-500 bg-blue-50" },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="text-sm font-black text-slate-800 truncate">{value}</p>
                </div>
              </div>
            ))}

            {/* Keyword inline */}
            {normalize(keyword) && (
              <div className="mt-1 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-blue-400">"{keyword}" aparece</p>
                <p className="text-2xl font-black text-blue-600">{charts.keywordCount}×</p>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════
            FILA 2: Lo que MÁS GUSTA + Lo que PIDEN MEJORAR
            ══════════════════════════════════════ */}
        {/* ✅ FIX: items-start agregado para que no se estiren forzadamente */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-start">

          {/* Lo que más valoran — frases reales */}
          <div className="bg-white/80 rounded-[28px] border border-white shadow-xl backdrop-blur-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                <Heart size={18} weight="fill" />
              </div>
              <div>
                <h3 className="font-display text-base font-black text-slate-900">Lo que más valoran</h3>
                <p className="text-[10px] text-slate-400 font-medium">Las 5 frases positivas más representativas (tal como las escribieron)</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {charts.topPositivePhrases.length === 0 && (
                <p className="text-sm text-slate-400 font-medium">Sin comentarios positivos disponibles.</p>
              )}
              {charts.topPositivePhrases.map((item: any, i: number) => (
                <div key={i} className="flex gap-3 items-start bg-emerald-50/60 border border-emerald-100 rounded-2xl px-4 py-3">
                  <span className="shrink-0 font-black text-emerald-400 text-xs mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 leading-relaxed italic">&ldquo;{item.phrase}&rdquo;</p>
                    {item.name && (
                      <p className="text-[10px] font-bold text-emerald-500 mt-1">— {item.name} · nota {item.score}/10</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lo que piden mejorar — frases reales */}
          <div className="bg-white/80 rounded-[28px] border border-white shadow-xl backdrop-blur-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 text-amber-600 p-2 rounded-xl">
                <ArrowRight size={18} weight="bold" />
              </div>
              <div>
                <h3 className="font-display text-base font-black text-slate-900">Lo que más piden mejorar</h3>
                <p className="text-[10px] text-slate-400 font-medium">Las 5 frases de mejora más representativas (tal como las escribieron)</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {charts.topImprovementPhrases.length === 0 && (
                <p className="text-sm text-slate-400 font-medium">Sin comentarios de mejora disponibles.</p>
              )}
              {charts.topImprovementPhrases.map((item: any, i: number) => (
                <div key={i} className="flex gap-3 items-start bg-amber-50/60 border border-amber-100 rounded-2xl px-4 py-3">
                  <span className="shrink-0 font-black text-amber-400 text-xs mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 leading-relaxed italic">&ldquo;{item.phrase}&rdquo;</p>
                    {item.name && (
                      <p className="text-[10px] font-bold text-amber-500 mt-1">— {item.name} · nota {item.score}/10</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════
            FILA 3: Matriz Prioridad + Radar + Ranking
            ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Ranking NPS */}
          <div className="lg:col-span-3 bg-white/80 p-6 rounded-[28px] border border-white shadow-xl backdrop-blur-xl flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg"><TrendUp size={15} /></div>
              <h3 className="text-sm font-black uppercase tracking-tight text-indigo-600">Ranking NPS</h3>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mb-3">NPS por colegio (mín. 3 respuestas)</p>
            <div className="flex-1 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.rankingData} layout="vertical" margin={{ top: 0, right: 25, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" domain={[-100, 100]} hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748B", fontWeight: "bold" }} width={82} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 20px rgba(0,0,0,0.05)", fontSize: 11 }} />
                  <Bar dataKey="NPS" radius={[0, 6, 6, 0]} barSize={16}>
                    {charts.rankingData.map((e: any, i: number) => {
                      const isSelected = charts.activeSchool === "Todos los colegios" ||
                        e.fullName === charts.activeSchool;
                      const color = e.NPS >= 50 ? "#10B981" : e.NPS >= 0 ? "#6366F1" : "#EF4444";
                      return <Cell key={i} fill={color} opacity={isSelected ? 1 : 0.25} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Matriz de Prioridad */}
          <div className="lg:col-span-7 bg-white/90 p-7 rounded-[32px] border border-white shadow-2xl backdrop-blur-2xl flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-red-100 text-red-600 p-2 rounded-2xl"><WarningOctagon size={22} weight="fill" /></div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Matriz de Prioridad</h3>
                <p className="text-xs font-medium text-slate-500">Urgencia (menciones) vs. Satisfacción (nota)</p>
              </div>
            </div>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest mb-4 bg-slate-50 self-start px-4 py-2 rounded-xl border border-slate-100">
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-full" /> Riesgo</span>
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" /> Fortaleza</span>
            </div>
            <div className="flex-1 min-h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 40, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="x" name="Satisfacción" domain={[0, 10]}
                    label={{ value: "Nota Promedio / 10", position: "bottom", fontSize: 10, fill: "#64748B", fontWeight: "bold", offset: 0 }}
                    tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <YAxis type="number" dataKey="y" name="Urgencia" domain={[0, "dataMax + 10"]}
                    label={{ value: "Menciones", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748B", fontWeight: "bold", offset: 15 }}
                    tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
                  <ZAxis type="number" dataKey="z" range={[400, 3000]} />
                  <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#cbd5e1" }} />
                  <Scatter data={charts.matrixData}>
                    {charts.matrixData.map((e: any, i: number) => (
                      <Cell key={i} fill={e.x < 7 ? "#EF4444" : "#10B981"} fillOpacity={0.75} stroke={e.x < 7 ? "#B91C1C" : "#047857"} strokeWidth={2} />
                    ))}
                    <LabelList dataKey="tag" position="top" style={{ fontSize: "10px", fontWeight: "900", fill: "#334155" }} offset={20} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Radar temático */}
          <div className="lg:col-span-2 bg-white/80 p-6 rounded-[28px] border border-white shadow-xl backdrop-blur-xl flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-purple-100 text-purple-600 p-1.5 rounded-lg"><Target size={15} /></div>
              <h3 className="text-sm font-black uppercase tracking-tight text-purple-600">Radar Temático</h3>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mb-2">Volumen de menciones por categoría</p>
            <div className="flex-1 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="65%" data={charts.radarData}>
                  <PolarGrid stroke="#E2E8F0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#475569", fontSize: 9, fontWeight: "bold" }} />
                  <Radar name="Menciones" dataKey="A" stroke="#8B5CF6" strokeWidth={2} fill="#A78BFA" fillOpacity={0.55} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 20px rgba(0,0,0,0.05)", fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════
            FILA 4: Mapa de Calor + Perfiles apilados
            Global → por colegio | Colegio → perfil×tema y tema×perfil
            ══════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* MAPA DE CALOR */}
          <div className="lg:col-span-6 bg-white/80 p-6 rounded-[28px] border border-white shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-xl">
                <ChartBar size={18} weight="fill" />
              </div>
              <div>
                <h3 className="font-display text-base font-black text-slate-900">Mapa de Calor</h3>
                <p className="text-[10px] text-slate-400 font-medium">
                  {charts.activeSchool === "Todos los colegios"
                    ? "Nota promedio por Colegio × Tema — verde bueno, rojo problema"
                    : "Nota promedio por Perfil × Tema — qué temas lastiman a cada perfil"}
                </p>
              </div>
            </div>
            <HeatmapGrid
              courses={charts.activeSchool === "Todos los colegios" ? charts.heatmap.courses : charts.heatmapByProfile.courses}
              tags={charts.activeSchool === "Todos los colegios" ? charts.heatmap.tags : charts.heatmapByProfile.tags}
              cells={charts.activeSchool === "Todos los colegios" ? charts.heatmap.cells : charts.heatmapByProfile.cells}
            />
          </div>

          {/* PERFILES APILADOS */}
          <div className="lg:col-span-3 bg-white/80 p-6 rounded-[28px] border border-white shadow-xl backdrop-blur-xl flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-amber-100 text-amber-500 p-1.5 rounded-lg"><MapPin size={15} /></div>
              <h3 className="text-sm font-black uppercase tracking-tight text-amber-500">
                {charts.activeSchool === "Todos los colegios" ? "Perfiles por colegio" : "Perfiles por tema"}
              </h3>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mb-3">
              {charts.activeSchool === "Todos los colegios"
                ? "Promotores / Satisfechos / Insatisfechos por colegio"
                : "Qué perfil predomina en cada tema"}
            </p>
            <div className="flex-1 min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.activeSchool === "Todos los colegios" ? charts.stackedData : charts.stackedByTag}
                  layout="vertical"
                  margin={{ top: 0, right: 0, left: -10, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: "bold", fill: "#475569" }} width={82} />
                  <Tooltip cursor={{ fill: "#F8FAFC" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 20px rgba(0,0,0,0.05)", fontSize: 11 }} />
                  <Bar dataKey="Promotores" stackId="a" fill="#10B981" barSize={16} />
                  <Bar dataKey="Satisfechos" stackId="a" fill="#FBBF24" />
                  <Bar dataKey="Insatisfechos" stackId="a" fill="#F87171" radius={[0, 4, 4, 0]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "9px", fontWeight: "bold" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top palabras + keyword */}
          <div className="lg:col-span-3 bg-white/80 p-6 rounded-[28px] border border-white shadow-xl backdrop-blur-xl flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-slate-100 text-slate-600 p-1.5 rounded-lg"><Hash size={15} /></div>
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-600">Top Términos</h3>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mb-3">Palabras más frecuentes en todos los comentarios</p>
            <div className="flex-1 min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.topWords} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="word" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#475569", fontWeight: "bold" }} width={78} />
                  <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 20px rgba(0,0,0,0.05)", fontSize: 11 }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={11}>
                    {charts.topWords.map((_: any, i: number) => (
                      <Cell key={i} fill={i < 3 ? "#3B82F6" : "#94A3B8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {normalize(keyword) && charts.keywordByTagData.length > 0 && (
              <div className="mt-3 bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-2">"{keyword}" por categoría</p>
                <div className="flex flex-wrap gap-1.5">
                  {charts.keywordByTagData.map((x: any) => (
                    <span key={x.tag} className="rounded-lg border border-white bg-white px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm">
                      {x.tag} <span className="text-blue-400">· {x.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════
            FILA 5: Género (si hay datos)
            ══════════════════════════════════════ */}
        {charts.genderData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 bg-white/80 p-6 rounded-[28px] border border-white shadow-xl backdrop-blur-xl flex flex-col">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Participación por Sexo</p>
              <p className="text-[10px] text-slate-400 font-medium mb-2">Distribución demográfica</p>
              <div className="flex-1 min-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={charts.genderData} innerRadius={50} outerRadius={75} paddingAngle={5} dataKey="value">
                      {charts.genderData.map((entry: any, idx: number) => (
                        <Cell key={idx} stroke="none" fill={entry.name === "Mujeres" ? "#F472B6" : "#38BDF8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 20px rgba(0,0,0,0.05)", fontSize: 11 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "bold", color: "#475569" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="lg:col-span-8 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 rounded-[28px] border border-blue-100/50 p-6 flex items-center gap-6">
              <Sparkle size={40} weight="duotone" className="text-blue-400 shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Recordatorio estratégico</p>
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  {canUseChat
                    ? <>Para un análisis más profundo, usá el <span className="font-black text-blue-700">Bot APDES</span> y preguntá directamente: <em>&ldquo;¿Qué plan de acción hago para el tema {charts.tagTop}?&rdquo;</em></>
                    : <>Tu foco de Dirección hoy: revisar <span className="font-black text-blue-700">tema crítico + fortaleza principal</span> y cerrar una acción concreta con responsable.</>}
                </p>
                {canUseChat && (
                  <Link
                    href={`/dashboard/chat?projectId=${projectId}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-black text-white transition-all"
                  >
                    <Sparkle size={13} weight="fill" /> Abrir Bot APDES
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
