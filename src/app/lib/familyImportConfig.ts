export type FamilyGroup = "varones" | "mujeres" | "jardines";
export type SheetSpec = { hoja: string; filas: number; encabezadoFila: number; observacion?: string };

export const SHEETS_BY_GROUP: Record<FamilyGroup, SheetSpec[]> = {
  varones: [
    { hoja: "Polo Tucumán - Pucará", filas: 680, encabezadoFila: 1, observacion: "Nivel viene en nombre del colegio; B funciona como curso." },
    { hoja: "Polo Córdoba - Cinco Rios", filas: 457, encabezadoFila: 1 },
    { hoja: "Polo Rosario - Los Arroyos", filas: 374, encabezadoFila: 1 },
    { hoja: "Polo La Plata - BDP", filas: 314, encabezadoFila: 1 },
    { hoja: "Polo Pilar - Los Caminos", filas: 176, encabezadoFila: 1 },
    { hoja: "Polo Mendoza - Los Olivos", filas: 364, encabezadoFila: 1 },
    { hoja: "Polo Buenos Aires - Los Molinos", filas: 817, encabezadoFila: 1 },
  ],
  mujeres: [
    { hoja: "Polo Tucumán - Los Cerros", filas: 735, encabezadoFila: 1, observacion: "Nivel también en nombre oficial; C funciona como curso." },
    { hoja: "Polo Córdoba - El Torreón", filas: 520, encabezadoFila: 1, observacion: "B contiene nivel aunque encabezado no coincida." },
    { hoja: "Polo Rosario - Mirasoles", filas: 378, encabezadoFila: 1 },
    { hoja: "Polo Buenos Aires - El Buen Ayr", filas: 656, encabezadoFila: 1, observacion: "B sin encabezado: nivel; C funciona como curso." },
    { hoja: "Polo Mendoza - Portezuelo", filas: 283, encabezadoFila: 1 },
    { hoja: "Polo La Plata - Crisol", filas: 140, encabezadoFila: 1 },
    { hoja: "Polo Pilar - Los Candiles", filas: 177, encabezadoFila: 2 },
  ],
  jardines: [
    { hoja: "Polo Tucumán - Los Cerritos", filas: 302, encabezadoFila: 1 },
    { hoja: "Polo Córdoba - Jardín Torreón d", filas: 212, encabezadoFila: 1 },
    { hoja: "Polo Rosario - Los Senderos", filas: 223, encabezadoFila: 1 },
    { hoja: "Polo Buenos Aires - Buen Molino", filas: 198, encabezadoFila: 1, observacion: "Sin nivel separado; B es curso." },
    { hoja: "Polo Mendoza - Platero", filas: 218, encabezadoFila: 1 },
    { hoja: "Polo La Plata - Jardín Crisol", filas: 174, encabezadoFila: 1, observacion: "A sin encabezado formal, pero contiene colegio." },
    { hoja: "Polo Pilar - Jardín Cauquén", filas: 128, encabezadoFila: 1, observacion: "A/B/C/D sin encabezados formales." },
  ],
};