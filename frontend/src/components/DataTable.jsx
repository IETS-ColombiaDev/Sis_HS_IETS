/**
 * Tabla reutilizable con estilo consistente del sistema IETS.
 */
export default function DataTable({ columns, rows, minWidth = 880, emptyMessage = "Sin registros" }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table" style={{ minWidth }}>
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align || "left" }}>
                {col.label}
                {col.tip}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="data-table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.key ?? i} className={i % 2 ? "data-table-row-alt" : ""}>
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align || "left" }}>
                    {col.render ? col.render(row.data, i) : row.data[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
