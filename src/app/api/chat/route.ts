// app/api/chat/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@clerk/nextjs/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";

// --------------------
// RATE LIMITER en memoria (simple, sin dependencias extra)
// Ventana de 60 segundos, máx 10 requests por usuario
// --------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { ok: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

// Limpieza periódica del map para evitar memory leaks en el servidor
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000); // cada 5 minutos

// --------------------
// TIPOS Y HELPERS
// --------------------
type SurveyRow = {
  colegio?: string;
  curso?: string;
  polo?: string;
  sexo?: string;
  score?: number | string;
  positive?: string;
  improvement?: string;
  tags?: any;
};

const normalize = (str?: string | null) =>
  String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const parseTags = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[{}]/g, "").trim();
    if (!cleaned) return [];
    return cleaned.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
};

function bucket(score: number) {
  if (score >= 9) return "Promotor";
  if (score >= 7) return "Pasivo";
  if (score > 0) return "Detractor";
  return "Sin score";
}

function buildCompactContext(rows: SurveyRow[], scopeSchool: string) {
  const scoped =
    scopeSchool && scopeSchool !== "Todos los colegios"
      ? rows.filter((r) => normalize(r.colegio) === normalize(scopeSchool))
      : rows;

  const total = scoped.length;
  const scores = scoped.map((r) => Number(r.score) || 0).filter((n) => n > 0);
  const avg = scores.length
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : "0.0";

  const promoters = scoped.filter((r) => (Number(r.score) || 0) >= 9).length;
  const passives = scoped.filter((r) => {
    const s = Number(r.score) || 0;
    return s >= 7 && s <= 8;
  }).length;
  const detractors = scoped.filter((r) => {
    const s = Number(r.score) || 0;
    return s > 0 && s < 7;
  }).length;

  const nps = total ? Math.round(((promoters - detractors) / total) * 100) : 0;

  const tagCount = new Map<string, number>();
  for (const r of scoped) {
    for (const t of parseTags(r.tags)) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  const topTags = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const examples = scoped
    .filter((r) => (r.positive || r.improvement) && (Number(r.score) || 0) > 0)
    .slice(0, 18)
    .map((r) => ({
      score: Number(r.score) || 0,
      perfil: bucket(Number(r.score) || 0),
      colegio: r.colegio ?? "",
      curso: r.curso ?? "",
      polo: r.polo ?? "",
      positivo: String(r.positive ?? "").slice(0, 220),
      mejora: String(r.improvement ?? "").slice(0, 220),
      tags: parseTags(r.tags).slice(0, 5),
    }));

  return {
    scope: scopeSchool,
    metrics: { total, avg, nps, promoters, passives, detractors },
    topTags,
    examples,
  };
}

function buildTopComplaints(rows: SurveyRow[], scopeSchool: string) {
  const scoped =
    scopeSchool && scopeSchool !== "Todos los colegios"
      ? rows.filter((r) => normalize(r.colegio) === normalize(scopeSchool))
      : rows;

  const target = scoped.filter((r) => {
    const s = Number(r.score) || 0;
    const b = bucket(s);
    return (b === "Pasivo" || b === "Detractor") && String(r.improvement ?? "").trim();
  });

  const tagCount = new Map<string, number>();
  const evidence: Record<string, string[]> = {};

  for (const r of target) {
    const txt = String(r.improvement ?? "").trim();
    const tags = parseTags(r.tags);
    for (const t of tags) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      evidence[t] = evidence[t] ?? [];
      if (evidence[t].length < 2) evidence[t].push(txt.slice(0, 160));
    }
  }

  const topTags = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count, evidence: evidence[tag] ?? [] }));

  if (topTags.length) return topTags;

  const keys = [
    { k: "Infraestructura", words: ["baño", "techo", "limpieza", "aula", "silla", "mobiliario", "calor", "frio", "patio"] },
    { k: "Comunicación", words: ["comunic", "avis", "respuesta", "inform", "whatsapp", "mail"] },
    { k: "Normativas/Organización", words: ["norma", "regla", "orden", "entrada", "salida", "uniforme"] },
    { k: "Actividades", words: ["actividad", "evento", "taller", "salida", "viaje", "deporte"] },
    { k: "Docencia", words: ["docente", "profesor", "clase", "enseñ", "metodo", "conten"] },
  ];

  const count: Record<string, number> = {};
  const evid: Record<string, string[]> = {};

  for (const r of target) {
    const txtNorm = normalize(r.improvement);
    if (!txtNorm) continue;
    for (const item of keys) {
      if (item.words.some((w) => txtNorm.includes(w))) {
        count[item.k] = (count[item.k] ?? 0) + 1;
        evid[item.k] = evid[item.k] ?? [];
        if (evid[item.k].length < 2) evid[item.k].push(String(r.improvement).slice(0, 160));
        break;
      }
    }
  }

  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, c]) => ({ tag, count: c, evidence: evid[tag] ?? [] }));
}

