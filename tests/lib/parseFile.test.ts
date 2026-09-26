import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { finalizeVokasiRecord, parseVokasiFile, parseZparFile, suggestShop } from "@/lib/parseFile";

// Synthetic files only — never real ZPAR / Vokasi exports.

function csvFile(lines: string[], name = "data.csv"): File {
  return new File([lines.join("\n")], name, { type: "text/csv" });
}

function xlsxFile(rows: unknown[][], name = "data.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], name);
}

const ZPAR_HEADER =
  "Period,Noreg,Nama,Status,EG,Labor Type,Tgl Masuk,Tgl Lahir,Gender,Pers Area,Directorat,Division,Department,Section,Line,Posisi (struktural),Ket";

describe("parseZparFile", () => {
  it("reads a CSV export: day-first dates, status, gender, area and period", async () => {
    const result = await parseZparFile(
      csvFile([
        ZPAR_HEADER,
        "09.2026,5000001,Andi,Permanen,Active,a,04/07/1990,13/02/1970,Male,Karawang 1,Prod,Assy,Assy 1,S1,L1,Team Member,catatan",
        "09.2026,026001,Budi,Kontrak 1.1,Active,A,01/10/2024,05/05/2000,Female,Sunter 2,Prod,Assy,Assy 2,S1,L2,Team Member,",
        "09.2026,5000002,Citra,Permanen,Withdrawn,A,01/01/2000,01/01/1980,Female,Karawang 1,Prod,Assy,Assy 1,S1,L1,Leader,",
      ])
    );

    expect(result.totalRows).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.skipBreakdown.reasons).toEqual({ "EG tidak aktif": 1 });
    expect(result.periods).toEqual([{ period: "2026-09", count: 2 }]);
    expect(result.employees[0]).toMatchObject({
      noreg: "5000001",
      labor_type: "A",
      tgl_masuk: "1990-07-04", // 4 July, not 7 April
      tgl_lahir: "1970-02-13",
      status_kontrak: "Permanen",
      gender: "L",
      plant: "Vehicle Plant",
      extra: { Ket: "catatan" },
    });
    expect(result.employees[1]).toMatchObject({ status_kontrak: "Kontrak 1.1", gender: "P", plant: "Unit STR Plant" });
    expect(result.columns.missingRequired).toEqual([]);
    expect(result.columns.extra.map((c) => c.name)).toEqual(["Ket"]);
  });

  it("reads real date cells from an .xlsx file", async () => {
    const header = ZPAR_HEADER.split(",");
    const row = ["09.2026", "5000001", "Andi", "Permanen", "Active", "A", new Date(2015, 2, 9), new Date(1990, 6, 4), "Male", "Karawang 2", "Prod", "Assy", "Assy 1", "S1", "L1", "Team Member", ""];
    const result = await parseZparFile(xlsxFile([header, row]));
    expect(result.employees[0]).toMatchObject({ tgl_masuk: "2015-03-09", tgl_lahir: "1990-07-04", plant: "Vehicle Plant" });
  });

  it("names the columns the app needs that are missing", async () => {
    const result = await parseZparFile(csvFile(["Noreg,Nama,Status", "5000001,Andi,Permanen"]));
    expect(result.columns.missingRequired).toContain("Tgl Masuk");
    expect(result.columns.missingRequired).toContain("Department");
  });
});

describe("parseVokasiFile", () => {
  it("reads the starting file and never keeps personal data columns", async () => {
    const result = await parseVokasiFile(
      csvFile([
        "Batch,Noreg,Nama,Div,Shop,Lokasi,Dept,Gender,Tgl Masuk,NIK,Nomor HP",
        "110,TM001,Luna,Assy Div,ASSEMBLY,KARAWANG #1,Assy 1,PEREMPUAN,01/05/2025,3200000000000001,0800000000",
        "110,TM002,Raka,Assy Div,ASSEMMBLY,Karawang 2,Assy 2,PRIA,,3200000000000002,0800000001",
        "110,TM003,Sari,Assy Div,ASSEMBLY,Sunter 1,Assy 2,PEREMPUAN,01/05/2025,3200000000000003,0800000002",
      ]),
      "2025-06-01"
    );

    expect(result.format).toBe("starting");
    expect(result.skipBreakdown.reasons).toEqual({ "Lokasi di luar Karawang #1/#2": 1 });
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({ noreg: "TM001", batch: "110", gender: "P", tgl_masuk: "2025-05-01", tgl_ended: "2025-10-31", labor_type: "A" });
    // A blank Tgl Masuk takes the batch's date, and is flagged for the uploader.
    expect(result.records[1]).toMatchObject({ gender: "L", tgl_masuk: "2025-05-01", lokasi: "KARAWANG #2" });
    expect(result.tglBlank).toEqual([false, true]);
    expect(result.records.every((r) => !r.extra)).toBe(true);
    expect(result.columns.extra).toEqual([]);
    // The typo'd shop is offered a correction, never applied silently.
    expect(result.shopValues.find((s) => s.key === "ASSEMMBLY")).toMatchObject({ standard: undefined, suggestion: "ASSEMBLY" });
  });

  it("reads real date cells from an .xlsx file", async () => {
    const result = await parseVokasiFile(
      xlsxFile([
        ["Batch", "Noreg", "Nama", "Shop", "Lokasi", "Gender", "Tgl Masuk"],
        ["111", "TM111001", "Nia", "PRESS", "KARAWANG #1", "PEREMPUAN", new Date(2026, 3, 1)],
      ]),
      "2026-01-01"
    );
    expect(result.records[0]).toMatchObject({ tgl_masuk: "2026-04-01", tgl_ended: "2026-09-30" });
    expect(result.tglBlank).toEqual([false]);
  });

  it("reads batch and start date from the raw monthly file's title rows", async () => {
    const result = await parseVokasiFile(
      csvFile([
        "PLACEMENT VOKASI 28 MAY 2026 - 27 NOVEMBER 2026 (6 BULAN ) BATCH #125",
        "",
        "Noreg,Nama,Shop,Lokasi,Jenis Kelamin",
        "TM125001,Dimas,TOSO,KARAWANG #2,PRIA",
      ]),
      "2026-01-01"
    );
    expect(result.format).toBe("raw");
    expect(result.title).toEqual({ batch: "125", start: "2026-05-28", end: "2026-11-27" });
    expect(result.records[0]).toMatchObject({ batch: "125", tgl_masuk: "2026-05-28" });
    expect(finalizeVokasiRecord(result.records[0], "TOSO")).toMatchObject({ dept: "Painting Production #2 Dept" });
  });
});

describe("suggestShop", () => {
  it("suggests the closest standard shop", () => {
    expect(suggestShop("QUALITY INSP")).toBe("QUALITY INSP.");
    expect(suggestShop("welding  body")).toBe("WELDING BODY");
  });
});
