import ExcelJS from "exceljs";

const ENCABEZADOS = [
  { header: "Código", key: "code", width: 20 },
  { header: "Estado", key: "estado", width: 16 },
  { header: "Tipo", key: "tipo", width: 28 },
  { header: "Prioridad", key: "prioridad", width: 12 },
  { header: "Solicita (firmante)", key: "firmante", width: 24 },
  { header: "Radicado por", key: "solicitante", width: 24 },
  { header: "Radicado el", key: "creado", width: 20 },
  { header: "Aprobado el", key: "aprobado", width: 20 },
  { header: "Cerrado el", key: "cerrado", width: 20 },
  { header: "Factura", key: "factura", width: 16 },
  { header: "Paciente", key: "paciente", width: 24 },
  { header: "Documento", key: "documento", width: 16 },
  { header: "CUPS/folio", key: "cups", width: 14 },
  { header: "Fecha registro", key: "fecha_registro", width: 16 },
  { header: "Motivo", key: "motivo", width: 24 },
  { header: "Descripción", key: "descripcion", width: 32 },
];

// Una fila por registro (ticket_item), no por ticket: el informe mensual necesita
// contar facturas/pacientes individuales, no tiquetes que pueden agrupar varios.
export async function construirExcelTickets(tickets) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Mesa de ayuda SYS HIGEA";
  libro.created = new Date();

  const hoja = libro.addWorksheet("Tickets");
  hoja.columns = ENCABEZADOS;
  hoja.getRow(1).font = { bold: true };
  hoja.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + ENCABEZADOS.length)}1` };

  for (const t of tickets) {
    const items = t.items?.length ? t.items : [{}];
    for (const item of items) {
      hoja.addRow({
        code: t.code,
        estado: t.estado,
        tipo: t.tipo,
        prioridad: t.prioridad,
        firmante: t.firmante,
        solicitante: t.solicitante?.nombre || "",
        creado: t.created_at ? new Date(t.created_at).toLocaleString("es-CO") : "",
        aprobado: t.aprobado_at ? new Date(t.aprobado_at).toLocaleString("es-CO") : "",
        cerrado: t.cerrado_at ? new Date(t.cerrado_at).toLocaleString("es-CO") : "",
        factura: item.factura || "",
        paciente: item.paciente || "",
        documento: item.documento || "",
        cups: item.cups || "",
        fecha_registro: item.fecha || "",
        motivo: item.motivo || "",
        descripcion: item.descripcion || "",
      });
    }
  }

  return libro.xlsx.writeBuffer();
}
