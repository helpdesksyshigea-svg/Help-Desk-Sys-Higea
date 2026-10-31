-- La firma digital del coordinador médico (al aprobar tickets de médico, ver
-- POST /tickets/:id/aprobar-coordinador) necesita su propia marca de tiempo:
-- reutilizar tickets.firma_aprobador_at (pensada para la aprobación final de
-- supervisora) causaba que, si la supervisora también confirmaba su firma
-- más adelante, se pisara la confirmación del coordinador con la de ella —
-- y el oficio de un ticket de médico debe mostrar la firma del coordinador,
-- no la de supervisora (igual que el oficio real de referencia: solo
-- médico + coordinador, la aprobación de facturación es un paso del sistema,
-- no una tercera firma en el papel).
alter table tickets add column if not exists firma_coordinador_at timestamptz;
