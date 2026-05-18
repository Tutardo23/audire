// src/app/api/report/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { tema, scope, comentarios, stats } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Estadísticas cuantitativas detalladas
    const statsContext = stats
      ? `
DATOS CUANTITATIVOS DE LA MUESTRA (usar en sección 2):
- Total de encuestas con mención al tema: ${stats.total}
- NPS de la muestra: ${stats.nps} puntos
- Promotores (9-10): ${stats.promoters}% (${stats.promoterCount} familias)
- Satisfechos (7-8): ${stats.satisfiedPct}% (${stats.satisfiedCount} familias)
- Insatisfechos (1-6): ${stats.detractors}% (${stats.detractorCount} familias)
- Promedio de nota: ${stats.avgScore}/10
- Tono Constructivo: ${stats.sent.pos}%
- Tono Molesto/Furioso: ${stats.sent.neg}%
- Colegios representados: ${stats.colegios?.join(", ") || scope}
`
      : "";

    // Ejemplos de citas por perfil para que la IA no invente
    const citasPromotores = comentarios
      .filter((c: any) => c.perfil === "Promotor" && c.positivo?.length > 20)
      .slice(0, 6)
      .map((c: any) => `[${c.perfil} - ${c.colegio} - Nota ${c.nota}] Lo positivo: "${c.positivo}"`)
      .join("\n");

    const citasInsatisfechos = comentarios
      .filter((c: any) => c.perfil === "Insatisfecho" && c.mejora?.length > 20)
      .slice(0, 8)
      .map((c: any) => `[${c.perfil} - ${c.colegio} - Nota ${c.nota}] Mejora: "${c.mejora}"`)
      .join("\n");

    const citasSatisfechos = comentarios
      .filter((c: any) => c.perfil === "Satisfecho")
      .slice(0, 4)
      .map((c: any) => `[${c.perfil} - ${c.colegio} - Nota ${c.nota}] "${c.mejora || c.positivo}"`)
      .join("\n");

    const prompt = `Actuá como un Consultor Estratégico Educativo Senior (estilo McKinsey/Audire).
Redactá un "Informe Estratégico Institucional de Alta Dirección" sobre: "${tema}".
Alcance: ${scope}.

${statsContext}

CITAS REALES DE FAMILIAS PROMOTORAS (nota 9-10):
${citasPromotores || "(sin citas de promotores disponibles)"}

CITAS REALES DE FAMILIAS SATISFECHAS (nota 7-8):
${citasSatisfechos || "(sin citas de satisfechos disponibles)"}

CITAS REALES DE FAMILIAS INSATISFECHAS (nota 1-6):
${citasInsatisfechos || "(sin citas de insatisfechos disponibles)"}

REGLAS DE REDACCIÓN — CRÍTICAS:
1. CITAS OBLIGATORIAS: Cada hallazgo debe respaldarse con citas textuales REALES de arriba. Nunca inventes. Formato: *un padre Insatisfecho del Colegio X reclama que "..."*
2. DATOS NUMÉRICOS: Integra los porcentajes y números del contexto cuantitativo en el cuerpo del texto. No los pongas solo en una lista, intégralos en las oraciones.
3. TONO: Hiper ejecutivo, objetivo, directo. Sin frases vacías como "es importante destacar".
4. LONGITUD: El informe debe ser sustancioso. Mínimo 600 palabras en el cuerpo.
5. BLOCKQUOTES: Usá > de Markdown para citas largas e impactantes que merezcan destacarse.
6. NUNCA uses "JSON", "array", "payload" ni ningún término técnico.

ESTRUCTURA OBLIGATORIA:

# ${tema}
**Alcance:** ${scope} | **Fuente:** Encuestas de Satisfacción Audire | **Fecha:** ${new Date().toLocaleDateString('es-AR')}

---

## 1. Resumen Ejecutivo
2-3 oraciones. La conclusión principal. ¿Crisis, oportunidad o fortaleza? Incluí el NPS de la muestra.

## 2. Diagnóstico de la Muestra
Integrá los datos cuantitativos en prosa (no en lista). Mencioná cuántas familias hablaron del tema, el NPS, los perfiles y el tono predominante. Usá 1 o 2 citas breves aquí.

## 3. Fortalezas Detectadas
Las alegrías genuinas que expresan los promotores. Con citas textuales. Agrupadas por subtema si aplica.

## 4. Fricciones y Dolores Prioritarios
El núcleo del informe. Agrupá los problemas por subtema (ej: Infraestructura, Docentes, Organización, Costos). Para cada subtema: qué dicen los números + qué dicen las familias (cita). Identifica cuál es el "dolor #1".

## 5. Hipótesis Estratégicas
2-3 hipótesis de por qué ocurre esto y cuál es el riesgo institucional si no se actúa. Sé específico.

## 6. Hoja de Ruta — Próximos 30 días
Máximo 3 acciones concretas, ejecutables y con responsable sugerido. Formato: **Acción**: descripción. **Responsable**: quién. **Impacto esperado**: qué cambia.`;

    const result = await model.generateContent(prompt);
    const reportText = result.response.text()?.trim() || "No se pudo generar el informe.";

    return NextResponse.json({ report: reportText });
  } catch (error: any) {
    console.error("❌ ERROR API REPORT:", error);
    return NextResponse.json({ error: "Ocurrió un error al generar el informe." }, { status: 500 });
  }
}