const headersByModule = {
  orders: ["number", "subject", "issuedDate", "category", "signer", "status", "createdAt"],
  memos: ["number", "subject", "memoDate", "workGroupLabel", "proposer", "approver", "status", "createdAt"],
  outgoing: ["number", "subject", "recipientOrg", "channel", "status", "createdAt"]
};

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCsv(moduleName, documents) {
  const headers = headersByModule[moduleName] || headersByModule.orders;
  const rows = documents
    .filter((doc) => doc.module === moduleName)
    .map((doc) => headers.map((key) => escapeCsv(doc[key])).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${moduleName}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function openPrintPreview(documentItem) {
  const win = window.open("", "_blank", "width=900,height=720");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${documentItem.number}</title><style>body{font-family:'TH SarabunIT9','TH Sarabun New',serif;font-size:24px;line-height:1.45;padding:48px;white-space:pre-wrap}</style></head><body>${documentItem.draft || ""}</body></html>`);
  win.document.close();
  win.focus();
}