function plan30(tag: string) {
  const plans: Record<string, string> = {
    Infraestructura: `- **Semana 1:** checklist + 3 quick wins visibles (baños/limpieza/arreglos chicos).
- **Semana 2:** tablero (problema → responsable → fecha) + comunicar avances.
- **Semana 3:** resolver el punto #1 más citado + control de calidad.
- **Semana 4:** encuesta flash (2 preguntas) y cierre con evidencia.
**KPI:** reclamos por infra, tiempo de resolución, pasivos→promotores.`,
    Comunicación: `- **Semana 1:** micro-reporte semanal + canal único.
- **Semana 2:** estandarizar "momento puerta" (saludo + feedback breve).
- **Semana 3:** SLA <24h para respuestas + templates.
- **Semana 4:** encuesta flash a pasivos: "¿qué faltó para 9–10?"
**KPI:** menciones a comunicación, tiempo de respuesta, pasivos→promotores.`,
    "Normativas/Organización": `- **Semana 1:** unificar criterios + 1 página a familias.
- **Semana 2:** aplicar consistente + canal de dudas.
- **Semana 3:** ajustar 1–2 fricciones.
- **Semana 4:** medir con encuesta flash.
**KPI:** quejas por normas, promedio, NPS.`,
    Actividades: `- **Semana 1:** calendarizar 1 actividad "wow simple" y comunicar.
- **Semana 2:** ejecutar + registrar aprendizajes.
- **Semana 3:** iterar (mejorar detalles).
- **Semana 4:** encuesta flash post-actividad.
**KPI:** menciones positivas, asistencia, mejora en score.`,
    Docencia: `- **Semana 1:** detectar 2 patrones en comentarios (rutinas/contención/claridad).
- **Semana 2:** micro-acuerdos de aula + comunicar a familias.
- **Semana 3:** observación corta + feedback entre pares.
- **Semana 4:** seguimiento y medición.
**KPI:** texto positivo, promedio por sala/curso.`,
    General: `- **Semana 1:** detectar 3 quick wins por frecuencia.
- **Semana 2:** ejecutar + comunicar avances.
- **Semana 3:** ajustar según feedback.
- **Semana 4:** medir impacto y sostener.
**KPI:** NPS, promedio, volumen de quejas.`,
  };
  return plans[tag] || plans.General;
}

async function assertProjectOwner(db: any, projectId: string, userId: string) {
  const rows = await db`
    SELECT 1
    FROM projects
    WHERE id = ${projectId}::uuid
      AND usuario_id = ${userId}
    LIMIT 1
  `;
  if (!rows || rows.length === 0) throw new Error("FORBIDDEN");
}

