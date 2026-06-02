"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { neon } from "@neondatabase/serverless";
import { del } from "@vercel/blob";

const sql = neon(process.env.DATABASE_URL!);

type UserRole = "admin" | "equipo" | "oficina" | "director" | "director_polo" | "unknown";

type UserScope = {
  userId: string;
  role: UserRole;
  colegio: string;
  polo: string;
};

export type MaterialInterno = {
  id: string;
  titulo: string;
  descripcion: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  pathname: string;
  colegio: string;
  polo: string;
  year: number | null;
  visiblePara: "todos" | "polo" | "colegio";
  createdBy: string;
  createdAt: string;
};

export type MaterialesPageData = {
  materiales: MaterialInterno[];
  canUpload: boolean;
  scope: {
    role: UserRole;
    colegio: string;
    polo: string;
  };
};

export type CrearMaterialInput = {
  titulo: string;
  descripcion?: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
  pathname: string;
  colegio?: string;
  polo?: string;
  year?: number | null;
  visiblePara?: "todos" | "polo" | "colegio";
};

const normalize = (value?: string | null) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'´`.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRole = (value?: unknown): UserRole => {
  const role = normalize(String(value ?? ""));

  if (role === "admin") return "admin";
  if (role === "equipo") return "equipo";
  if (role === "oficina" || role === "oficina central") return "oficina";
  if (role === "director") return "director";
  if (role === "director_polo" || role === "director polo" || role === "director de polo" || role === "director-polo") {
    return "director_polo";
  }

  return "unknown";
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

async function getUserScope(): Promise<UserScope> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autorizado.");

  const user = await currentUser();
  const publicMetadata = (user?.publicMetadata ?? {}) as Record<string, unknown>;
  const privateMetadata = (user?.privateMetadata ?? {}) as Record<string, unknown>;
  const unsafeMetadata = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;

  const role = normalizeRole(
    publicMetadata.role ?? privateMetadata.role ?? unsafeMetadata.role ?? publicMetadata.perfil ?? privateMetadata.perfil,
  );

  const colegio = firstString(
    publicMetadata.colegio,
    privateMetadata.colegio,
    unsafeMetadata.colegio,
    publicMetadata.school,
    privateMetadata.school,
  );

  const polo = firstString(
    publicMetadata.polo,
    privateMetadata.polo,
    unsafeMetadata.polo,
  );

  return { userId, role, colegio, polo };
}

const canUploadMaterial = (scope: UserScope) => scope.role === "admin";
const canManageMaterials = (scope: UserScope) => scope.role === "admin";

function userCanSeeMaterial(scope: UserScope, material: Pick<MaterialInterno, "visiblePara" | "colegio" | "polo">) {
  // Admin puede gestionar/ver todo para subir y borrar. Equipo y Oficina NO ven materiales.
  if (canManageMaterials(scope)) return true;
  if (scope.role === "equipo" || scope.role === "oficina") return false;

  if (material.visiblePara === "todos") return scope.role === "director" || scope.role === "director_polo";

  if (scope.role === "director") {
    if (!scope.colegio) return false;
    return material.visiblePara === "colegio" && normalize(material.colegio) === normalize(scope.colegio);
  }

  if (scope.role === "director_polo") {
    if (!scope.polo) return false;
    if (material.visiblePara === "polo" && normalize(material.polo) === normalize(scope.polo)) return true;
    if (material.visiblePara === "colegio" && normalize(material.polo) === normalize(scope.polo)) return true;
  }

  return false;
}

