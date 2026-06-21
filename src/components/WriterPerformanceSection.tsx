import React, { useState, useMemo } from "react";
import { db, OperationType, handleFirestoreError } from "../firebase";
import { collection, query, where, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { 
  Plus, Search, User, Mail, Trash2, Edit3, X, Award, TrendingUp, Clock, RefreshCw, 
  ThumbsUp, Calendar, CheckCircle2, ChevronRight, UserCheck, Percent, HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Cell, PieChart, Pie
} from "recharts";
import { format, parseISO, differenceInHours } from "date-fns";

interface TeamMember {
  id: string;
  name: string;
  role: "Writer" | "Editor" | "Quality Checker";
  email: string;
  phone?: string;
  userId: string;
  createdAt: any;
}

interface Job {
  id: string;
  clientCode: string;
  jobName?: string;
  jobCode?: string;
  wordCount: number;
  rate: number;
  deadline: string;
  startDate?: string;
  status: string;
  userId: string;
  createdAt: any;
  assignedWriterId?: string | null;
  assignedWriterName?: string | null;
  revisionCount?: number;
  completedAt?: string | null;
}

interface WriterPerformanceProps {
  user: any;
  jobs: Job[];
}

export default function WriterPerformanceSection({ user, jobs }: WriterPerformanceProps) {
  // Query team members
  const teamQuery = user
    ? query(collection(db, "team_members"), where("userId", "==", user.uid), orderBy("createdAt", "desc"))
    : null;

  const [teamSnapshot, teamLoading] = useCollection(teamQuery);

  const teamMembers = useMemo(() => {
    return (teamSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TeamMember[]) || [];
  }, [teamSnapshot]);

  // Filter only writers
  const writers = useMemo(() => {
    return teamMembers.filter((m) => m.role === "Writer");
  }, [teamMembers]);

  // Form states for creating/editing team members
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWriter, setEditingWriter] = useState<TeamMember | null>(null);
  const [writerToDelete, setWriterToDelete] = useState<TeamMember | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [writerName, setWriterName] = useState("");
  const [writerEmail, setWriterEmail] = useState("");
  const [writerPhone, setWriterPhone] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sub-tab: dashboard vs directory
  const [activeTab, setActiveTab] = useState<"dashboard" | "directory">("dashboard");

  // Detailed calculations for performance metrics per writer
  const writerStats = useMemo(() => {
    const stats = new Map<string, {
      id: string;
      name: string;
      email: string;
      jobsAssigned: number;
      jobsCompleted: number;
      jobsOnTime: number;
      jobsLate: number;
      totalWordsCompleted: number;
      totalRevisionCount: number;
      totalCompletionTimeHours: number;
      completedJobsWithTime: number;
    }>();

    // 1. Initialize registered writers
    writers.forEach((writer) => {
      stats.set(writer.id, {
        id: writer.id,
        name: writer.name,
        email: writer.email,
        jobsAssigned: 0,
        jobsCompleted: 0,
        jobsOnTime: 0,
        jobsLate: 0,
        totalWordsCompleted: 0,
        totalRevisionCount: 0,
        totalCompletionTimeHours: 0,
        completedJobsWithTime: 0,
      });
    });

    // 2. Loop through all jobs and count stats
    jobs.forEach((job) => {
      if (!job.assignedWriterId) return;

      const writerId = job.assignedWriterId;
      
      // Seed unlisted active writer if job references them but not in database
      if (!stats.has(writerId)) {
        stats.set(writerId, {
          id: writerId,
          name: job.assignedWriterName || "Unregistered Writer",
          email: "N/A",
          jobsAssigned: 0,
          jobsCompleted: 0,
          jobsOnTime: 0,
          jobsLate: 0,
          totalWordsCompleted: 0,
          totalRevisionCount: 0,
          totalCompletionTimeHours: 0,
          completedJobsWithTime: 0,
        });
      }

      const current = stats.get(writerId)!;
      current.jobsAssigned += 1;

      if (job.status === "Completed") {
        current.jobsCompleted += 1;
        current.totalWordsCompleted += Number(job.wordCount) || 0;
        current.totalRevisionCount += Number(job.revisionCount) || 0;

        // Calculate On-Time vs Late
        const deadlineDate = new Date(job.deadline);
        const resolvedCompDate = job.completedAt ? new Date(job.completedAt) : null;

        if (resolvedCompDate) {
          const onTime = resolvedCompDate <= deadlineDate;
          if (onTime) {
            current.jobsOnTime += 1;
          } else {
            current.jobsLate += 1;
          }

          // Calculate Completion Speed (In hours) from startDate or createdAt
          // Let's deduce starting date
          let startingDate: Date | null = null;
          if (job.startDate) {
            try { startingDate = new Date(job.startDate); } catch(ex){}
          } else if (job.createdAt) {
            try {
              startingDate = typeof job.createdAt.toDate === "function" 
                ? job.createdAt.toDate() 
                : new Date(job.createdAt);
            } catch(ex){}
          }

          if (startingDate && resolvedCompDate >= startingDate) {
            const diffHours = differenceInHours(resolvedCompDate, startingDate);
            current.totalCompletionTimeHours += diffHours;
            current.completedJobsWithTime += 1;
          }
        } else {
          // Default fallback on time
          current.jobsOnTime += 1;
        }
      }
    });

    return Array.from(stats.values()).map((s) => {
      const onTimeRate = s.jobsCompleted > 0 ? (s.jobsOnTime / s.jobsCompleted) * 105 : 100;
      // Cap at 100%
      const finalOnTimeRate = Math.min(100, Math.max(0, onTimeRate));
      const avgCompletionTimeHours = s.completedJobsWithTime > 0 
        ? Math.round(s.totalCompletionTimeHours / s.completedJobsWithTime) 
        : 0;

      return {
        ...s,
        onTimeRate: parseFloat(finalOnTimeRate.toFixed(1)),
        avgCompletionTimeHours,
      };
    });
  }, [writers, jobs]);

  // Rankings sorting (default by On-Time Delivery Rate desc, then completed count)
  const rankedWriters = useMemo(() => {
    return [...writerStats].sort((a, b) => {
      if (b.onTimeRate !== a.onTimeRate) {
        return b.onTimeRate - a.onTimeRate;
      }
      return b.jobsCompleted - a.jobsCompleted;
    });
  }, [writerStats]);

  // Productivity Trends data
  // Monthly output per writer, group by month
  const productivityTrends = useMemo(() => {
    const monthMap = new Map<string, { month: string; jobsCompleted: number; wordsCompleted: number }>();

    jobs.forEach((job) => {
      if (job.status !== "Completed" || !job.assignedWriterId) return;

      let dateObj: Date | null = null;
      if (job.completedAt) {
        try { dateObj = new Date(job.completedAt); } catch(e){}
      } else if (job.createdAt) {
        try {
          dateObj = typeof job.createdAt.toDate === "function" ? job.createdAt.toDate() : new Date(job.createdAt);
        } catch(e){}
      }

      if (!dateObj) return;

      const monthKey = format(dateObj, "MMM yyyy"); // e.g. "Jun 2026"
      
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: monthKey,
          jobsCompleted: 0,
          wordsCompleted: 0
        });
      }

      const current = monthMap.get(monthKey)!;
      current.jobsCompleted += 1;
      current.wordsCompleted += Number(job.wordCount) || 0;
    });

    // Sort by chronological order
    return Array.from(monthMap.values()).sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateA.getTime() - dateB.getTime();
    });
  }, [jobs]);

  // Overall metric summaries
  const totals = useMemo(() => {
    let completedCount = 0;
    let totalOnTime = 0;
    let totalRevisions = 0;
    let totalWords = 0;

    writerStats.forEach((w) => {
      completedCount += w.jobsCompleted;
      totalOnTime += w.jobsOnTime;
      totalRevisions += w.totalRevisionCount;
      totalWords += w.totalWordsCompleted;
    });

    const overallOnTimeRate = completedCount > 0 ? Math.min(100, Math.round((totalOnTime / completedCount) * 100)) : 100;

    // Find fastest writer
    const completedWithTime = writerStats.filter(w => w.avgCompletionTimeHours > 0);
    const fastestWriter = completedWithTime.length > 0 
      ? [...completedWithTime].sort((a, b) => a.avgCompletionTimeHours - b.avgCompletionTimeHours)[0] 
      : null;

    return {
      completedCount,
      overallOnTimeRate,
      totalRevisions,
      totalWords,
      fastestWriterName: fastestWriter ? fastestWriter.name : "N/A",
      fastestWriterTime: fastestWriter ? `${fastestWriter.avgCompletionTimeHours} hrs` : "N/A"
    };
  }, [writerStats]);

  // Filter writer list for directory search
  const filteredWriters = useMemo(() => {
    return writerStats.filter((writer) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        writer.name.toLowerCase().includes(q) ||
        writer.email.toLowerCase().includes(q)
      );
    });
  }, [writerStats, searchQuery]);

  // CRUD handlers
  const handleAddNewWriter = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const nameTrimmed = writerName.trim();
    const emailTrimmed = writerEmail.trim().toLowerCase();
    const phoneTrimmed = writerPhone.trim().replace(/[^0-9]/g, "");

    if (!nameTrimmed) {
      setValidationError("Writer description name is required.");
      return;
    }

    if (!emailTrimmed) {
      setValidationError("Writer contact/email address is required.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(emailTrimmed)) {
      setValidationError("Please enter a valid format email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingWriter) {
        // Edit flow
        await updateDoc(doc(db, "team_members", editingWriter.id), {
          name: nameTrimmed,
          email: emailTrimmed,
          phone: phoneTrimmed,
        });
      } else {
        // Add flow
        await addDoc(collection(db, "team_members"), {
          name: nameTrimmed,
          role: "Writer",
          email: emailTrimmed,
          phone: phoneTrimmed,
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      // Reset
      setWriterName("");
      setWriterEmail("");
      setWriterPhone("");
      setEditingWriter(null);
      setShowAddModal(false);
    } catch (err) {
      handleFirestoreError(err, editingWriter ? OperationType.UPDATE : OperationType.CREATE, "team_members");
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDeleteWriter = async () => {
    if (!writerToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "team_members", writerToDelete.id));
      setWriterToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `team_members/${writerToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const triggerEditWriter = (writer: TeamMember) => {
    setEditingWriter(writer);
    setWriterName(writer.name);
    setWriterEmail(writer.email);
    setWriterPhone(writer.phone || "");
    setShowAddModal(true);
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Business Intelligence</span>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white leading-tight">Writer Performance Hub</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Track jobs assigned, completion times, total revisions, and inspect automatic SLA delivery charts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-gray-50 dark:bg-slate-950/40 p-1.5 rounded-2xl border border-gray-100 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("directory")}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "directory"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            Writer Pool ({writers.length})
          </button>
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <>
          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex items-center gap-4">
              <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">Jobs Finished</span>
                <h4 className="text-2xl font-black text-gray-900 dark:text-white mt-1 leading-none">{totals.completedCount}</h4>
                <p className="text-[10px] text-slate-400 mt-1.5">Across all registered writers</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex items-center gap-4">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <Percent className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">On-Time Rate</span>
                <h4 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 leading-none">{totals.overallOnTimeRate}%</h4>
                <p className="text-[10px] text-slate-400 mt-1.5">Target threshold min 90%</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex items-center gap-4">
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-2xl">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">Total Revisions</span>
                <h4 className="text-2xl font-black text-gray-900 dark:text-white mt-1 leading-none">{totals.totalRevisions}</h4>
                <p className="text-[10px] text-slate-400 mt-1.5">Client requested updates</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm relative overflow-hidden flex items-center gap-4">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">Fastest Turnaround</span>
                <h4 className="text-lg font-black text-gray-900 dark:text-white mt-1 leading-tight truncate max-w-[140px]">{totals.fastestWriterName}</h4>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 leading-none">Avg Completion: {totals.fastestWriterTime}</p>
              </div>
            </div>
          </div>

          {/* Charts & Trends Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* SLA delivery bar chart */}
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-6">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-base">SLA & On-Time Performance Comparison</h3>
                <p className="text-xs text-slate-400 mt-1">Comparing jobs completed vs on-time deliveries per active writer</p>
              </div>

              <div className="h-72 w-full">
                {rankedWriters.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                    No active assignments logged to display charts
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rankedWriters} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#1e293b", color: "#fff", borderRadius: "12px", border: "none", fontSize: "11px" }}
                        labelStyle={{ fontWeight: "bold", color: "#6366f1" }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                      <Bar name="Jobs Completed" dataKey="jobsCompleted" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={24} />
                      <Bar name="Delivered On Time" dataKey="jobsOnTime" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Productivity Trend */}
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-6 rounded-3xl shadow-sm space-y-6">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-base">Productivity Trends (Deliveries)</h3>
                <p className="text-xs text-slate-400 mt-1">Month-over-month volume of completed work by team writers</p>
              </div>

              <div className="h-72 w-full">
                {productivityTrends.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                    No historic completed jobs found to build trend lines.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={productivityTrends} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="month" stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#1e293b", color: "#fff", borderRadius: "12px", border: "none", fontSize: "11px" }}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "11px" }} />
                      <Area type="monotone" name="Word Count Produced" dataKey="wordsCompleted" stroke="#8b5cf6" strokeWidth={2} fillOpacity={0} />
                      <Area type="monotone" name="Jobs Handled" dataKey="jobsCompleted" stroke="#6366f1" strokeWidth={3} fill="url(#colorJobs)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Rankings Grid & Metrics Table */}
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-base">Writer Rankings & Statistics</h3>
                <p className="text-xs text-slate-400 mt-0.5">Calculated in real-time from active pipeline contracts and assignments</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                  Ranked by SLA delivery rate
                </span>
              </div>
            </div>

            <div className="overflow-x-auto text-sm">
              {rankedWriters.length === 0 ? (
                <div className="py-20 text-center text-slate-400 italic">
                  No writers found. Create performance metrics by adding writers and allocating jobs to them.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-950/30 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100/80 dark:border-slate-800">
                      <th className="py-4 px-6">Rank</th>
                      <th className="py-4 px-6">Writer Name</th>
                      <th className="py-4 px-6 text-center">Jobs Assigned</th>
                      <th className="py-4 px-6 text-center">Jobs Finished</th>
                      <th className="py-4 px-6 text-center">On-Time Deliveries</th>
                      <th className="py-4 px-6 text-center">Late Deliveries</th>
                      <th className="py-4 px-6 text-center">Avg Delivery Speed</th>
                      <th className="py-4 px-6 text-center">Revision Count</th>
                      <th className="py-4 px-6 text-right">SLA Deliver Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                    {rankedWriters.map((writer, index) => {
                      const medalStyles = 
                        index === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200" :
                        index === 1 ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200" :
                        index === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-450 border border-orange-200" :
                        "bg-slate-50 text-slate-500 dark:bg-slate-900 border border-slate-200/50";

                      return (
                        <tr key={writer.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/30 transition">
                          <td className="py-4 px-6 font-bold font-mono">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${medalStyles}`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-4 px-6 font-semibold text-gray-900 dark:text-slate-100">
                            <div>
                              <p className="font-extrabold">{writer.name}</p>
                              <p className="text-[10px] text-gray-400 font-medium font-mono leading-none mt-1">{writer.email}</p>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center font-bold font-mono text-slate-600 dark:text-slate-400">{writer.jobsAssigned}</td>
                          <td className="py-4 px-6 text-center font-bold font-mono text-emerald-600 dark:text-emerald-400">{writer.jobsCompleted}</td>
                          <td className="py-4 px-6 text-center font-semibold font-mono text-slate-500">{writer.jobsOnTime}</td>
                          <td className="py-4 px-6 text-center font-semibold font-mono text-rose-500">{writer.jobsLate}</td>
                          <td className="py-4 px-6 text-center font-bold font-mono text-slate-600 dark:text-slate-400 text-xs">
                            {writer.avgCompletionTimeHours > 0 ? (
                              <span className="flex items-center justify-center gap-1">
                                <Clock className="w-3" />
                                {writer.avgCompletionTimeHours} hrs
                              </span>
                            ) : "N/A"}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className={`px-2 py-0.5 rounded-md font-bold font-mono text-xs ${
                              writer.totalRevisionCount > 4 ? "bg-rose-50 text-rose-600" :
                              writer.totalRevisionCount > 1 ? "bg-orange-50 text-orange-600" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {writer.totalRevisionCount}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="inline-flex flex-col items-end">
                              <span className={`text-sm font-black font-mono ${
                                writer.onTimeRate >= 95 ? "text-emerald-500" :
                                writer.onTimeRate >= 80 ? "text-amber-500" :
                                "text-rose-500"
                              }`}>
                                {writer.onTimeRate}%
                              </span>
                              <div className="w-20 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-200/40">
                                <div 
                                  className={`h-full rounded-full ${
                                    writer.onTimeRate >= 95 ? "bg-emerald-500" :
                                    writer.onTimeRate >= 80 ? "bg-amber-500" :
                                    "bg-rose-500"
                                  }`} 
                                  style={{ width: `${writer.onTimeRate}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Team Pool List Directory View */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search writers by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-gray-50/50 dark:bg-slate-950/30 border border-gray-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all w-full text-xs"
              />
            </div>

            <button
               onClick={() => {
                 setEditingWriter(null);
                 setWriterName("");
                 setWriterEmail("");
                 setShowAddModal(true);
               }}
               className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-indigo-100"
            >
              <Plus className="w-4 h-4" />
              <span>Add Teammate Writer</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWriters.map((writer) => {
              // Extract current jobs assigned and completed stats
              return (
                <motion.div
                  key={writer.id}
                  layout
                  className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-5 rounded-3xl shadow-sm hover:shadow-md transition flex flex-col justify-between gap-5 relative overflow-hidden"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                          {writer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-gray-950 dark:text-white">{writer.name}</h4>
                          <span className="text-[10px] text-gray-400 font-mono block mt-0.5">{writer.email}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => triggerEditWriter(writer as any)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                          title="Edit Writer Details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setWriterToDelete(writer as any)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 transition"
                          title="Delete Teammate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Compact Specs Grid */}
                    <div className="grid grid-cols-2 gap-3.5 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-gray-100/50 dark:border-slate-800/50 text-[10px]">
                      <div>
                        <span className="text-gray-400 uppercase tracking-wider font-extrabold block">Assigned Contracts</span>
                        <span className="text-sm font-extrabold font-mono text-gray-800 dark:text-slate-200 mt-0.5 block">{writer.jobsAssigned} jobs</span>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wider font-extrabold block">Finished Output</span>
                        <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block">{writer.jobsCompleted} jobs</span>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wider font-extrabold block">Total Words Produced</span>
                        <span className="text-sm font-extrabold font-mono text-gray-800 dark:text-slate-200 mt-0.5 block">{writer.totalWordsCompleted.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wider font-extrabold block">Revision Cycle Total</span>
                        <span className="text-sm font-extrabold font-mono text-gray-800 dark:text-slate-200 mt-0.5 block">{writer.totalRevisionCount} times</span>
                      </div>
                    </div>
                  </div>

                  {/* Foot bar info */}
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 flex items-center gap-1 font-semibold">
                      <Clock className="w-3.5 text-gray-400" />
                      Speed: {writer.avgCompletionTimeHours > 0 ? `${writer.avgCompletionTimeHours} hrs` : "N/A"}
                    </span>

                    <span className={`font-mono font-black ${
                      writer.onTimeRate >= 95 ? "text-emerald-600 dark:text-emerald-400" :
                      writer.onTimeRate >= 80 ? "text-amber-500" :
                      "text-rose-500"
                    }`}>
                      SLA SLA: {writer.onTimeRate}% on-time
                    </span>
                  </div>
                </motion.div>
              );
            })}

            {filteredWriters.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                No matched writers in directory!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Writer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-md border border-gray-100 dark:border-slate-800 overflow-hidden font-sans"
            >
              <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-gray-950 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  {editingWriter ? "Update Teammate Details" : "Register New Teammate Writer"}
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition cursor-pointer"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleAddNewWriter} className="p-6 space-y-4">
                {validationError && (
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold border border-rose-100 flex items-start gap-2 animate-pulse">
                    <span>⚠️</span>
                    <span>{validationError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anand Kumar"
                    value={writerName}
                    onChange={(e) => setWriterName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-55/40 dark:bg-slate-950/50 border border-gray-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. anand@workflow.co"
                    value={writerEmail}
                    onChange={(e) => setWriterEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-55/40 dark:bg-slate-950/50 border border-gray-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Phone Number / WhatsApp</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono text-sm">+</span>
                    <input
                      type="tel"
                      placeholder="e.g. 919876543210 (include country code)"
                      value={writerPhone}
                      onChange={(e) => setWriterPhone(e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full pl-7 pr-4 py-2.5 bg-gray-55/40 dark:bg-slate-950/50 border border-gray-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition text-sm font-mono"
                    />
                  </div>
                  <p className="text-[9px] text-gray-400">Enter digits only with country code (e.g. 91703020101 or 12125550201).</p>
                </div>

                <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-755 dark:text-indigo-400 rounded-2xl border border-indigo-150/40 text-[10px] leading-relaxed flex items-start gap-2.5">
                  <span>ℹ️</span>
                  <span>Once registered, this teammate can be assigned to contracts as a "Writer" in the pipeline cards dropdown selector. All performance statistics are pooled immediately.</span>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-3.5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-850 dark:hover:text-slate-300 bg-transparent transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-indigo-100 flex items-center gap-1.5"
                  >
                    {isSubmitting ? "Saving..." : editingWriter ? "Update Details" : "Register Writer"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Writer Confirmation Dialog */}
      <AnimatePresence>
        {writerToDelete !== null && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-sm border border-gray-100 dark:border-slate-800 overflow-hidden font-sans"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-450 flex items-center justify-center mx-auto mb-2">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-gray-950 dark:text-white">Delete Teammate Writer?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-white">{writerToDelete.name}</span>? They will be removed from the options list, though older jobs history will list them.
                </p>
              </div>

              <div className="px-6 py-4 bg-gray-50 dark:bg-slate-950/30 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setWriterToDelete(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={executeDeleteWriter}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-rose-100"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