async function getSurveysFromDB(projectId: string): Promise<SurveyRow[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT colegio, curso, polo, sexo, score, positive, improvement, tags
    FROM encuestas
    WHERE project_id = ${projectId}::uuid
    LIMIT 3000
  `;
  return (rows as any[]) || [];
}

const RequestBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  projectId: z.string().uuid("projectId debe ser un UUID válido"),
  scopeSchool: z.string().max(200).default("Todos los colegios"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const rl = checkRateLimit(session.userId);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intentá en ${rl.retryAfterSeconds}s.` },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSeconds),
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          },
        }
      );
    }

    if (!process.env.GEMINI_API_KEY || !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = RequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { prompt, projectId, scopeSchool } = parsed.data;

    const db = neon(process.env.DATABASE_URL!);
    try {
      await assertProjectOwner(db, projectId, session.userId);
    } catch {
      return NextResponse.json({ error: "Sin permisos para este proyecto" }, { status: 403 });
    }

    const rows = await getSurveysFromDB(projectId);
    const context = buildCompactContext(rows, scopeSchool);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ✅ PROMPT ESTRICTO DE MCKINSEY: SÍNTESIS, LIMPIEZA DE TAGS E INTELIGENCIA
    const systemPrompt = `
Sos el "Bot APDES", un Director de Analítica de Datos (ex-McKinsey) de una red de colegios de primer nivel.
Tu objetivo es leer el JSON provisto y generar respuestas ejecutivas impecables para la Dirección General.

REGLAS DE ORO PARA GENERAR TABLAS Y MATRICES:
1. SÍNTESIS EJECUTIVA (PROHIBIDO COPIAR Y PEGAR): Nunca repitas el texto informal del padre. Transformá el reclamo en una "Problemática de Negocio" profesional y concisa.
   - INCORRECTO: "Me parece más prolijo que las chicas anden con el pelo atado."
   - CORRECTO: "Solicitud de mayor rigor en el cumplimiento del uniforme (cabello recogido)."
   - INCORRECTO: "El estacionamiento de los Candiles, la gente hace lo que quiere."
   - CORRECTO: "Desorden logístico y vial en el área de estacionamiento durante horarios de ingreso/egreso."
2. FORMATO DE ETIQUETAS LIMPIO: NUNCA imprimas arrays de JSON (como ["Docencia", "Actividades"]). Debes imprimir las etiquetas como texto normal separado por comas: "Docencia, Actividades".
3. CORRECCIÓN LÓGICA DE ETIQUETAS: Si el JSON trae un tag erróneo (ej. un problema de "Estacionamiento" etiquetado erróneamente como "Docencia"), aplicá tu criterio analítico y corregilo en tu respuesta (ej. poné "Logística/Infraestructura").
4. ESTRUCTURA VISUAL: No uses celdas vacías como separadores en las tablas. Usá subtítulos Markdown (###) para categorizar (ej. ### Resolución Rápida) y armá una tabla distinta debajo de cada uno.

TONO Y ESTILO:
- Directo, estratégico y orientado a la acción. 
- No menciones la palabra "JSON" ni digas que sos una IA. Hablá siempre de "nuestra base de respuestas".

SISTEMA DE GRÁFICOS:
Si la pregunta pide comparar, ver distribución, ranking o algo visual, incluí al FINAL de tu respuesta un bloque con este formato exacto (solo UN gráfico):
<CHART>
{
  "type": "bar" | "pie" | "line",
  "title": "Título descriptivo",
  "data": [{"name": "Eje 1", "value": 40}, {"name": "Eje 2", "value": 60}],
  "color": "#3B82F6"
}
</CHART>

CONTEXTO DE DATOS REALES:
${JSON.stringify(context)}
`;

    const result = await model.generateContent([
      systemPrompt,
      `Pregunta del Director: ${prompt}`,
    ]);

    let rawText = String(result.response.text?.() ?? "").trim();

    let chart: any = null;
    const chartMatch = rawText.match(/<CHART>([\s\S]*?)<\/CHART>/);
    if (chartMatch) {
      try {
        chart = JSON.parse(chartMatch[1].trim());
        if (!chart.type || !Array.isArray(chart.data)) chart = null;
      } catch { chart = null; }
      rawText = rawText.replace(/<CHART>[\s\S]*?<\/CHART>/, "").trim();
    }

    const text = rawText;

    if (!text) {
      const top3 = buildTopComplaints(rows, scopeSchool);
      const md = `## Top 3 quejas (Insatisfechos + Satisfechos) — ${scopeSchool}

${
  top3.length
    ? top3
        .map((c, i) => {
          const evid = c.evidence?.length
            ? c.evidence.map((e: string) => `> ${e}`).join("\n")
            : "> (sin citas textuales disponibles)";
          return `### ${i + 1}) ${c.tag} (${c.count})
**Evidencia (muestras):**
${evid}

**Plan 30 días**
${plan30(c.tag)}
`;
        })
        .join("\n")
    : "No encontré suficientes mejoras/quejas para construir un Top 3."
}

Si querés, lo convierto en **tabla (problema → acción → responsable → plazo → KPI)** para directivos.`;

      return NextResponse.json({ text: md, chart: null });
    }

    return NextResponse.json({ text, chart });
  } catch (error: any) {
    console.error("❌ ERROR API CHAT:", error);
    return NextResponse.json(
      { error: "Ocurrió un error interno." },
      { status: 500 }
    );
  }
}