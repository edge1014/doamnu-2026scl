import type { SemesterKey } from "@/lib/semester";

export interface ReportStudent {
  id: string;
  name: string;
  cls: "1분반" | "2분반";
  order: number;
}

export interface ReportSaveResult {
  saved: number;
  failures: string[];
  destination: "folder" | "zip";
  cancelled?: boolean;
}

function dateStamp(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now).replaceAll(":", "");
  return `${date}_${time}`;
}

async function createStudentReport(student: ReportStudent, semester: SemesterKey): Promise<Blob> {
  let reportAdvice: string | undefined;
  if (semester !== "2026-1") {
    const adviceResponse = await fetch("/api/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, semester }),
    });
    const adviceData = await adviceResponse.json();
    if (!adviceResponse.ok || !adviceData.success) {
      throw new Error(adviceData.error || "AI 젠지 조언 생성 실패");
    }
    reportAdvice = typeof adviceData.advice === "string" ? adviceData.advice : "";
  }

  const pdfResponse = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: student.id, semester, reportAdvice }),
  });
  if (!pdfResponse.ok) {
    const data = await pdfResponse.json();
    throw new Error(data.error || `PDF 생성 실패 (HTTP ${pdfResponse.status})`);
  }
  if (!pdfResponse.headers.get("Content-Type")?.includes("application/pdf")) {
    throw new Error("PDF 대신 예상하지 못한 응답을 받았습니다.");
  }
  return pdfResponse.blob();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function reportFilename(student: ReportStudent): string {
  return `${student.cls}_${student.name.replace(/[\\/:*?"<>|]/g, "_")}.pdf`;
}

export async function downloadSingleHealthReport(student: ReportStudent, semester: SemesterKey): Promise<void> {
  const pdf = await createStudentReport(student, semester);
  downloadBlob(pdf, reportFilename(student));
}

export async function saveHealthReports(
  students: ReportStudent[],
  semester: SemesterKey,
  onProgress: (completed: number, total: number, message: string) => void
): Promise<ReportSaveResult> {
  const pickerWindow = window as Window & {
    showDirectoryPicker?: (options?: { mode?: "readwrite"; startIn?: "desktop" }) => Promise<FileSystemDirectoryHandle>;
  };
  const folderName = `${semester}_학생_크리틱_대시보드_${dateStamp()}`;
  let outputDirectory: FileSystemDirectoryHandle | undefined;
  if (pickerWindow.showDirectoryPicker) {
    try {
      const chosenDirectory = await pickerWindow.showDirectoryPicker({ mode: "readwrite", startIn: "desktop" });
      outputDirectory = await chosenDirectory.getDirectoryHandle(folderName, { create: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { saved: 0, failures: [], destination: "folder", cancelled: true };
      }
      // 브라우저가 폴더 쓰기를 제공하지 않으면 동일한 폴더 구조의 ZIP을 내려받는다.
      console.error("폴더 선택 실패, ZIP으로 전환:", error);
    }
  }

  const ordered = [...students].sort((a, b) => a.cls.localeCompare(b.cls) || a.order - b.order);
  const zipFiles: Record<string, Uint8Array> = {};
  const failures: string[] = [];
  let saved = 0;
  for (let index = 0; index < ordered.length; index++) {
    const student = ordered[index];
    onProgress(index, ordered.length, `${student.name} AI 조언 및 PDF 생성 중...`);
    try {
      const pdf = await createStudentReport(student, semester);
      const filename = reportFilename(student);
      if (outputDirectory) {
        const file = await outputDirectory.getFileHandle(filename, { create: true });
        const writable = await file.createWritable();
        await writable.write(pdf);
        await writable.close();
      } else {
        zipFiles[`${folderName}/${filename}`] = new Uint8Array(await pdf.arrayBuffer());
      }
      saved++;
    } catch (error) {
      failures.push(`${student.cls} ${student.name}: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
    onProgress(index + 1, ordered.length, `${student.name} 처리 완료`);
  }

  if (failures.length > 0) {
    const failureText = failures.join("\n");
    if (outputDirectory) {
      const file = await outputDirectory.getFileHandle("생성실패.txt", { create: true });
      const writable = await file.createWritable();
      await writable.write(failureText);
      await writable.close();
    } else {
      zipFiles[`${folderName}/생성실패.txt`] = new TextEncoder().encode(failureText);
    }
  }
  if (!outputDirectory && Object.keys(zipFiles).length > 0) {
    const { zipSync } = await import("fflate");
    const zipped = zipSync(zipFiles, { level: 0 });
    downloadBlob(new Blob([new Uint8Array(zipped)], { type: "application/zip" }), `${folderName}.zip`);
  }
  return { saved, failures, destination: outputDirectory ? "folder" : "zip" };
}
