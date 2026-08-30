"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { normalizeSemester } from "@/lib/semester";
import { Chart, registerables } from "chart.js";
import { 
  Loader2, 
  ChevronDown, 
  ExternalLink, 
  Sun, 
  Moon, 
  Image as ImageIcon,
  Sparkles,
  Info,
  ChevronUp,
  AlertCircle,
  Download,
  Award,
  Settings,
  LogOut
} from "lucide-react";

// Register Chart.js elements
if (typeof window !== "undefined") {
  Chart.register(...registerables);
}

interface Student {
  id: string;
  name: string;
  cls: "1분반" | "2분반";
  order: number;
}

interface Session {
  id: string;
  sessionName: string;
  date: string;
  overall: string;
  description: string;
}

interface Evaluation {
  pageId: string;
  date: string;
  score: number;
  critic: string;
  imageUrl?: string;
  notionUrl?: string;
  sessionPageId: string;
}

// Converts any Drive share/view URL to a thumbnail URL that embeds reliably in <img>
function normalizeDriveUrl(url: string): string {
  if (!url) return url;
  if (url.includes("lh3.googleusercontent.com")) return url;
  if (url.includes("drive.google.com")) {
    const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ?? url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  }
  return url;
}

function StudentBoardContent() {
  const { data: sessionData } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const studentParamId = searchParams.get("student") || "";
  const selectedSemester = normalizeSemester(searchParams.get("semester"));
  const isReadOnly = selectedSemester === "2026-1";
  const pdfMode = searchParams.get("pdfMode") === "true";

  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [allRecords, setAllRecords] = useState<Evaluation[]>([]);
  const urlPeriod = searchParams.get("period");
  const [period, setPeriod] = useState(urlPeriod || "3w"); // Default to '3w'
  const urlHistoryPeriod = searchParams.get("historyPeriod");
  const [historyPeriod, setHistoryPeriod] = useState(urlHistoryPeriod || "2w"); // Default to '2w'
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(pdfMode); // Expand history automatically in PDF mode
  
  // Selection states (for switching students directly)
  const [selectedDivision, setSelectedDivision] = useState<"1분반" | "2분반">("1분반");

  // Single Action Processing States
  const [singleAdviceGenerating, setSingleAdviceGenerating] = useState(false);
  const [exportStatus, setExportStatus] = useState({ loading: false, targetId: "" });

  // Bulk Action Processing States
  const [bulkAdviceStatus, setBulkAdviceStatus] = useState({ loading: false, progress: 0, total: 0, message: "" });
  const [bulkPdfStatus, setBulkPdfStatus] = useState({ loading: false, progress: 0, total: 0, message: "" });

  // Toast States
  const [toastMessage, setToastMessage] = useState("");
  const [toastShow, setToastShow] = useState(false);

  // References
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Show toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2500);
  };

  // 1. Initialize Theme & Check Mounted
  useEffect(() => {
    setMounted(true);
    const isDark = localStorage.getItem("theme") === "dark";
    setDarkMode(isDark);
    if (isDark) document.body.classList.add("dark");
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleTheme = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
    if (nextDark) {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  };

  // 2. Fetch Initial Student & Evaluation Logs
  useEffect(() => {
    setLoading(true);
    
    // Fetch all students and sessions to resolve data & build selector
    fetch(`/api/init-data?semester=${selectedSemester}`)
      .then((res) => res.json())
      .then((data) => {
        setStudents(data.students || []);
        setSessions(data.sessions || []);
        if (data.authInfo) {
          setIsRegistered(data.authInfo.isRegistered);
        }

        const activeStudentId = studentParamId || (data.students && data.students[0]?.id) || "";
        const matched = data.students?.find(
          (s: Student) => s.id === activeStudentId || s.name === activeStudentId
        );

        if (matched) {
          setStudent(matched);
          setSelectedDivision(matched.cls); // Pre-select division of active student
          return fetch(`/api/scl?studentId=${matched.id}&semester=${selectedSemester}`)
            .then((res) => res.json())
            .then((records) => ({ matched, records }));
        }
        throw new Error("학생을 찾을 수 없습니다.");
      })
      .then(({ matched, records }) => {
        if (records) {
          setAllRecords(records);
          if (records.length > 0) {
            const latestRecord = records[records.length - 1];
            loadAdvice(matched.id, latestRecord.date); // Use matched.id directly to avoid React state lag!
          } else {
            setAiAdvice("");
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [studentParamId, selectedSemester]);

  const matchedStudentId = () => student?.id;

  // Load AI advice from Notion DB4
  const loadAdvice = (sId: string, latestDate: string) => {
    if (!sId) return;
    setAdviceLoading(true);
    fetch(`/api/advice?studentId=${sId}&latestDate=${latestDate}&semester=${selectedSemester}`)
      .then((res) => res.json())
      .then((data) => {
        setAiAdvice(data.advice || "");
        setAdviceLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setAdviceLoading(false);
      });
  };

  // Generate individual AI Advice manually
  const generateSingleAdvice = async () => {
    if (isReadOnly) return;
    if (!student || allRecords.length === 0) return;
    const latestRecord = allRecords[allRecords.length - 1];
    const sessionObj = sessions.find((s) => s.id === latestRecord.sessionPageId);

    setSingleAdviceGenerating(true);
    try {
      const res = await fetch("/api/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          studentName: student.name,
          critic: latestRecord.critic,
          score: latestRecord.score,
          sessionName: sessionObj?.sessionName || "건축설계 세션",
          semester: selectedSemester,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiAdvice(data.advice);
        showToast("AI 조언 생성이 완료되었습니다!");
      } else {
        throw new Error(data.error || "생성 실패");
      }
    } catch (e: any) {
      console.error(e);
      showToast(`AI 조언 생성 실패: ${e.message}`);
    } finally {
      setSingleAdviceGenerating(false);
    }
  };

  // Export current student's dashboard to PDF
  const exportSinglePdf = async () => {
    if (!student) return;
    const latestRecord = allRecords.length > 0 ? allRecords[allRecords.length - 1] : null;
    let sessionObj = latestRecord ? sessions.find((s) => s.id === latestRecord.sessionPageId) : null;
    if (!sessionObj && sessions.length > 0) {
      sessionObj = sessions[0];
    }
    if (!sessionObj) {
      showToast("세션 정보를 찾을 수 없습니다.");
      return;
    }

    setExportStatus({ loading: true, targetId: student.id });
    try {
      // 1. Create Google Drive folder for this session
      const folderRes = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_folder",
          sessionName: sessionObj.sessionName,
          semester: selectedSemester,
        }),
      });
      const folderData = await folderRes.json();
      if (!folderRes.ok || !folderData.folderId) {
        throw new Error(folderData.error || "구글 드라이브 폴더 생성 실패");
      }

      // 2. Render PDF and upload
      const pdfRes = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "export_pdf",
          studentId: student.id,
          studentName: student.name,
          folderId: folderData.folderId,
          period: period,
          historyPeriod: historyPeriod,
          semester: selectedSemester,
        }),
      });
      const pdfData = await pdfRes.json();
      if (pdfRes.ok && pdfData.success) {
        showToast(`${student.name} 학생의 PDF가 구글 드라이브에 업로드되었습니다.`);
      } else {
        throw new Error(pdfData.error || "PDF 생성 실패");
      }
    } catch (e: any) {
      console.error(e);
      showToast(`내보내기 실패: ${e.message}`);
    } finally {
      setExportStatus({ loading: false, targetId: "" });
    }
  };

  // Bulk Generate AI advice for all students in the selected division
  const bulkGenerateAdvice = async () => {
    if (isReadOnly) return;
    const listToGenerate = students.filter(s => s.cls === selectedDivision);
    if (listToGenerate.length === 0) return;

    if (!confirm(`${selectedDivision} 학생 ${listToGenerate.length}명에 대한 AI 조언 생성을 시작하시겠습니까?\n(OpenRouter API 호출이 순차적으로 진행되며 선불 잔액이 사용됩니다.)`)) {
      return;
    }

    setBulkAdviceStatus({ loading: true, progress: 0, total: listToGenerate.length, message: "AI 조언 일괄 생성 시작 중..." });

    try {
      for (let i = 0; i < listToGenerate.length; i++) {
        const currentStudent = listToGenerate[i];
        setBulkAdviceStatus(prev => ({ ...prev, progress: i + 1, message: `${currentStudent.name} AI 조언 생성 중...` }));

        // Fetch evaluations for this student
        const recordsRes = await fetch(`/api/scl?studentId=${currentStudent.id}&semester=${selectedSemester}`);
        const records = await recordsRes.json();
        
        if (records && records.length > 0) {
          const latestRecord = records[records.length - 1];
          let matchedSession = sessions.find(s => s.id === latestRecord.sessionPageId);
          if (!matchedSession && sessions.length > 0) {
            matchedSession = sessions[0];
          }

          const adviceRes = await fetch("/api/advice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: currentStudent.id,
              studentName: currentStudent.name,
              critic: latestRecord.critic,
              score: latestRecord.score,
              sessionName: matchedSession?.sessionName || "건축설계 세션",
              semester: selectedSemester,
            }),
          });
          const adviceData = await adviceRes.json();
          if (!adviceRes.ok || adviceData.error) {
            throw new Error(adviceData.error || "AI 조언 생성 실패");
          }
        }
      }

      // Refresh current student's advice if they were in the list
      if (student && allRecords.length > 0) {
        loadAdvice(student.id, allRecords[allRecords.length - 1].date);
      }
      showToast("선택된 분반 학생들의 AI 조언 생성이 완료되었습니다!");
    } catch (err: any) {
      console.error(err);
      showToast(`일괄 조언 생성 실패: ${err.message}`);
    } finally {
      setBulkAdviceStatus({ loading: false, progress: 0, total: 0, message: "" });
    }
  };

  // Bulk Export PDFs to Google Drive
  const bulkExportPdf = async () => {
    if (sessions.length === 0) return;
    
    // Determine target session from active student's latest record on screen, fallback to sessions[0]
    const latestRecord = allRecords.length > 0 ? allRecords[allRecords.length - 1] : null;
    let targetSession = latestRecord ? sessions.find((s) => s.id === latestRecord.sessionPageId) : null;
    if (!targetSession && sessions.length > 0) {
      targetSession = sessions[0];
    }
    if (!targetSession) {
      showToast("세션 정보를 찾을 수 없습니다.");
      return;
    }

    const listToExport = students.filter(s => s.cls === selectedDivision);
    if (listToExport.length === 0) return;

    if (!confirm(`${selectedDivision} 학생 ${listToExport.length}명의 PDF 일괄 생성을 시작하시겠습니까?\n(대상 세션: ${targetSession.sessionName})`)) {
      return;
    }

    setBulkPdfStatus({ loading: true, progress: 0, total: listToExport.length, message: "구글 드라이브 폴더 생성 중..." });

    try {
      // 1. Create or retrieve folder in Google Drive
      const folderRes = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_folder",
          sessionName: targetSession.sessionName,
          semester: selectedSemester,
        }),
      });
      const folderData = await folderRes.json();
      if (!folderRes.ok || !folderData.folderId) {
        throw new Error(folderData.error || "폴더를 생성할 수 없습니다.");
      }
      const folderId = folderData.folderId;

      const failedExports: string[] = [];

      // 2. Export each student one by one
      for (let i = 0; i < listToExport.length; i++) {
        const currentStudent = listToExport[i];
        setBulkPdfStatus(prev => ({ ...prev, progress: i + 1, message: `${currentStudent.name} PDF 내보내기 중...` }));

        const pdfRes = await fetch("/api/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "export_pdf",
            studentId: currentStudent.id,
            studentName: currentStudent.name,
            folderId: folderId,
            period: period,
            historyPeriod: historyPeriod,
            semester: selectedSemester,
          }),
        });
        const pdfData = await pdfRes.json();
        if (!pdfRes.ok || !pdfData.success) {
          const reason = pdfData.error || `HTTP ${pdfRes.status}`;
          failedExports.push(`${currentStudent.name}: ${reason}`);
          console.error(`Failed to export ${currentStudent.name}:`, reason);
        }
      }

      if (failedExports.length > 0) {
        throw new Error(`${failedExports.length}명 PDF 생성 실패 — ${failedExports.slice(0, 3).join(" / ")}`);
      }

      showToast("구글 드라이브 PDF 일괄 업로드 완료!");
    } catch (e: any) {
      console.error(e);
      showToast(`일괄 내보내기 실패: ${e.message}`);
    } finally {
      setBulkPdfStatus({ loading: false, progress: 0, total: 0, message: "" });
    }
  };

  // 3. Render Chart.js when Records or Period Changes
  useEffect(() => {
    if (!mounted || loading || allRecords.length === 0 || !chartRef.current) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      return;
    }

    const filtered = getFilteredRecords();
    if (filtered.length === 0) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      return;
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const labels = filtered.map((r) => r.date ? r.date.substring(5).replace("-", "/") : "");
    const scores = filtered.map((r) => r.score);

    chartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: scores,
            borderColor: "#2A6FBF",
            backgroundColor: "rgba(42, 111, 191, 0.15)", // Solid semi-transparent same-tone color
            pointBackgroundColor: "#2A6FBF",
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#2A6FBF",
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.4, // Curved bezier line
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: pdfMode ? false : undefined,
        animations: pdfMode ? undefined : {
          // Curved drawing upward animation from bottom (value 0) on load
          y: {
            duration: 1200,
            easing: "easeInOutQuart",
            from: (ctx) => ctx.chart.scales.y.getPixelForValue(0), // Start drawing from base (0 score)
          }
        },
        layout: {
          padding: {
            right: 24, // Prevents clipping of the latest data point and label on the right
            left: 8,
            top: 8,
            bottom: 8
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `점수: ${ctx.parsed.y}점`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 10,
            ticks: {
              stepSize: 2,
              color: darkMode ? "#94a3b8" : "#888",
              font: { size: 10, family: "var(--font-sans)" },
            },
            grid: {
              color: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            },
          },
          x: {
            ticks: {
              color: darkMode ? "#94a3b8" : "#888",
              font: { size: 10, family: "var(--font-sans)" },
            },
            grid: { display: false },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [allRecords, period, darkMode, mounted, loading]);

  // Click Outside to Close Period Selector Dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".period-wrap")) {
        setDropdownOpen(false);
      }
      if (!target.closest(".history-period-wrap")) {
        setHistoryDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  // Filter records based on selected period
  const getFilteredRecords = () => {
    if (period === "all") return allRecords;
    const now = new Date();
    const daysMap: Record<string, number> = { "2w": 14, "3w": 21, "1m": 30, "2m": 60, "3m": 90, "4m": 120 };
    const limitDays = daysMap[period] || 30;

    return allRecords.filter((r) => {
      if (!r.date) return false;
      const rDate = new Date(r.date);
      const diffTime = Math.abs(now.getTime() - rDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= limitDays;
    });
  };

  // Filter previous records based on selected historyPeriod
  const getFilteredHistoryRecords = () => {
    if (allRecords.length <= 1) return [];
    const prevRecords = allRecords.slice(0, -1);
    if (historyPeriod === "all") return prevRecords;

    const now = new Date();
    const daysMap: Record<string, number> = { "2w": 14, "3w": 21, "1m": 30, "2m": 60 };
    const limitDays = daysMap[historyPeriod] || 14;

    return prevRecords.filter((r) => {
      if (!r.date) return false;
      const rDate = new Date(r.date);
      const diffTime = Math.abs(now.getTime() - rDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= limitDays;
    });
  };

  const getPeriodLabel = (p: string) => {
    const labels: Record<string, string> = {
      all: "전체",
      "2w": "최근 2주",
      "3w": "최근 3주",
      "1m": "최근 1개월",
      "2m": "최근 2개월",
      "3m": "최근 3개월",
      "4m": "최근 4개월",
    };
    return labels[p] || "최근 1개월";
  };

  // Calculations for stats
  const filtered = getFilteredRecords();
  const scores = filtered.map((r) => r.score).filter((s) => s !== null && s !== undefined);
  const avgScore = scores.length > 0 ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;
  const latestScore = filtered.length > 0 ? filtered[filtered.length - 1].score : 0;
  const prevScore = filtered.length > 1 ? filtered[filtered.length - 2].score : null;
  const trend = prevScore !== null ? parseFloat((latestScore - prevScore).toFixed(1)) : null;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  const fmt = (v: any) => {
    const n = parseFloat(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
        <Loader2 className="animated-spin" style={{ width: "36px", height: "36px", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: "14px", color: "var(--text-muted)", fontWeight: 500 }}>로딩 중...</span>
      </div>
    );
  }

  if (!student) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", padding: "20px", textAlign: "center" }}>
        <AlertCircle style={{ width: "40px", height: "40px", color: "var(--danger)" }} />
        <h3 style={{ fontSize: "16px", fontWeight: 700 }}>학생 정보를 찾을 수 없습니다.</h3>
        <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>URL의 학생 ID를 다시 확인해 주세요.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: pdfMode ? "680px" : "1100px", margin: "0 auto", padding: pdfMode ? "0px" : "24px 16px" }} className={`animated-fade-in ${pdfMode ? "pdf-mode" : ""}`}>
      
      {/* Navigation bar (hidden in PDF print) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }} className="no-print">
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link href={`/?semester=${selectedSemester}`} style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none", fontWeight: 600 }}>
            평가 홈
          </Link>
          <span style={{ color: "var(--border-subtle)" }}>|</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--primary)" }}>학생 크리틱 대시보드</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ display: "inline-flex", padding: "2px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.03)" }} aria-label="학기 선택">
            {(["2026-2", "2026-1"] as const).map((semester) => (
              <button
                key={semester}
                type="button"
                onClick={() => router.push(`/board?semester=${semester}`)}
                className="btn"
                style={{ padding: "4px 8px", fontSize: "10px", border: "none", borderRadius: "6px", background: selectedSemester === semester ? "var(--primary)" : "transparent", color: selectedSemester === semester ? "#fff" : "var(--text-muted)", fontWeight: selectedSemester === semester ? 700 : 500 }}
              >
                {semester === "2026-2" ? "2학기" : "1학기"}
              </button>
            ))}
          </div>
          <button onClick={toggleTheme} className="theme-switch-btn" aria-label="Toggle theme">
            {darkMode ? <Sun style={{ width: "18px", height: "18px" }} /> : <Moon style={{ width: "18px", height: "18px" }} />}
          </button>

          <div ref={settingsRef} style={{ position: "relative" }}>
            <button
              id="board-settings-btn"
              onClick={() => setShowSettingsDropdown((prev) => !prev)}
              className="theme-switch-btn"
              aria-label="설정 메뉴"
              style={{ color: showSettingsDropdown ? "var(--primary)" : undefined }}
            >
              <Settings style={{ width: "18px", height: "18px" }} />
            </button>

            {showSettingsDropdown && (
              <div
                className="glass-card animated-slide-up"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  zIndex: 999,
                  minWidth: "220px",
                  padding: "6px",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-lg)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                <button
                  onClick={() => { setShowSettingsDropdown(false); exportSinglePdf(); }}
                  disabled={!sessionData || !isRegistered || exportStatus.loading || allRecords.length === 0}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    color: exportStatus.loading ? "var(--text-light)" : "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: exportStatus.loading ? "default" : "pointer",
                    opacity: !sessionData || !isRegistered || allRecords.length === 0 ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!exportStatus.loading) e.currentTarget.style.background = "var(--primary-light)"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {exportStatus.loading ? (
                    <Loader2 className="animated-spin" style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} />
                  ) : (
                    <Download style={{ width: "15px", height: "15px", color: "var(--text-muted)", flexShrink: 0 }} />
                  )}
                  현재 학생 PDF 생성
                </button>

                <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 4px" }} />

                <button
                  onClick={() => { setShowSettingsDropdown(false); bulkGenerateAdvice(); }}
                  disabled={isReadOnly || !sessionData || !isRegistered || bulkAdviceStatus.loading || bulkPdfStatus.loading}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    color: bulkAdviceStatus.loading ? "var(--text-light)" : "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: bulkAdviceStatus.loading ? "default" : "pointer",
                  opacity: isReadOnly || !sessionData || !isRegistered ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!bulkAdviceStatus.loading) e.currentTarget.style.background = "var(--primary-light)"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {bulkAdviceStatus.loading ? (
                    <Loader2 className="animated-spin" style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} />
                  ) : (
                    <Sparkles style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} />
                  )}
                  분반 AI 조언 일괄 생성
                </button>

                <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 4px" }} />

                <button
                  onClick={() => { setShowSettingsDropdown(false); bulkExportPdf(); }}
                  disabled={!sessionData || !isRegistered || bulkAdviceStatus.loading || bulkPdfStatus.loading}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    color: bulkPdfStatus.loading ? "var(--text-light)" : "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: bulkPdfStatus.loading ? "default" : "pointer",
                    opacity: !sessionData || !isRegistered ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!bulkPdfStatus.loading) e.currentTarget.style.background = "var(--primary-light)"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {bulkPdfStatus.loading ? (
                    <Loader2 className="animated-spin" style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} />
                  ) : (
                    <Download style={{ width: "15px", height: "15px", color: "var(--secondary)", flexShrink: 0 }} />
                  )}
                  분반 PDF 일괄 생성
                </button>
              </div>
            )}
          </div>

          <button onClick={() => signOut()} className="theme-switch-btn" style={{ color: "var(--danger)" }} aria-label="Logout">
            <LogOut style={{ width: "18px", height: "18px" }} />
          </button>
        </div>
      </div>

      {/* 2. Custom Division & Student Selector Panel (hidden in PDF print) */}
      {!pdfMode && (
        <div className="glass-card no-print" style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center", padding: "10px 14px" }}>
          {/* Division Selector Tab */}
          <div className="btn-group" style={{ display: "inline-flex", background: "rgba(0,0,0,0.03)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "2px" }}>
            {(["1분반", "2분반"] as const).map((div) => (
              <button
                key={div}
                onClick={() => setSelectedDivision(div)}
                className="btn"
                style={{
                  padding: "4px 10px",
                  fontSize: "11px",
                  border: "none",
                  background: selectedDivision === div ? "var(--primary)" : "transparent",
                  color: selectedDivision === div ? "#fff" : "var(--text-muted)",
                  borderRadius: "6px",
                  fontWeight: selectedDivision === div ? 600 : 500,
                  cursor: "pointer"
                }}
              >
                {div}
              </button>
            ))}
          </div>

          {/* Scrollable Student button lists */}
          <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px", flex: 1, whiteSpace: "nowrap" }} className="scroll-hidden">
            {students
              .filter((s) => s.cls === selectedDivision)
              .map((s) => (
                <Link
                  key={s.id}
                  href={`/board?student=${s.id}&semester=${selectedSemester}`}
                  className="btn"
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    background: student.id === s.id ? "var(--primary-light)" : "var(--bg-card)",
                    border: student.id === s.id ? "1px solid var(--primary)" : "1px solid var(--border-subtle)",
                    color: student.id === s.id ? "var(--primary)" : "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: student.id === s.id ? 700 : 500,
                    textDecoration: "none",
                    display: "inline-block"
                  }}
                >
                  {s.name}
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* 3. NextAuth Gated Professor Management Panel */}
      {sessionData && isRegistered && !pdfMode && (
        <div className="glass-card no-print animated-slide-up" style={{ marginBottom: "16px", padding: "14px", border: "1px solid rgba(42, 111, 191, 0.25)", background: "rgba(42, 111, 191, 0.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h4 style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Award style={{ width: "14px", height: "14px", color: "var(--primary)" }} />
                <span>교수 전용 관리 패널</span>
              </h4>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" }}>
                접속자: <strong>{sessionData.user?.name}</strong> 교수님
              </p>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {/* Individual PDF Export */}
              <button 
                onClick={exportSinglePdf} 
                disabled={exportStatus.loading || allRecords.length === 0} 
                className="btn" 
                style={{ padding: "6px 12px", fontSize: "11px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-main)", display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
              >
                {exportStatus.loading ? (
                  <Loader2 className="animated-spin" style={{ width: "12px", height: "12px" }} />
                ) : (
                  <Download style={{ width: "12px", height: "12px" }} />
                )}
                <span>PDF 다운로드(구글 드라이브)</span>
              </button>

              {/* Bulk Generation of AI advice */}
              <button 
                onClick={bulkGenerateAdvice} 
                disabled={isReadOnly || bulkAdviceStatus.loading || bulkPdfStatus.loading}
                className="btn" 
                style={{ padding: "6px 12px", fontSize: "11px", background: "var(--primary)", color: "#fff", border: "none", display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontWeight: 600 }}
              >
                {bulkAdviceStatus.loading ? (
                  <Loader2 className="animated-spin" style={{ width: "12px", height: "12px" }} />
                ) : (
                  <Sparkles style={{ width: "12px", height: "12px" }} />
                )}
                <span>분반 AI 조언 일괄 생성</span>
              </button>

              {/* Bulk Generation of PDFs */}
              <button 
                onClick={bulkExportPdf} 
                disabled={bulkAdviceStatus.loading || bulkPdfStatus.loading} 
                className="btn" 
                style={{ padding: "6px 12px", fontSize: "11px", background: "var(--secondary)", color: "#fff", border: "none", display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontWeight: 600 }}
              >
                {bulkPdfStatus.loading ? (
                  <Loader2 className="animated-spin" style={{ width: "12px", height: "12px" }} />
                ) : (
                  <Download style={{ width: "12px", height: "12px" }} />
                )}
                <span>분반 PDF 일괄 생성</span>
              </button>
            </div>
          </div>
          
          {/* Bulk processing progress bar */}
          {(bulkAdviceStatus.loading || bulkPdfStatus.loading) && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-main)", marginBottom: "4px", fontWeight: 500 }}>
                <span>{bulkAdviceStatus.loading ? bulkAdviceStatus.message : bulkPdfStatus.message}</span>
                <span>
                  {bulkAdviceStatus.loading 
                    ? `${bulkAdviceStatus.progress} / ${bulkAdviceStatus.total}` 
                    : `${bulkPdfStatus.progress} / ${bulkPdfStatus.total}`}
                </span>
              </div>
              <div style={{ height: "4px", background: "var(--border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                <div 
                  style={{ 
                    height: "100%", 
                    background: bulkAdviceStatus.loading ? "var(--primary)" : "var(--secondary)", 
                    width: `${((bulkAdviceStatus.loading 
                      ? bulkAdviceStatus.progress 
                      : bulkPdfStatus.progress) / (bulkAdviceStatus.loading 
                      ? bulkAdviceStatus.total 
                      : bulkPdfStatus.total)) * 100}%`,
                    transition: "width 0.3s ease" 
                  }} 
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top profile header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "54px", height: "54px", borderRadius: "50%", background: "var(--primary-light)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 700, color: "var(--primary)", flexShrink: 0 }}>
            {student.name[0]}
          </div>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-main)", letterSpacing: "-0.02em" }}>{student.name}</h1>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              {student.cls} &nbsp;&middot;&nbsp; 2026 – 1학기 &nbsp;&middot;&nbsp; 건축설계 A
            </p>
          </div>
        </div>

        {/* Right Header details (hidden controls in PDF print) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>Student Critic Log</div>
            <div style={{ fontSize: "11px", color: "var(--text-light)", marginTop: "1px" }}>
              <span style={{ color: "var(--secondary)", fontWeight: 600 }}>건축설계 A</span> &nbsp;
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>[ DOA-MNU ]</span>
            </div>
          </div>

          {/* Period filter (hidden in PDF print) */}
          <div className="period-wrap no-print" style={{ position: "relative" }}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)} 
              className="btn" 
              style={{ padding: "3px 10px", height: "26px", fontSize: "11px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-main)", gap: "4px", cursor: "pointer" }}
            >
              <span>{getPeriodLabel(period)}</span>
              <ChevronDown style={{ width: "12px", height: "12px", opacity: 0.5 }} />
            </button>
            {dropdownOpen && (
              <div 
                className="glass-card" 
                style={{ position: "absolute", top: "30px", right: 0, zIndex: 99, padding: "5px 0", minWidth: "110px", border: "1px solid var(--border-subtle)", background: "var(--bg-input)" }}
              >
                {["2w", "3w", "1m", "2m", "all"].map((p) => (
                  <div 
                    key={p} 
                    onClick={() => { setPeriod(p); setDropdownOpen(false); }}
                    style={{ padding: "7px 12px", fontSize: "11px", cursor: "pointer", background: period === p ? "var(--primary-light)" : "transparent", color: period === p ? "var(--primary)" : "var(--text-main)", fontWeight: period === p ? 700 : 500, textAlign: "center" }}
                    onMouseEnter={(e) => { if (period !== p) e.currentTarget.style.background = "var(--border-subtle)"; }}
                    onMouseLeave={(e) => { if (period !== p) e.currentTarget.style.background = "transparent"; }}
                  >
                    {getPeriodLabel(p)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid Layout: Representing Image & Score Trend Graph */}
      {filtered.length === 0 ? (
        <div className="glass-card" style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "var(--text-light)" }}>
          <ImageIcon style={{ width: "40px", height: "40px", opacity: 0.3, marginBottom: "12px" }} />
          <span style={{ fontSize: "14px", fontWeight: 600 }}>해당 기간에 평가 기록이 없습니다.</span>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "10px", marginBottom: "10px" }}>
            {/* Card 1: Representing Image */}
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", minHeight: "200px", minWidth: 0 }}>
              <h3 style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>대표 과제물 이미지</h3>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.02)", border: "1px dashed var(--border-subtle)", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {filtered[filtered.length - 1].imageUrl ? (
                  <img
                    src={normalizeDriveUrl(filtered[filtered.length - 1].imageUrl!)}
                    alt="Latest student submission"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div style={{ textAlign: "center", color: "var(--text-light)" }}>
                    <ImageIcon style={{ width: "24px", height: "24px", opacity: 0.3, margin: "0 auto 6px" }} />
                    <span style={{ fontSize: "11px" }}>과제 이미지 없음</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Score Trend Chart */}
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", minHeight: "200px", minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h3 style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em" }}>점수 추이</h3>
                
                {/* Stats list */}
                <div style={{ display: "flex", gap: "4px" }}>
                  <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "2px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{fmt(latestScore)}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-light)" }}>최근</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "2px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: trend && trend > 0 ? "var(--success)" : trend && trend < 0 ? "var(--danger)" : "var(--text-main)" }}>
                      {trend !== null ? (trend > 0 ? `+${fmt(trend)}` : fmt(trend)) : "—"}
                    </div>
                    <div style={{ fontSize: "9px", color: "var(--text-light)" }}>증감</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "2px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{fmt(avgScore)}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-light)" }}>평균</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "2px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>{fmt(maxScore)}<span style={{ fontSize: "10px", color: "var(--text-light)" }}>/{fmt(minScore)}</span></div>
                    <div style={{ fontSize: "9px", color: "var(--text-light)" }}>최고/최저</div>
                  </div>
                </div>
              </div>

              <div className="chart-wrap" style={{ flex: 1, position: "relative", width: "100%", height: pdfMode ? "220px" : "auto", overflow: "hidden" }}>
                <canvas ref={chartRef} id="board-chart" style={{ width: "100%", height: "100%" }} />
              </div>
            </div>
          </div>

          {/* Card 3: Recent Evaluation details */}
          <div className="glass-card" style={{ marginBottom: "10px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>최근 평가 피드백</h3>
            <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>{filtered[filtered.length - 1].date}</span>
                <span className="font-display" style={{ fontSize: "32px", fontWeight: 700, color: "#185FA5", lineHeight: 1 }}>
                  {fmt(filtered[filtered.length - 1].score)}<span style={{ fontSize: "12px", color: "var(--text-light)", marginLeft: "2px" }}>/ 10</span>
                </span>
              </div>
              <p style={{ fontSize: "14px", color: "var(--text-main)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                {filtered[filtered.length - 1].critic || "(크리틱 내용 없음)"}
              </p>
            </div>
          </div>

          {/* Expandable Accordion: Previous Evaluation History list */}
          <div style={{ marginBottom: "10px" }}>
            <button 
              onClick={() => !pdfMode && setHistOpen(!histOpen)}
              className="btn" 
              style={{ width: "100%", justifyContent: "space-between", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", padding: "10px 14px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", cursor: pdfMode ? "default" : "pointer", display: "flex", alignItems: "center" }}
            >
              <span>이전 평가 기록 보기 ({getFilteredHistoryRecords().length}회)</span>
              {!pdfMode && (histOpen ? <ChevronUp style={{ width: "16px", height: "16px" }} /> : <ChevronDown style={{ width: "16px", height: "16px" }} />)}
            </button>
            
            {histOpen && (
              <div className="animated-fade-in" style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {/* Period filter for history list (hidden in PDF mode) */}
                {!pdfMode && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-light)" }}>조회 기간 설정:</span>
                    <div className="history-period-wrap" style={{ position: "relative" }}>
                      <button 
                        onClick={() => setHistoryDropdownOpen(!historyDropdownOpen)} 
                        className="btn" 
                        style={{ padding: "3px 10px", height: "26px", fontSize: "11px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-main)", gap: "4px", cursor: "pointer" }}
                      >
                        <span>{getPeriodLabel(historyPeriod)}</span>
                        <ChevronDown style={{ width: "12px", height: "12px", opacity: 0.5 }} />
                      </button>
                      {historyDropdownOpen && (
                        <div 
                          className="glass-card" 
                          style={{ position: "absolute", bottom: "30px", right: 0, zIndex: 99, padding: "5px 0", minWidth: "110px", border: "1px solid var(--border-subtle)", background: "var(--bg-input)" }}
                        >
                          {["2w", "3w", "1m", "2m", "all"].map((p) => (
                            <div 
                              key={p} 
                              onClick={() => { setHistoryPeriod(p); setHistoryDropdownOpen(false); }}
                              style={{ padding: "7px 12px", fontSize: "11px", cursor: "pointer", background: historyPeriod === p ? "var(--primary-light)" : "transparent", color: historyPeriod === p ? "var(--primary)" : "var(--text-main)", fontWeight: historyPeriod === p ? 700 : 500, textAlign: "center" }}
                              onMouseEnter={(e) => { if (historyPeriod !== p) e.currentTarget.style.background = "var(--border-subtle)"; }}
                              onMouseLeave={(e) => { if (historyPeriod !== p) e.currentTarget.style.background = "transparent"; }}
                            >
                              {getPeriodLabel(p)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Print-only selected period label in PDF mode */}
                {pdfMode && (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 4px", fontSize: "11px", color: "var(--text-light)" }}>
                    <span>기간: {getPeriodLabel(historyPeriod)}</span>
                  </div>
                )}

                {getFilteredHistoryRecords().reverse().map((r, index) => {
                  const pct = Math.round((r.score / 10) * 100);
                  const bc = r.score >= 9 ? "var(--success)" : r.score <= 4 ? "var(--danger)" : "#185FA5";

                  return (
                    <div 
                      key={r.pageId || index} 
                      style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "12px 14px", background: "var(--bg-card)" }}
                      className="glass-card"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-light)" }}>{r.date}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontSize: "15px", fontWeight: 700 }}>{fmt(r.score)}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-light)" }}>/ 10</span>
                          {r.notionUrl && (
                            <a href={r.notionUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-light)", display: "inline-flex", alignItems: "center" }} className="no-print">
                              <ExternalLink style={{ width: "12px", height: "12px", marginLeft: "3px" }} />
                            </a>
                          )}
                        </div>
                      </div>
                      <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                        {r.critic || "(크리틱 없음)"}
                      </p>
                      
                      <div style={{ height: "3px", background: "var(--border-subtle)", borderRadius: "2px", marginTop: "8px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: bc, borderRadius: "2px" }} />
                      </div>
                    </div>
                  );
                })}
                {getFilteredHistoryRecords().length === 0 && (
                  <div className="glass-card" style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "var(--text-light)" }}>
                    선택한 기간 내 이전 평가 기록이 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Gen-Z Advisor Advice Card */}
          <div className="glass-card" style={{ border: "1px solid rgba(59, 130, 246, 0.2)", background: "rgba(59, 130, 246, 0.03)", padding: "16px", marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles style={{ width: "16px", height: "16px", color: "var(--primary)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 700 }} className="font-display">🤖 건축학과 AI 젠지(Gen-Z) 조언</h3>
              </div>
              
              {/* Individual manual advice generation button (visible to professors only) */}
              {sessionData && isRegistered && !pdfMode && (
                <button
                  onClick={generateSingleAdvice}
                  disabled={isReadOnly || singleAdviceGenerating || allRecords.length === 0}
                  className="btn"
                  style={{
                    padding: "3px 8px",
                    fontSize: "11px",
                    background: "var(--primary-light)",
                    color: "var(--primary)",
                    border: "1px solid rgba(42, 111, 191, 0.3)",
                    borderRadius: "6px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer"
                  }}
                >
                  {singleAdviceGenerating ? (
                    <Loader2 className="animated-spin" style={{ width: "12px", height: "12px" }} />
                  ) : (
                    <Sparkles style={{ width: "12px", height: "12px" }} />
                  )}
                  <span>{aiAdvice ? "조언 다시 받기" : "조언 생성하기"}</span>
                </button>
              )}
            </div>
            
            {adviceLoading ? (
              <div style={{ display: "flex", gap: "6px", alignItems: "center", padding: "12px 0" }}>
                <Loader2 className="animated-spin" style={{ width: "16px", height: "16px", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: "12px", color: "var(--text-light)" }}>AI 조언을 분석하는 중...</span>
              </div>
            ) : aiAdvice ? (
              <div style={{ fontSize: "13.5px", color: "var(--text-main)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {aiAdvice}
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-light)", padding: "8px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                <Info style={{ width: "14px", height: "14px" }} />
                아직 AI 조언이 등록되지 않았습니다.{sessionData && " 우측 상단의 생성 버튼을 눌러보세요."}
              </div>
            )}
          </div>

          {/* Footer details */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-light)" }}>
              {allRecords.length}회 평가 &middot; {allRecords[0].date} – {allRecords[allRecords.length - 1].date}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
              담당교수 : 김태훈 &middot; 정미연 &middot; 하신해
            </div>
          </div>
        </>
      )}

      {/* Toast Notification Container */}
      <div className={`toast ${toastShow ? "show" : ""}`} style={{ background: "var(--success)" }}>
        {toastMessage}
      </div>
      
      {/* Toast CSS style if needed */}
      <style jsx global>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .animated-spin { animation: spin 1s linear infinite; }
        .scroll-hidden::-webkit-scrollbar { display: none; }
        .scroll-hidden { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// Wrap in Suspense boundary for Next.js App Router compliance
export default function StudentBoard() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
        <Loader2 className="animated-spin" style={{ width: "36px", height: "36px", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: "14px", color: "var(--text-muted)", fontWeight: 500 }}>초기화 중...</span>
      </div>
    }>
      <StudentBoardContent />
    </Suspense>
  );
}