async function ensureMaterialesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS materiales_directores (
      id text PRIMARY KEY,
      titulo text NOT NULL,
      descripcion text NOT NULL DEFAULT '',
      filename text NOT NULL DEFAULT '',
      content_type text NOT NULL DEFAULT 'application/pdf',
      size_bytes integer NOT NULL DEFAULT 0,
      url text NOT NULL DEFAULT '',
      pathname text NOT NULL DEFAULT '',
      colegio text NOT NULL DEFAULT '',
      polo text NOT NULL DEFAULT '',
      year integer,
      visible_para text NOT NULL DEFAULT 'todos',
      created_by text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE materiales_directores ADD COLUMN IF NOT EXISTS pathname text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE materiales_directores ADD COLUMN IF NOT EXISTS filename text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE materiales_directores ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'application/pdf'`;
  await sql`ALTER TABLE materiales_directores ADD COLUMN IF NOT EXISTS size_bytes integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE materiales_directores ADD COLUMN IF NOT EXISTS visible_para text NOT NULL DEFAULT 'todos'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_materiales_directores_created_at ON materiales_directores (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_materiales_directores_scope ON materiales_directores (visible_para, colegio, polo, year)`;
}

function mapMaterialRow(row: Record<string, unknown>): MaterialInterno {
  const visible = String(row.visible_para ?? "todos");
  return {
    id: String(row.id ?? ""),
    titulo: String(row.titulo ?? ""),
    descripcion: String(row.descripcion ?? ""),
    filename: String(row.filename ?? ""),
    contentType: String(row.content_type ?? "application/pdf"),
    sizeBytes: Number(row.size_bytes ?? 0),
    url: String(row.url ?? ""),
    pathname: String(row.pathname ?? ""),
    colegio: String(row.colegio ?? ""),
    polo: String(row.polo ?? ""),
    year: row.year == null ? null : Number(row.year),
    visiblePara: visible === "polo" || visible === "colegio" ? visible : "todos",
    createdBy: String(row.created_by ?? ""),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
  };
}

export async function obtenerMaterialesPageDataDB(): Promise<MaterialesPageData> {
  const scope = await getUserScope();
  await ensureMaterialesTable();

  // Lectura liviana: solo metadata. No trae PDFs desde Blob.
  const rows = await sql`
    SELECT
      id,
      titulo,
      descripcion,
      filename,
      content_type,
      size_bytes,
      url,
      pathname,
      colegio,
      polo,
      year,
      visible_para,
      created_by,
      created_at
    FROM materiales_directores
    ORDER BY created_at DESC
    LIMIT 150
  `;

  const materiales = (rows as Record<string, unknown>[])
    .map(mapMaterialRow)
    .filter((material) => userCanSeeMaterial(scope, material));

  return {
    materiales,
    canUpload: canUploadMaterial(scope),
    scope: {
      role: scope.role,
      colegio: scope.colegio,
      polo: scope.polo,
    },
  };
}

export async function guardarMaterialDB(input: CrearMaterialInput) {
  const scope = await getUserScope();
  if (!canUploadMaterial(scope)) throw new Error("Solo admin puede subir materiales.");

  await ensureMaterialesTable();

  const titulo = String(input.titulo ?? "").trim();
  const pathname = String(input.pathname ?? "").trim();

  if (!titulo) throw new Error("El título es obligatorio.");
  if (!pathname) throw new Error("Falta pathname del archivo privado.");

  const visiblePara = input.visiblePara === "polo" || input.visiblePara === "colegio" ? input.visiblePara : "todos";
  const id = crypto.randomUUID();

  const yearValue = Number(input.year || 0);
  const safeYear = Number.isFinite(yearValue) && yearValue >= 2000 && yearValue <= 2100 ? yearValue : null;

  await sql`
    INSERT INTO materiales_directores (
      id,
      titulo,
      descripcion,
      filename,
      content_type,
      size_bytes,
      url,
      pathname,
      colegio,
      polo,
      year,
      visible_para,
      created_by
    ) VALUES (
      ${id},
      ${titulo},
      ${String(input.descripcion ?? "").trim()},
      ${String(input.filename ?? "").trim()},
      ${String(input.contentType ?? "application/pdf").trim()},
      ${Number(input.sizeBytes || 0)},
      ${String(input.url ?? "").trim()},
      ${pathname},
      ${String(input.colegio ?? "").trim()},
      ${String(input.polo ?? "").trim()},
      ${safeYear},
      ${visiblePara},
      ${scope.userId}
    )
  `;

  return { ok: true, id };
}

export async function obtenerMaterialPorIdDB(idUnsafe: string) {
  const scope = await getUserScope();
  await ensureMaterialesTable();

  const id = String(idUnsafe ?? "").trim();
  if (!id) throw new Error("Falta id del material.");

  const rows = await sql`
    SELECT
      id,
      titulo,
      descripcion,
      filename,
      content_type,
      size_bytes,
      url,
      pathname,
      colegio,
      polo,
      year,
      visible_para,
      created_by,
      created_at
    FROM materiales_directores
    WHERE id = ${id}
    LIMIT 1
  `;

  const material = (rows as Record<string, unknown>[]).map(mapMaterialRow)[0] || null;
  if (!material) return null;

  if (!userCanSeeMaterial(scope, material)) {
    throw new Error("No tenés permiso para ver este material.");
  }

  return material;
}

export async function eliminarMaterialDB(idUnsafe: string) {
  const scope = await getUserScope();
  if (!canUploadMaterial(scope)) throw new Error("Solo admin puede eliminar materiales.");

  await ensureMaterialesTable();

  const id = String(idUnsafe ?? "").trim();
  if (!id) throw new Error("Falta id del material.");

  const rows = await sql`
    SELECT id, pathname
    FROM materiales_directores
    WHERE id = ${id}
    LIMIT 1
  `;

  const material = (rows as Array<{ id?: unknown; pathname?: unknown }>)[0];
  const pathname = String(material?.pathname ?? "").trim();

  if (!material?.id) {
    return { ok: true, deletedBlob: false, deletedMetadata: false };
  }

  // Primero intentamos borrar el archivo real de Vercel Blob.
  // Si el archivo ya no existe o Blob falla, no dejamos la metadata colgada sin avisar.
  if (pathname) {
    await del(pathname);
  }

  // Después borramos solo la fila liviana de Neon.
  await sql`DELETE FROM materiales_directores WHERE id = ${id}`;

  return { ok: true, deletedBlob: Boolean(pathname), deletedMetadata: true };
}
