"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { DEFAULT_SEMESTER, normalizeSemester, type SemesterKey } from "@/lib/semester";
import { 
  LogOut, 
  BookOpen, 
  Plus, 
  Trash, 
  Loader2, 
  CheckCircle, 
  Upload, 
  Award, 
  Sparkles, 
  Download, 
  Sun, 
  Moon, 
  ExternalLink,
  ChevronRight,
  Info,
  Settings,
  FileText,
  CalendarPlus
} from "lucide-react";

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
  division: "1분반" | "2분반" | "";
  overall: string;
  overallClass1: string;
  overallClass2: string;
  description: string;
}

interface Evaluation {
  pageId: string;
  studentPageId: string;
  sessionPageId: string;
  professor: string;
  score: number;
  critic: string;
  date: string;
  imageUrl?: string;
  notionUrl?: string;
}

export default function Home() {
  const { data: sessionData, status } = useSession();
  const [darkMode, setDarkMode] = useState(false);
  
  // App Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<SemesterKey>(DEFAULT_SEMESTER);
  const [evalMap, setEvalMap] = useState<Record<string, Evaluation>>({});
  const [loading, setLoading] = useState(true);
  const [evalsLoading, setEvalsLoading] = useState(false);

  // Professor Auths & Signup States
  const [authInfo, setAuthInfo] = useState({ isRegistered: false, name: "", email: "", classes: [] as ("1분반" | "2분반")[] });
  const [dynamicProfessors, setDynamicProfessors] = useState<string[]>(["김태훈", "정미연", "하신해"]);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  
  // Signup Form States
  const [regName, setRegName] = useState("");
  const [regClasses, setRegClasses] = useState<("1분반" | "2분반")[]>([]);
  const [regPasscode, setRegPasscode] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Session Creation Form States
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionDate, setNewSessionDate] = useState("");
  const [newSessionDesc, setNewSessionDesc] = useState("");
  const [sessionSubmitting, setSessionSubmitting] = useState(false);

  // Settings Dropdown & Notion Page Generation States
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [notionPageGenerating, setNotionPageGenerating] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const openSessionModal = () => {
    setNewSessionDate(getTodayString());
    setNewSessionName("");
    setNewSessionDesc("");
    setShowSessionModal(true);
  };

  // Form States
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [selectedProfessor, setSelectedProfessor] = useState("김태훈");
  const [overallText, setOverallText] = useState("");
  const [currentFilter, setCurrentFilter] = useState<"1분반" | "2분반" | "all">("1분반");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Score & Critic States
  const [score, setScore] = useState(7);
  const [critic, setCritic] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // PDF Export Status States
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportCurrentName, setExportCurrentName] = useState("");

  const evalPanelRef = useRef<HTMLDivElement>(null);
  const isReadOnly = selectedSemester === "2026-1";
  const overallDivision: "1분반" | "2분반" = selectedProfessor === "김태훈" ? "1분반" : "2분반";
  const sessionDivision = selectedSemester === "2026-2" && currentFilter !== "all" ? currentFilter : null;
  const visibleSessions = sessionDivision
    ? sessions.filter((session) => session.division === sessionDivision)
    : sessions;
  const getSessionOverall = (session: Session) => {
    if (selectedSemester === "2026-1") return session.overall || "";
    return overallDivision === "1분반" ? session.overallClass1 || "" : session.overallClass2 || "";
  };

  // Close settings dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Theme Configuration
  useEffect(() => {
    setSelectedSemester(normalizeSemester(new URLSearchParams(window.location.search).get("semester")));
    const isDark = localStorage.getItem("theme") === "dark";
    setDarkMode(isDark);
    if (isDark) document.body.classList.add("dark");
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

  // 2. Fetch Initial Data (Students & Sessions)
  useEffect(() => {
    if (status === "authenticated") {
      setLoading(true);
      setStudents([]);
      setSessions([]);
      setEvalMap({});
      setCurrentSessionId("");
      setOverallText("");
      setSelectedStudent(null);
      fetch(`/api/init-data?semester=${selectedSemester}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.students) setStudents(data.students);
          if (data.sessions) {
            setSessions(data.sessions);
            if (selectedSemester === "2026-1" && data.sessions.length > 0) {
              // Select most recent session by default
              setCurrentSessionId(data.sessions[0].id);
              setOverallText(getSessionOverall(data.sessions[0]));
            }
          }
          let resolvedProfessors = ["김태훈", "정미연", "하신해"];
          if (data.professors && data.professors.length > 0) {
            resolvedProfessors = Array.from(new Set(data.professors));
            setDynamicProfessors(resolvedProfessors);
          }
          if (data.authInfo) {
            setAuthInfo(data.authInfo);
            if (data.authInfo.isRegistered) {
              const profName = data.authInfo.name;
              if (profName) {
                // Ensure the logged-in professor's name is dynamically added to the list if not present
                if (!resolvedProfessors.includes(profName)) {
                  resolvedProfessors = [...resolvedProfessors, profName];
                  setDynamicProfessors(resolvedProfessors);
                }
                setSelectedProfessor(profName);

                // 2학기 수업 운영 기본값: 김태훈은 1분반,
                // 정미연·하신해는 2분반을 먼저 연다. 탭으로 모든 분반 조회는 항상 가능하다.
                if (selectedSemester === "2026-2") {
                  if (profName === "김태훈") setCurrentFilter("1분반");
                  if (profName === "정미연" || profName === "하신해") setCurrentFilter("2분반");
                }
              }
            } else {
              setShowRegisterModal(true);
              setRegName(data.authInfo.name);
            }
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Init data load failed:", err);
          showToast("데이터 로드 실패!");
          setLoading(false);
        });
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status, selectedSemester]);

  // 2학기는 분반별 독립 세션을 사용한다. 학생 목록 분반을 바꾸면 해당 분반의 최근 세션으로 전환한다.
  useEffect(() => {
    if (!sessionDivision) return;
    const matchingSessions = sessions.filter((session) => session.division === sessionDivision);
    if (matchingSessions.length === 0) {
      if (currentSessionId) setCurrentSessionId("");
      return;
    }
    if (!matchingSessions.some((session) => session.id === currentSessionId)) {
      setCurrentSessionId(matchingSessions[0].id);
    }
  }, [sessionDivision, sessions, currentSessionId]);

  // 3. Fetch Evaluations when Session Changes
  useEffect(() => {
    if (currentSessionId) {
      setEvalsLoading(true);
      fetch(`/api/evals?sessionId=${currentSessionId}&semester=${selectedSemester}`)
        .then((res) => res.json())
        .then((data) => {
          setEvalMap(data);
          setEvalsLoading(false);
          setSelectedStudent(null);
        })
        .catch((err) => {
          console.error("Failed to load evaluations:", err);
          setEvalsLoading(false);
        });
    }
  }, [currentSessionId, selectedSemester]);

  // 현재 로그인/선택 교수의 담당 분반 총평을 세션별로 불러온다.
  useEffect(() => {
    const selectedSession = sessions.find((s) => s.id === currentSessionId);
    if (selectedSession) setOverallText(getSessionOverall(selectedSession));
  }, [currentSessionId, sessions, selectedSemester, selectedProfessor, overallDivision]);

  // Toast message helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2500);
  };

  // Handle professor registration submission
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || regClasses.length === 0 || !regPasscode.trim()) {
      showToast("모든 빈칸을 채워주세요.");
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch("/api/auth/register-professor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          email: authInfo.email,
          classes: regClasses,
          passcode: regPasscode.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || "교수 등록이 완료되었습니다!");
        const updatedAuth = {
          isRegistered: true,
          name: regName.trim(),
          email: authInfo.email,
          classes: regClasses,
        };
        setAuthInfo(updatedAuth);
        setSelectedProfessor(regName.trim());
        if (!regClasses.includes(currentFilter as any)) {
          setCurrentFilter(regClasses[0]);
        }
        setDynamicProfessors(prev => prev.includes(regName.trim()) ? prev : [...prev, regName.trim()]);
        setShowRegisterModal(false);
      } else {
        throw new Error(data.error || "등록 실패");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`등록 실패: ${err.message}`);
    } finally {
      setRegLoading(false);
    }
  };

  // Handle session creation submission
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!newSessionName.trim() || !newSessionDate.trim()) {
      showToast("세션명과 날짜를 모두 입력해주세요.");
      return;
    }
    setSessionSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionName: newSessionName.trim(),
          date: newSessionDate.trim(),
          description: newSessionDesc.trim(),
          division: overallDivision,
          semester: selectedSemester,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        showToast("수업 세션이 생성되었습니다!");
        
        const created: Session = data.session;
        setSessions(prev => [created, ...prev]);
        
        // 새 세션의 분반과 학생 목록을 함께 맞춘다.
        setCurrentFilter(created.division || overallDivision);
        setCurrentSessionId(created.id);
        setOverallText("");
        
        setShowSessionModal(false);
      } else {
        throw new Error(data.error || "세션 생성 실패");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`세션 생성 오류: ${err.message}`);
    } finally {
      setSessionSubmitting(false);
    }
  };

  // Select a student for evaluation
  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    const existingEval = evalMap[student.id];
    if (existingEval) {
      setScore(existingEval.score);
      setCritic(existingEval.critic || "");
      setCurrentImageUrl(existingEval.imageUrl || "");
    } else {
      setScore(7);
      setCritic("");
      setCurrentImageUrl("");
    }
    
    // Smooth scroll to panel
    setTimeout(() => {
      evalPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  // Image Upload handler
  const handleImageFile = async (file: File) => {
    if (isReadOnly) return;
    if (!selectedStudent) {
      showToast("학생을 먼저 선택해 주세요.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setUploadingImage(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("studentName", selectedStudent.name);
    formData.append("studentOrder", String(selectedStudent.order));
    formData.append("studentCls", selectedStudent.cls);
    const sessionObj = sessions.find((s) => s.id === currentSessionId);
    if (sessionObj) {
      formData.append("sessionDate", sessionObj.date);
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.imageUrl) {
        setCurrentImageUrl(data.imageUrl);
        showToast("이미지 업로드 완료!");
      } else {
        throw new Error(data.error || "업로드 실패");
      }
    } catch (e: any) {
      console.error(e);
      showToast(`업로드 실패: ${e.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  // Save current student evaluation
  const handleSaveEval = async () => {
    if (isReadOnly) return;
    if (!selectedStudent || !currentSessionId) return;
    const sessionObj = sessions.find((s) => s.id === currentSessionId);
    if (!sessionObj) return;

    const btn = document.getElementById("save-btn") as HTMLButtonElement;
    if (btn) btn.disabled = true;

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentPageId: selectedStudent.id,
          studentName: selectedStudent.name,
          sessionPageId: currentSessionId,
          sessionName: sessionObj.sessionName,
          professor: selectedProfessor,
          score,
          critic,
          imageUrl: currentImageUrl,
          semester: selectedSemester,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEvalMap((prev) => ({
          ...prev,
          [selectedStudent.id]: data.evaluation,
        }));
        showToast(`${selectedStudent.name} 평가 저장 완료!`);
        setSelectedStudent(null);
      } else {
        throw new Error(data.error || "저장 실패");
      }
    } catch (e: any) {
      console.error(e);
      showToast(`저장 실패: ${e.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // Save overall session review
  const handleSaveOverall = async () => {
    if (isReadOnly) return;
    if (!currentSessionId) return;
    const btn = document.getElementById("overall-btn") as HTMLButtonElement;
    if (btn) btn.disabled = true;

    try {
      const res = await fetch("/api/overall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionPageId: currentSessionId,
          overall: overallText,
          division: overallDivision,
          semester: selectedSemester,
        }),
      });

      if (res.ok) {
        // Update session text locally
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== currentSessionId) return s;
            return overallDivision === "1분반"
              ? { ...s, overallClass1: overallText }
              : { ...s, overallClass2: overallText };
          })
        );
        showToast(`${overallDivision} 총평 저장 완료!`);
      } else {
        const data = await res.json();
        throw new Error(data.error || "총평 저장 실패");
      }
    } catch (e: any) {
      console.error(e);
      showToast(`총평 저장 실패: ${e.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // Notion 수업 페이지 자동 생성
  const handleGenerateNotionPage = async () => {
    if (isReadOnly) return;
    if (!currentSessionId) {
      showToast("먼저 수업 세션을 선택해 주세요.");
      return;
    }
    setShowSettingsDropdown(false);
    setNotionPageGenerating(true);
    try {
      const res = await fetch("/api/notion-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId, semester: selectedSemester }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || "Notion 수업 페이지 생성 완료!");
        if (data.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
        }
      } else {
        throw new Error(data.error || "생성 실패");
      }
    } catch (e: any) {
      console.error(e);
      showToast(`Notion 페이지 생성 실패: ${e.message}`);
    } finally {
      setNotionPageGenerating(false);
    }
  };

  // PDF Bulk Export to Google Drive Function
  const handleBulkExportPdf = async () => {
    if (!currentSessionId) return;
    const sessionObj = sessions.find((s) => s.id === currentSessionId);
    if (!sessionObj) return;

    // Get all evaluated students in the current session
    const evaluatedList = students.filter((s) => !!evalMap[s.id]);
    if (evaluatedList.length === 0) {
      showToast("평가된 학생이 없습니다.");
      return;
    }

    setExportingPdf(true);
    setExportProgress(0);
    setExportTotal(evaluatedList.length);
    setExportCurrentName("구글 드라이브 폴더 생성 중...");

    try {
      // 1. Create or retrieve folder in Google Drive
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
      if (!folderData.folderId) {
        throw new Error(folderData.error || "폴더를 생성할 수 없습니다.");
      }

      const folderId = folderData.folderId;

      const failedExports: string[] = [];

      // 2. Export each student one by one
      for (let i = 0; i < evaluatedList.length; i++) {
        const student = evaluatedList[i];
        setExportCurrentName(`${student.name} (${i + 1}/${evaluatedList.length}) PDF 생성 중...`);
        
        const exportRes = await fetch("/api/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "export_pdf",
            studentId: student.id,
            studentName: student.name,
            folderId: folderId,
            semester: selectedSemester,
          }),
        });

        const exportData = await exportRes.json();
        if (!exportRes.ok || exportData.error) {
          const reason = exportData.error || `HTTP ${exportRes.status}`;
          failedExports.push(`${student.name}: ${reason}`);
          console.error(`Failed to export ${student.name}:`, reason);
        }
        
        setExportProgress(i + 1);
      }

      if (failedExports.length > 0) {
        throw new Error(`${failedExports.length}명 PDF 생성 실패 — ${failedExports.slice(0, 3).join(" / ")}`);
      }

      showToast("구글 드라이브에 PDF 전체 업로드 완료!");
    } catch (e: any) {
      console.error(e);
      showToast(`내보내기 실패: ${e.message}`);
    } finally {
      setExportingPdf(false);
    }
  };

  // Helper formatting values
  const fmt = (v: any) => {
    const n = parseFloat(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  // Authentication Gate Page (Professor Login)
  if (status === "loading" || loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
        <Loader2 className="animated-spin" style={{ width: "38px", height: "38px", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: "14px", color: "var(--text-muted)", fontWeight: 500 }}>로딩 중...</span>
        <style jsx global>{`
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div className="glass-card animated-slide-up" style={{ width: "100%", maxWidth: "420px", textAlign: "center", padding: "40px 30px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
              <Award style={{ width: "32px", height: "32px" }} />
            </div>
          </div>
          <h1 style={{ fontSize: "24px", marginBottom: "8px", fontWeight: 700 }}>건축설계 크리틱 로그</h1>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "32px", lineHeight: 1.5 }}>
            2026학년도 건축설계 수업 통합 관리 시스템.<br />교수님 구글 계정으로 로그인해 평가를 시작하세요.
          </p>
          <button onClick={() => signIn("google")} className="btn btn-primary" style={{ width: "100%", padding: "14px", fontSize: "15px" }}>
            구글 계정으로 시작하기
          </button>
        </div>
      </div>
    );
  }

  // Filter students based on class division tabs
  const filteredStudents = students.filter((s) => {
    if (currentFilter === "all") return true;
    return s.cls === currentFilter;
  });

  const evaluatedCount = students.filter((s) => !!evalMap[s.id]).length;
  const progressPercent = students.length > 0 ? Math.round((evaluatedCount / students.length) * 100) : 0;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px 16px 60px" }} className="animated-fade-in">
      {/* 1. Navigation & Floating Options */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }} className="no-print">
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-muted)" }}>교수 평가 입력폼</span>
          <span style={{ color: "var(--border-subtle)" }}>|</span>
          <Link href={`/board?semester=${selectedSemester}`} style={{ fontSize: "14px", color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
            학생 크리틱 대시보드
          </Link>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={toggleTheme} className="theme-switch-btn" aria-label="Toggle theme">
            {darkMode ? <Sun style={{ width: "18px", height: "18px" }} /> : <Moon style={{ width: "18px", height: "18px" }} />}
          </button>

          {/* ⚙️ 설정 드롭다운 */}
          <div ref={settingsRef} style={{ position: "relative" }}>
            <button
              id="settings-btn"
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
                {/* 새 수업 세션 추가 */}
                <button
                  id="settings-add-session"
                  onClick={() => { setShowSettingsDropdown(false); openSessionModal(); }}
                  disabled={isReadOnly}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: isReadOnly ? "default" : "pointer",
                    opacity: isReadOnly ? 0.45 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-light)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <CalendarPlus style={{ width: "15px", height: "15px", color: "var(--secondary)", flexShrink: 0 }} />
                  새 수업 세션 추가
                </button>

                {/* 구분선 */}
                <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 4px" }} />

                {/* Notion 수업 페이지 생성 */}
                <button
                  id="settings-notion-page"
                  onClick={handleGenerateNotionPage}
                  disabled={isReadOnly || notionPageGenerating || !currentSessionId}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    color: notionPageGenerating ? "var(--text-light)" : "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: notionPageGenerating ? "default" : "pointer",
                    opacity: isReadOnly || !currentSessionId ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!notionPageGenerating) e.currentTarget.style.background = "var(--primary-light)"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {notionPageGenerating ? (
                    <Loader2 style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} className="animated-spin" />
                  ) : (
                    <FileText style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} />
                  )}
                  {notionPageGenerating ? "Notion 페이지 생성 중..." : "Notion 수업 페이지 생성"}
                </button>

                {/* 구분선 */}
                <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 4px" }} />

                {/* PDF 일괄 생성 */}
                <button
                  id="settings-pdf-export"
                  onClick={() => { setShowSettingsDropdown(false); handleBulkExportPdf(); }}
                  disabled={exportingPdf}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    color: exportingPdf ? "var(--text-light)" : "var(--text-main)",
                    borderRadius: "8px",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: exportingPdf ? "default" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (!exportingPdf) e.currentTarget.style.background = "var(--primary-light)"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Download style={{ width: "15px", height: "15px", color: "var(--text-muted)", flexShrink: 0 }} />
                  오늘 수업 PDF 일괄 생성
                </button>
              </div>
            )}
          </div>

          <button onClick={() => signOut()} className="theme-switch-btn" style={{ color: "var(--danger)" }} aria-label="Logout">
            <LogOut style={{ width: "18px", height: "18px" }} />
          </button>
        </div>
      </div>

      {/* 2. Top Header Card */}
      <div className="glass-card" style={{ marginBottom: "12px", borderLeft: "5px solid var(--primary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "20px", marginBottom: "4px" }}>교수 평가 관리 콘솔</h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              접속 교수: <strong style={{ color: "var(--text-main)" }}>{sessionData.user?.name || "교수"}</strong>님
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
            <div style={{ display: "inline-flex", padding: "2px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.03)" }} aria-label="학기 선택">
              {(["2026-2", "2026-1"] as SemesterKey[]).map((semester) => (
                <button
                  key={semester}
                  type="button"
                  onClick={() => setSelectedSemester(semester)}
                  className="btn"
                  style={{
                    padding: "4px 9px",
                    fontSize: "11px",
                    border: "none",
                    borderRadius: "6px",
                    background: selectedSemester === semester ? "var(--primary)" : "transparent",
                    color: selectedSemester === semester ? "#fff" : "var(--text-muted)",
                    fontWeight: selectedSemester === semester ? 700 : 500,
                  }}
                >
                  {semester === "2026-2" ? "2학기" : "1학기"}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "10px", color: isReadOnly ? "var(--danger)" : "var(--text-light)" }}>
              {isReadOnly ? "건축설계 A · 1학기 조회 전용" : "건축설계 B · 2026학년도 2학기"}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Session Selection Box */}
      <div className="glass-card" style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>수업 세션 설정</h3>
          <span style={{ fontSize: "11px", color: isReadOnly ? "var(--danger)" : "var(--text-light)" }}>{isReadOnly ? "조회 전용" : "⚙️ 설정에서 세션 추가"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label>수업 날짜 / 세션 {sessionDivision ? `(${sessionDivision})` : ""}</label>
            <select value={currentSessionId} onChange={(e) => setCurrentSessionId(e.target.value)}>
              {visibleSessions.length === 0 && <option value="">선택된 분반의 세션이 없습니다.</option>}
              {visibleSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date ? `${s.date.substring(5).replace("-", "/")} — ` : ""}{s.sessionName}{!sessionDivision && s.division ? ` · ${s.division}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>평가 담당 교수</label>
            <select value={selectedProfessor} onChange={(e) => setSelectedProfessor(e.target.value)}>
              {dynamicProfessors.map((prof) => (
                <option key={prof} value={prof}>
                  {prof}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Session Overall Comment Card */}
      <div className="glass-card" style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {isReadOnly ? "수업 공동 총평" : `${overallDivision} 수업 총평`}
          </h3>
          <button onClick={handleSaveOverall} disabled={isReadOnly} id="overall-btn" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "12px", opacity: isReadOnly ? 0.5 : 1 }}>
            총평 저장
          </button>
        </div>
        <textarea
          value={overallText}
          onChange={(e) => setOverallText(e.target.value)}
          readOnly={isReadOnly}
          placeholder={isReadOnly ? "수업 총평을 확인하세요." : `오늘 ${overallDivision} 학생들에게 공통으로 보완·강조할 총평을 작성하세요.`}
          style={{ minHeight: "100px", fontSize: "13px" }}
        />
      </div>

      {/* 5. Student Grid Card */}
      <div className="glass-card" style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>학생 목록 선택</h3>
          
          <div style={{ display: "flex", gap: "6px" }}>
            <button 
              onClick={() => setCurrentFilter("1분반")} 
              className="btn" 
              style={{ padding: "4px 12px", borderRadius: "15px", fontSize: "11px", background: currentFilter === "1분반" ? "var(--primary)" : "transparent", color: currentFilter === "1분반" ? "#fff" : "var(--text-main)", border: "1px solid var(--border-subtle)" }}
            >
              1분반
            </button>
            <button 
              onClick={() => setCurrentFilter("2분반")} 
              className="btn" 
              style={{ padding: "4px 12px", borderRadius: "15px", fontSize: "11px", background: currentFilter === "2분반" ? "var(--primary)" : "transparent", color: currentFilter === "2분반" ? "#fff" : "var(--text-main)", border: "1px solid var(--border-subtle)" }}
            >
              2분반
            </button>
            <button 
              onClick={() => setCurrentFilter("all")} 
              className="btn" 
              style={{ padding: "4px 12px", borderRadius: "15px", fontSize: "11px", background: currentFilter === "all" ? "var(--primary)" : "transparent", color: currentFilter === "all" ? "#fff" : "var(--text-main)", border: "1px solid var(--border-subtle)" }}
            >
              전체
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ flex: 1, height: "6px", background: "var(--border-subtle)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${progressPercent}%`, height: "100%", background: "var(--success)", borderRadius: "3px", transition: "width 0.4s ease" }} />
          </div>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {evaluatedCount} / {students.length} 평가 완료 ({progressPercent}%)
          </span>
        </div>

        {/* PDF & Notion hint — moved to ⚙️ settings dropdown */}
        <div style={{ marginBottom: "8px", fontSize: "11px", color: "var(--text-light)", display: "flex", alignItems: "center", gap: "5px" }}>
          <Settings style={{ width: "11px", height: "11px" }} />
          PDF 일괄 생성·Notion 수업 페이지 생성은 우상단 ⚙️ 설정에서 할 수 있습니다.
        </div>

        {/* Students list loading spinner */}
        {evalsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
            <Loader2 className="animated-spin" style={{ width: "24px", height: "24px", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
            {filteredStudents.map((st) => {
              const ev = evalMap[st.id];
              const isSelected = selectedStudent?.id === st.id;
              
              let cardClass = "student-card-wrapper";
              let cardStyle: React.CSSProperties = {
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "10px 12px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: isSelected 
                  ? "var(--primary-light)" 
                  : ev 
                    ? "var(--success-light)" 
                    : "var(--bg-input)",
                borderColor: isSelected 
                  ? "var(--primary)" 
                  : ev 
                    ? "var(--success)" 
                    : "var(--border-subtle)",
              };

              return (
                <div 
                  key={st.id} 
                  style={cardStyle} 
                  onClick={() => handleSelectStudent(st)}
                  className="glass-card-interactive"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: ev && !isSelected ? "var(--success)" : isSelected ? "var(--primary)" : "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "4px" }}>
                      {st.name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
                      {ev && (
                        <>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--success)" }}>{fmt(ev.score)}</span>
                          <CheckCircle style={{ width: "12px", height: "12px", color: "var(--success)" }} />
                        </>
                      )}
                      {!ev && <span style={{ fontSize: "10px", color: "var(--text-light)" }}>{st.order}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Evaluation Panel (Visible when a student is selected) */}
      {selectedStudent && (
        <div ref={evalPanelRef} className="glass-card animated-slide-up" style={{ border: "1.5px solid var(--primary)", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, color: "var(--primary)" }}>
              {selectedStudent.name[0]}
            </div>
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: 700 }}>{selectedStudent.name} 평가 입력</h3>
              <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {selectedStudent.cls} &middot; {selectedStudent.order}번 학생
              </p>
            </div>
          </div>

          {/* Score Slider Area */}
          <div style={{ background: "rgba(0, 0, 0, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>평가 점수</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span className="font-display" style={{ fontSize: "36px", fontWeight: 700, color: "var(--primary)", lineHeight: 1 }}>{fmt(score)}</span>
                  <span style={{ fontSize: "14px", color: "var(--text-light)" }}>/ 10</span>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <input 
                  type="number" 
                  min="0" 
                  max="10" 
                  step="0.5" 
                  value={score} 
                  disabled={isReadOnly}
                  onChange={(e) => setScore(Math.min(10, Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={{ width: "70px", textAlign: "center", fontSize: "16px", fontWeight: 600, padding: "6px" }}
                />
                <div style={{ fontSize: "10px", color: "var(--text-light)", marginTop: "4px" }}>직접 입력</div>
              </div>
            </div>
            <input 
              type="range" 
              min="0" 
              max="10" 
              step="0.5" 
              value={score} 
              disabled={isReadOnly}
              onChange={(e) => setScore(parseFloat(e.target.value))}
              style={{ marginTop: "10px" }}
            />
          </div>

          {/* GCS Drag and Drop Upload */}
          <div style={{ marginBottom: "16px" }}>
            <label>과제물 대표 이미지</label>
            <div 
              className={`image-uploader-box ${isDragOver ? "drag-over" : ""}`}
              aria-disabled={isReadOnly}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !isReadOnly && document.getElementById("file-input")?.click()}
              style={{ opacity: isReadOnly ? 0.65 : 1, cursor: isReadOnly ? "default" : "pointer" }}
            >
              {uploadingImage ? (
                <>
                  <Loader2 className="animated-spin" style={{ width: "24px", height: "24px", color: "var(--primary)", animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>업로드 중...</span>
                </>
              ) : currentImageUrl ? (
                <div style={{ position: "relative", width: "100%", maxHeight: "160px", overflow: "hidden", borderRadius: "8px" }}>
                  <img src={currentImageUrl} alt="uploaded work" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", opacity: 0, transition: "opacity 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0"}>
                    <Upload style={{ width: "20px", height: "20px" }} />
                    <span style={{ fontSize: "11px", marginLeft: "6px" }}>이미지 변경</span>
                  </div>
                </div>
              ) : (
                <>
                  <Upload style={{ width: "28px", height: "28px" }} />
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>과제물 이미지 업로드 (클릭 또는 드래그)</span>
                  <span style={{ fontSize: "11px", color: "var(--text-light)" }}>Google Cloud Storage에 안전하게 저장됩니다.</span>
                </>
              )}
            </div>
            <input 
              id="file-input" 
              type="file" 
              accept="image/*" 
              disabled={isReadOnly}
              style={{ display: "none" }} 
              onChange={(e) => e.target.files && handleImageFile(e.target.files[0])}
            />
          </div>

          {/* Critic Input */}
          <div style={{ marginBottom: "20px" }}>
            <label>개별 크리틱 피드백</label>
            <textarea
              value={critic}
              onChange={(e) => setCritic(e.target.value)}
              readOnly={isReadOnly}
              placeholder="학생 개인별 크리틱 피드백을 입력하세요. AI 조언은 학생 보드에서 필요할 때 별도로 생성할 수 있습니다."
              style={{ minHeight: "150px" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px" }}>
              <Info style={{ width: "12px", height: "12px", color: "var(--text-light)" }} />
              <span style={{ fontSize: "11px", color: "var(--text-light)" }}>평가 저장 시 AI 토큰은 사용되지 않습니다.</span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {evalMap[selectedStudent.id]?.notionUrl ? (
              <a 
                href={evalMap[selectedStudent.id].notionUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-notion"
              >
                <ExternalLink style={{ width: "14px", height: "14px" }} />
                노션에서 열기
              </a>
            ) : <div />}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setSelectedStudent(null)} className="btn btn-secondary">
                취소
              </button>
              <button onClick={handleSaveEval} disabled={isReadOnly} id="save-btn" className="btn btn-primary" style={{ gap: "6px", opacity: isReadOnly ? 0.5 : 1 }}>
                <Sparkles style={{ width: "15px", height: "15px" }} />
                평가 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className={`toast ${toastShow ? "show" : ""}`} style={{ background: "var(--success)" }}>
        {toastMessage}
      </div>

      {/* PDF Export Progress Overlay Modal */}
      {exportingPdf && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} className="no-print">
          <div className="glass-card" style={{ width: "100%", maxWidth: "380px", textAlign: "center", padding: "30px 24px" }}>
            <Loader2 className="animated-spin" style={{ width: "36px", height: "36px", color: "var(--primary)", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
            <h4 style={{ fontSize: "16px", marginBottom: "8px", fontWeight: 700 }}>구글 드라이브 PDF 일괄 내보내기</h4>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>{exportCurrentName}</p>
            
            {/* Progress bar inside modal */}
            <div style={{ height: "6px", background: "var(--border-subtle)", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ width: `${(exportProgress / exportTotal) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: "3px", transition: "width 0.2s ease" }} />
            </div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-light)" }}>
              {exportProgress} / {exportTotal} 완료
            </div>
          </div>
        </div>
      )}

      {/* Professor Registration Overlay Modal */}
      {showRegisterModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} className="no-print">
          <div className="glass-card animated-slide-up" style={{ width: "100%", maxWidth: "440px", padding: "30px 24px", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
                <Award style={{ width: "24px", height: "24px" }} />
              </div>
            </div>
            <h4 style={{ fontSize: "18px", marginBottom: "8px", fontWeight: 700, textAlign: "center" }}>교수 계정 추가 등록</h4>
            <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "20px", textAlign: "center", lineHeight: 1.5 }}>
              인증되지 않은 구글 계정입니다. 크리틱 로그 시스템을 관리하려면 담당 교수 정보를 등록해야 합니다.
            </p>
            
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
              <div>
                <label>구글 계정 이메일 (자동입력)</label>
                <input 
                  type="text" 
                  value={authInfo.email} 
                  disabled 
                  style={{ background: "rgba(0, 0, 0, 0.05)", color: "var(--text-muted)", cursor: "not-allowed" }}
                />
              </div>

              <div>
                <label>교수명 (실명 입력)</label>
                <input 
                  type="text" 
                  required
                  placeholder="예: 정미연"
                  value={regName} 
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>

              <div>
                <label>담당 분반 (복수 선택 가능)</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                  {(["1분반", "2분반"] as const).map((cls) => {
                    const isChecked = regClasses.includes(cls);
                    return (
                      <button
                        type="button"
                        key={cls}
                        onClick={() => {
                          if (isChecked) {
                            setRegClasses(prev => prev.filter(c => c !== cls));
                          } else {
                            setRegClasses(prev => [...prev, cls]);
                          }
                        }}
                        className="btn"
                        style={{
                          flex: 1,
                          padding: "8px",
                          fontSize: "12px",
                          background: isChecked ? "var(--primary)" : "var(--bg-input)",
                          border: isChecked ? "1px solid var(--primary)" : "1px solid var(--border-subtle)",
                          color: isChecked ? "#fff" : "var(--text-main)",
                          fontWeight: 600,
                        }}
                      >
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label>가입 승인 패스코드</label>
                <input 
                  type="password" 
                  required
                  placeholder="관리자가 공유한 승인 패스코드를 입력하세요"
                  value={regPasscode} 
                  onChange={(e) => setRegPasscode(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button 
                  type="button" 
                  onClick={() => signOut()} 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: "10px" }}
                >
                  로그아웃
                </button>
                <button 
                  type="submit" 
                  disabled={regLoading}
                  className="btn btn-primary" 
                  style={{ flex: 1.5, padding: "10px", fontWeight: 700 }}
                >
                  {regLoading ? <Loader2 className="animated-spin" style={{ width: "16px", height: "16px" }} /> : "등록 완료"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Session Creation Overlay Modal */}
      {showSessionModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1900 }} className="no-print">
          <div className="glass-card animated-slide-up" style={{ width: "100%", maxWidth: "440px", padding: "30px 24px", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
            <h4 style={{ fontSize: "18px", marginBottom: "16px", fontWeight: 700, textAlign: "center" }}>새 수업 세션 추가</h4>
            
            <form onSubmit={handleCreateSession} style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
              <div>
                <label>대상 분반</label>
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--primary-light)", color: "var(--primary)", fontSize: "13px", fontWeight: 700 }}>
                  {overallDivision} <span style={{ fontSize: "11px", fontWeight: 500 }}>(접속 교수 기준 자동 지정)</span>
                </div>
              </div>

              <div>
                <label>수업 날짜</label>
                <input 
                  type="date" 
                  required
                  value={newSessionDate} 
                  onChange={(e) => setNewSessionDate(e.target.value)}
                />
              </div>

              <div>
                <label>수업 세션명</label>
                <input 
                  type="text" 
                  required
                  placeholder="예: 0524 대안크리틱 - 평면 레이아웃"
                  value={newSessionName} 
                  onChange={(e) => setNewSessionName(e.target.value)}
                />
              </div>

              <div>
                <label>과제/세션 설명 (선택)</label>
                <textarea 
                  placeholder="오늘 진행할 과제나 매스 스터디 핵심 내용을 적어주세요."
                  value={newSessionDesc} 
                  onChange={(e) => setNewSessionDesc(e.target.value)}
                  style={{ minHeight: "80px", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button 
                  type="button" 
                  onClick={() => setShowSessionModal(false)} 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: "10px" }}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  disabled={sessionSubmitting}
                  className="btn btn-primary" 
                  style={{ flex: 1.5, padding: "10px", fontWeight: 700 }}
                >
                  {sessionSubmitting ? <Loader2 className="animated-spin" style={{ width: "16px", height: "16px" }} /> : "세션 추가"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
