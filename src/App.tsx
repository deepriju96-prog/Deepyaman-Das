import React, { useState, useEffect } from "react";
import { auth, db, OperationType, handleFirestoreError, logout } from "./firebase";
import { collection, query, where, orderBy, deleteDoc, doc } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useCollection } from "react-firebase-hooks/firestore";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import KanbanBoard from "./components/KanbanBoard";
import AddJobForm from "./components/AddJobForm";
import JobDetailsModal from "./components/JobDetailsModal";
import BillingSection from "./components/BillingSection";
import ClientsSection from "./components/ClientsSection";
import WriterPerformanceSection from "./components/WriterPerformanceSection";
import ErrorBoundary from "./components/ErrorBoundary";
import NotificationsBell from "./components/NotificationsBell";
import GoogleDriveHub from "./components/GoogleDriveHub";
import { Plus, Layout, BarChart3, Calendar as CalendarIcon, Search, Filter, ReceiptText, Users, Trash2, X, Download, Sun, Moon, Menu, LogOut, Award, HardDrive } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";

export default function App() {
  const [user, authLoading] = useAuthState(auth);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState("All Clients");
  const [currentTab, setCurrentTab] = useState<"tracker" | "billing" | "clients" | "performance" | "drive">("tracker");
  const [jobToDelete, setJobToDelete] = useState<any | null>(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState<any | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [prefilledJobId, setPrefilledJobId] = useState<string | null>(null);
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);

  // Dark mode state and effects
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Fetch jobs for the current user
  const jobsQuery = user
    ? query(collection(db, "jobs"), where("userId", "==", user.uid), orderBy("createdAt", "desc"))
    : null;

  const [jobsSnapshot, jobsLoading, jobsError] = useCollection(jobsQuery);

  const jobs = jobsSnapshot?.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as any[] || [];

  const clientCodes = Array.from(new Set(jobs.map((job) => job.clientCode))).sort();

  const filteredJobs = jobs.filter((job) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return selectedClient === "All Clients" || job.clientCode === selectedClient;

    const matchesSearch = 
      job.clientCode?.toLowerCase().includes(query) ||
      job.notes?.toLowerCase().includes(query) ||
      job.jobName?.toLowerCase().includes(query) ||
      job.jobCode?.toLowerCase().includes(query) ||
      job.status?.toLowerCase().includes(query);
      
    const matchesClient = selectedClient === "All Clients" || job.clientCode === selectedClient;
    return matchesSearch && matchesClient;
  });

  const handleDeleteJob = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (job) {
      setJobToDelete(job);
    }
  };

  const executeDeleteJob = async () => {
    if (!jobToDelete) return;
    setIsDeletingJob(true);
    try {
      await deleteDoc(doc(db, "jobs", jobToDelete.id));
      setJobToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `jobs/${jobToDelete.id}`);
    } finally {
      setIsDeletingJob(false);
    }
  };

  const exportToCSV = () => {
    if (jobs.length === 0) {
      alert("No job data to export!");
      return;
    }

    const headers = [
      "Job ID",
      "Job Code",
      "Job Name",
      "Client Code",
      "Status",
      "Word Count",
      "Rate (₹)",
      "Estimated Total (₹)",
      "Deadline",
      "Created At",
      "Checklist Total",
      "Checklist Completed",
      "Notes"
    ];

    const escapeCSVValue = (val: any) => {
      if (val === null || val === undefined) return "";
      let str = "";
      if (typeof val.toDate === "function") {
        str = val.toDate().toISOString();
      } else if (val.seconds) {
        str = new Date(val.seconds * 1000).toISOString();
      } else {
        str = String(val);
      }
      const cleaned = str.replace(/"/g, '""');
      if (cleaned.includes(",") || cleaned.includes('"') || cleaned.includes("\n") || cleaned.includes("\r")) {
        return `"${cleaned}"`;
      }
      return cleaned;
    };

    const rows = jobs.map((job) => {
      const estimatedTotal = (Number(job.wordCount) || 0) * (Number(job.rate) || 0);
      const totalChecklist = Array.isArray(job.checklist) ? job.checklist.length : 0;
      const completedChecklist = Array.isArray(job.checklist) 
        ? job.checklist.filter((item: any) => item.completed).length 
        : 0;

      return [
        job.id,
        job.jobCode || "",
        job.jobName || "",
        job.clientCode || "",
        job.status || "",
        job.wordCount || 0,
        job.rate || 0,
        estimatedTotal,
        job.deadline || "",
        job.createdAt || "",
        totalChecklist,
        completedChecklist,
        job.notes || ""
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCSVValue).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `jobs_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F8F9FC] dark:bg-slate-950 text-gray-900 dark:text-slate-100 font-sans flex flex-col md:flex-row transition-colors duration-200">
        {/* Left Vertical Sidebar (Desktop only) */}
        {user && (
          <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800/80 z-30 transition-all">
            <div className="flex flex-col flex-1 min-h-0">
              {/* Logo area */}
              <div className="flex items-center gap-2.5 px-6 h-16 border-b border-gray-200 dark:border-slate-800/80 shrink-0">
                <div className="bg-indigo-600 p-2 rounded-xl">
                  <Layout className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                  WorkFlow
                </h1>
              </div>

              {/* Nav content */}
              <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
                <button
                  onClick={() => setCurrentTab("tracker")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentTab === "tracker"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <Layout className="w-4 h-4" />
                  <span>Pipeline</span>
                </button>
                <button
                  onClick={() => setCurrentTab("billing")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentTab === "billing"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <ReceiptText className="w-4 h-4" />
                  <span>Billing</span>
                </button>
                <button
                  onClick={() => setCurrentTab("clients")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentTab === "clients"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Clients</span>
                </button>
                <button
                  onClick={() => setCurrentTab("performance")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentTab === "performance"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>Writers</span>
                </button>
                <button
                  onClick={() => setCurrentTab("drive")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    currentTab === "drive"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <HardDrive className="w-4 h-4" />
                  <span>Google Drive</span>
                </button>
              </nav>

              {/* Footer / Profile seat in sidebar */}
              <div className="p-4 border-t border-gray-200 dark:border-slate-800/80 flex flex-col gap-3.5 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">Appearance</span>
                  <button
                    onClick={toggleDarkMode}
                    className="p-1.5 text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800/60 rounded-xl transition-all border border-gray-200/50 dark:border-slate-800"
                  >
                    {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-800/60 pt-3.5">
                  <div className="flex items-center gap-2 max-w-[140px] truncate">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || "User"} className="w-8 h-8 rounded-full border border-gray-100 dark:border-slate-705" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Users className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="flex flex-col truncate leading-tight">
                      <span className="text-xs font-bold text-gray-755 dark:text-slate-200 truncate">{user.displayName?.split(" ")[0]}</span>
                      <span className="text-[9px] text-gray-450 dark:text-slate-500 truncate">{user.email}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="p-1.5 text-gray-455 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all"
                    title="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Content Area Wrapper */}
        <div className={`flex-1 flex flex-col min-w-0 ${user ? "md:pl-64" : ""}`}>
          
          {/* Mobile Header, shown only when user logged in */}
          {user && (
            <header className="md:hidden sticky top-0 z-45 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-600 p-1.5 rounded-lg">
                  <Layout className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                  WorkFlow
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleDarkMode}
                  className="p-2 text-gray-500 dark:text-gray-405 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
                </button>
                <NotificationsBell jobs={jobs} />
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 text-gray-550 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </header>
          )}

          {/* Mobile Menu Dropdown */}
          <AnimatePresence>
            {user && isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden sticky top-14 z-30 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800/80 px-4 py-4 flex flex-col gap-2 shadow-xl overflow-hidden"
              >
                <button
                  onClick={() => {
                    setCurrentTab("tracker");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-left ${
                    currentTab === "tracker"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-400"
                  }`}
                >
                  <Layout className="w-4 h-4" />
                  <span>Pipeline</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentTab("billing");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-left ${
                    currentTab === "billing"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-405"
                  }`}
                >
                  <ReceiptText className="w-4 h-4" />
                  <span>Billing</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentTab("clients");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-left ${
                    currentTab === "clients"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-405"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Clients</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentTab("performance");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-left ${
                    currentTab === "performance"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-455"
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>Writers</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentTab("drive");
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-left ${
                    currentTab === "drive"
                      ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-slate-455"
                  }`}
                >
                  <HardDrive className="w-4 h-4" />
                  <span>Google Drive</span>
                </button>
                <div className="border-t border-gray-150 dark:border-slate-800 pt-3 flex items-center justify-center">
                  <Auth />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main workspace container */}
          <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
            {!user ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-md bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition"
                >
                  <div className="bg-indigo-50 dark:bg-indigo-950/30 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <BarChart3 className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">Track your freelance work effortlessly</h2>
                  <p className="text-gray-650 dark:text-slate-400 mb-8 leading-relaxed text-sm">
                    Manage your clients, word counts, and deadlines in one place. Sign in to start your productivity journey.
                  </p>
                  <div className="flex justify-center">
                    <Auth />
                  </div>
                </motion.div>
              </div>
            ) : (
            currentTab === "tracker" ? (
              <div className="space-y-8 animate-fade-in">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                      <CalendarIcon className="w-4 h-4" />
                      <span>{format(new Date(), "EEEE, MMMM do, yyyy")}</span>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900">Welcome back, {user.displayName?.split(" ")[0]}!</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input
                        type="text"
                        placeholder="Search jobs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all w-full md:w-64 shadow-sm"
                      />
                    </div>
                    <button
                      id="btn-export-jobs-csv"
                      onClick={exportToCSV}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm cursor-pointer"
                      title="Export all jobs to CSV"
                    >
                      <Download className="w-4 h-4 text-gray-500" />
                      <span className="hidden sm:inline">Export Backup</span>
                    </button>
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                      <span>New Job</span>
                    </button>
                  </div>
                </div>

                {/* Dashboard Stats */}
                <Dashboard jobs={filteredJobs} selectedClient={selectedClient} user={user} />

                {/* Kanban Board */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[700px]">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Layout className="w-5 h-5 text-indigo-600" />
                      Work Pipeline
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                          value={selectedClient}
                          onChange={(e) => setSelectedClient(e.target.value)}
                          className="text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                        >
                          <option value="All Clients">All Clients</option>
                          {clientCodes.map((code) => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                        {selectedClient !== "All Clients" && (
                          <button 
                            onClick={() => setSelectedClient("All Clients")}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
                        <span>{filteredJobs.length} Jobs</span>
                      </div>
                    </div>
                  </div>
                  {jobsLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  ) : filteredJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                      <div className="bg-gray-100 p-4 rounded-full mb-4">
                        <Search className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-base font-semibold text-gray-700">No matching jobs found</p>
                      <p className="text-sm text-gray-400 mt-1">Try adjusting your keywords, search terms, or status query.</p>
                      {(searchQuery || selectedClient !== "All Clients") && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setSelectedClient("All Clients");
                          }}
                          className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <KanbanBoard 
                      jobs={filteredJobs} 
                      onDeleteJob={handleDeleteJob} 
                      onClientClick={(code) => setSelectedClient(code)}
                      onJobClick={(job) => setSelectedJobDetails(job)}
                    />
                  )}
                </div>
              </div>
            ) : currentTab === "billing" ? (
              <BillingSection 
                jobs={jobs} 
                user={user} 
                prefilledJobId={prefilledJobId || undefined}
                onPrefilledJobIdCleared={() => setPrefilledJobId(null)}
                highlightedInvoiceId={highlightedInvoiceId || undefined}
                onHighlightedInvoiceIdCleared={() => setHighlightedInvoiceId(null)}
              />
            ) : currentTab === "clients" ? (
              <ClientsSection user={user} jobs={jobs} />
            ) : currentTab === "performance" ? (
              <WriterPerformanceSection user={user} jobs={jobs} />
            ) : (
              <GoogleDriveHub />
            )
          )}
        </main>

        {/* Modals */}
        <AnimatePresence>
          {showAddForm && (
            <AddJobForm onClose={() => setShowAddForm(false)} existingJobs={jobs} />
          )}
          {selectedJobDetails !== null && (
            <JobDetailsModal 
              job={jobs.find((j) => j.id === selectedJobDetails.id) || selectedJobDetails} 
              onClose={() => setSelectedJobDetails(null)} 
              onGenerateInvoice={(jobId) => {
                setPrefilledJobId(jobId);
                setCurrentTab("billing");
                setSelectedJobDetails(null);
              }}
              onViewInvoice={(invoiceId) => {
                setHighlightedInvoiceId(invoiceId);
                setCurrentTab("billing");
                setSelectedJobDetails(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* Job Delete Confirmation Modal */}
        <AnimatePresence>
          {jobToDelete !== null && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-600" />
                    Confirm Job Deletion
                  </h3>
                  <button
                    onClick={() => setJobToDelete(null)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    disabled={isDeletingJob}
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Are you sure you want to permanently delete this job?
                  </p>
                  
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client</span>
                      <span className="text-xs font-bold text-indigo-600 font-mono">{jobToDelete.clientCode}</span>
                    </div>
                    {jobToDelete.jobCode && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Job Code</span>
                        <span className="text-xs font-bold text-gray-700 font-mono">{jobToDelete.jobCode}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name</span>
                      <span className="text-xs font-semibold text-gray-800 text-right max-w-[200px] truncate">{jobToDelete.jobName || "Untitled Job"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        jobToDelete.status === "Completed" ? "bg-green-50 text-green-600" :
                        jobToDelete.status === "Review" ? "bg-orange-50 text-orange-600" :
                        jobToDelete.status === "In Progress" ? "bg-blue-50 text-blue-600" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {jobToDelete.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estimated Fee</span>
                      <span className="text-xs font-black text-gray-900">₹{(jobToDelete.wordCount * jobToDelete.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <p className="text-xs text-red-500 leading-normal font-medium bg-red-50 p-3 rounded-xl border border-red-100 flex items-start gap-2">
                    <span>⚠️</span>
                    <span>This action is highly destructive and completely irreversible. All checklist items associated with this job will also be wiped permanently.</span>
                  </p>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={isDeletingJob}
                    onClick={() => setJobToDelete(null)}
                    className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingJob}
                    onClick={executeDeleteJob}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-red-100 flex items-center gap-2"
                  >
                    {isDeletingJob ? "Deleting..." : "Permanently Delete"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <p className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} WorkFlow Tracker. Built for productivity.
          </p>
        </footer>
      </div>
     </div>
    </ErrorBoundary>
  );
}
