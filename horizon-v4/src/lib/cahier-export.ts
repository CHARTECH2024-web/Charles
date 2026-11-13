import type { ReportData } from '@/components/cahier/extra-tabs'

/** Human readable money formatting shared by every export. */
export function money(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} CDF`
}

type ExportLabels = {
  title: string
  period: string
  sales: string
  expenses: string
  profit: string
  receivable: string
  payable: string
  purchases: string
  stockValue: string
  lowStock: string
  stock: string
  product: string
  quantity: string
  unitPrice: string
  value: string
}

/** Downloads the report as a real Excel workbook (.xlsx). */
export async function exportReportXlsx(report: ReportData, labels: ExportLabels) {
  const XLSX = await import('xlsx')
  const summary = [
    [labels.title, report.label],
    [],
    [labels.sales, report.totals.sales],
    [labels.expenses, report.totals.expenses],
    [labels.profit, report.totals.profit],
    [labels.receivable, report.totals.receivable],
    [labels.payable, report.totals.payable],
    [labels.purchases, report.totals.purchases],
    [labels.stockValue, report.totals.stockValue],
    [labels.lowStock, report.totals.lowStock],
  ]
  const stock = [
    [labels.product, labels.quantity, labels.unitPrice, labels.value],
    ...report.stock.map((row) => [row.name, row.stock, row.price, row.value]),
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Bilan')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(stock), 'Stock')
  XLSX.writeFile(workbook, `horizon-cahier-${report.period}-${Date.now()}.xlsx`)
}

/** Downloads the report as a PDF file. */
export async function exportReportPdf(report: ReportData, labels: ExportLabels) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 48
  let y = 64

  doc.setFontSize(18)
  doc.text('HORIZON — Cahier de compte', left, y)
  y += 22
  doc.setFontSize(12)
  doc.text(`${labels.title}: ${report.label}`, left, y)
  y += 28

  const rows: [string, string][] = [
    [labels.sales, money(report.totals.sales)],
    [labels.expenses, money(report.totals.expenses)],
    [labels.profit, money(report.totals.profit)],
    [labels.receivable, money(report.totals.receivable)],
    [labels.payable, money(report.totals.payable)],
    [labels.purchases, money(report.totals.purchases)],
    [labels.stockValue, money(report.totals.stockValue)],
    [labels.lowStock, `${report.totals.lowStock}`],
  ]
  doc.setFontSize(11)
  for (const [key, value] of rows) {
    doc.text(key, left, y)
    doc.text(value, 360, y)
    y += 18
  }

  y += 12
  doc.setFontSize(13)
  doc.text(labels.stock, left, y)
  y += 20
  doc.setFontSize(10)
  doc.text(labels.product, left, y)
  doc.text(labels.quantity, 300, y)
  doc.text(labels.value, 400, y)
  y += 14
  for (const row of report.stock.slice(0, 40)) {
    if (y > 780) {
      doc.addPage()
      y = 64
    }
    doc.text(row.name.slice(0, 34), left, y)
    doc.text(`${row.stock}`, 300, y)
    doc.text(money(row.value), 400, y)
    y += 14
  }

  doc.setFontSize(9)
  doc.text(
    `Généré le ${new Date().toLocaleString('fr-FR')} — HORIZON Workspace`,
    left,
    812,
  )
  doc.save(`horizon-cahier-${report.period}-${Date.now()}.pdf`)
}

type ReceiptLabels = {
  receipt: string
  date: string
  seller: string
  label: string
  quantity: string
  total: string
  thanks: string
}

/** Printable receipt (PDF) for one sale. */
export async function exportReceiptPdf(
  sale: {
    label: string
    amount: number
    createdAt: number
    quantity: number | null
    productName: string | null
    contactName: string | null
  },
  labels: ReceiptLabels,
) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: [300, 420] })
  const left = 20
  let y = 40

  doc.setFontSize(14)
  doc.text('HORIZON', left, y)
  y += 16
  doc.setFontSize(9)
  doc.text(labels.receipt, left, y)
  y += 18
  doc.text(`${labels.date}: ${new Date(sale.createdAt).toLocaleString('fr-FR')}`, left, y)
  y += 14
  doc.text(`${labels.label}: ${sale.label}`, left, y)
  y += 14
  if (sale.productName) {
    doc.text(`${sale.productName}`, left, y)
    y += 14
  }
  if (sale.quantity) {
    doc.text(`${labels.quantity}: ${sale.quantity}`, left, y)
    y += 14
  }
  if (sale.contactName) {
    doc.text(`${labels.seller}: ${sale.contactName}`, left, y)
    y += 14
  }
  y += 10
  doc.setFontSize(12)
  doc.text(`${labels.total}: ${money(sale.amount)}`, left, y)
  y += 26
  doc.setFontSize(8)
  doc.text(labels.thanks, left, y)

  doc.save(`recu-${Date.now()}.pdf`)
}
