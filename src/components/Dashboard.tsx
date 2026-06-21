import React, { useMemo } from "react";
import { format, subMonths } from "date-fns";
import { 
  Briefcase, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  CalendarRange,
  Users,
  TrendingUp,
  BarChart4,
  Layers,
  ArrowUpRight,
  PieChart as PieIcon
} from "lucide-react";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { db } from "../firebase";
import { User } from "firebase/auth";
import { getInvoicePricing } from "./BillingSection";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface Job {
  id: string;
  clientCode: string;
  wordCount: number;
  rate: number;
  deadline: string;
  startDate?: string;
  internalDeadline?: string;
  clientDeadline?: string;
  notes?: string;
  status: string;
  userId: string;
  createdAt: any;
  jobName?: string;
  jobCode?: string;
}

interface DashboardProps {
  jobs: Job[];
  selectedClient: string;
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ jobs, selectedClient, user }) => {
  // Real-time dynamic fetch of invoices collection
  const invoicesQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "invoices"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
  }, [user?.uid]);

  const [invoicesSnapshot, invoicesLoading] = useCollection(invoicesQuery);

  const invoices = useMemo(() => {
    return invoicesSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as any[] || [];
  }, [invoicesSnapshot]);

  // Apply client filtering to jobs and invoices
  const clientJobs = useMemo(() => {
    return jobs.filter((job) => {
      return !selectedClient || selectedClient === "All Clients" || job.clientCode === selectedClient;
    });
  }, [jobs, selectedClient]);

  const clientInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      return !selectedClient || selectedClient === "All Clients" || inv.client === selectedClient;
    });
  }, [invoices, selectedClient]);

  // Calculations for KPIs
  const totalJobsCount = clientJobs.length;
  
  const activeJobsCount = useMemo(() => {
    return clientJobs.filter((job) => job.status !== "Completed").length;
  }, [clientJobs]);

  const completedJobsCount = useMemo(() => {
    return clientJobs.filter((job) => job.status === "Completed").length;
  }, [clientJobs]);

  const pendingPaymentsAmount = useMemo(() => {
    return clientInvoices.reduce((sum, inv) => {
      if (inv.status === "Pending" || inv.status === "Overdue") {
        return sum + getInvoicePricing(inv as any).grandTotal;
      }
      return sum;
    }, 0);
  }, [clientInvoices]);

  const totalRevenueAmount = useMemo(() => {
    return clientInvoices.reduce((sum, inv) => {
      if (inv.status === "Paid") {
        return sum + getInvoicePricing(inv as any).grandTotal;
      }
      return sum;
    }, 0);
  }, [clientInvoices]);

  const monthlyRevenueAmount = useMemo(() => {
    const currentMonthPrefix = format(new Date(), "yyyy-MM");
    return clientInvoices.reduce((sum, inv) => {
      if (inv.status === "Paid" && inv.billingDate?.startsWith(currentMonthPrefix)) {
        return sum + getInvoicePricing(inv as any).grandTotal;
      }
      return sum;
    }, 0);
  }, [clientInvoices]);

  // Aggregate stats over a sliding window of the last 6 months
  const last6MonthsData = useMemo(() => {
    const monthsRange = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      monthsRange.push({
        dateStr: format(date, "yyyy-MM"),
        label: format(date, "MMM yyyy"),
        revenue: 0,
        jobsCreated: 0,
      });
    }

    // Accumulate Revenues
    clientInvoices.forEach((inv) => {
      if (inv.status === "Paid" && inv.billingDate) {
        const monthPrefix = inv.billingDate.substring(0, 7); // YYYY-MM
        const correspondingMonth = monthsRange.find((m) => m.dateStr === monthPrefix);
        if (correspondingMonth) {
          correspondingMonth.revenue += getInvoicePricing(inv as any).grandTotal;
        }
      }
    });

    // Accumulate Job Count
    clientJobs.forEach((job) => {
      if (job.createdAt) {
        let jobDate = new Date();
        if (typeof job.createdAt.toDate === "function") {
          jobDate = job.createdAt.toDate();
        } else if (job.createdAt.seconds) {
          jobDate = new Date(job.createdAt.seconds * 1000);
        } else {
          jobDate = new Date(job.createdAt);
        }
        const monthPrefix = format(jobDate, "yyyy-MM");
        const correspondingMonth = monthsRange.find((m) => m.dateStr === monthPrefix);
        if (correspondingMonth) {
          correspondingMonth.jobsCreated += 1;
        }
      }
    });

    return monthsRange;
  }, [clientInvoices, clientJobs]);

  // Pie Chart format for Payment Statuses
  const paymentBreakdownData = useMemo(() => {
    const countData = clientInvoices.reduce(
      (acc, inv) => {
        if (inv.status === "Cancelled") {
          return acc;
        }
        if (inv.status === "Paid") {
          acc.Paid += 1;
        } else if (inv.status === "Overdue") {
          acc.Overdue += 1;
        } else {
          acc.Pending += 1;
        }
        return acc;
      },
      { Paid: 0, Pending: 0, Overdue: 0 }
    );

    return [
      { name: "Paid Invoices", value: countData.Paid, color: "#10B981" },
      { name: "Pending Settlement", value: countData.Pending, color: "#F59E0B" },
      { name: "Overdue Alerts", value: countData.Overdue, color: "#EF4444" },
    ].filter((item) => item.value > 0);
  }, [clientInvoices]);

  const activePercent = totalJobsCount > 0 ? Math.round((activeJobsCount / totalJobsCount) * 100) : 0;

  const getDLStatus = (deadlineStr?: string, status?: string) => {
    if (!deadlineStr) return null;
    if (status === "Completed") {
      return {
        label: "Completed",
        color: "green",
        bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100",
        dot: "bg-emerald-500"
      };
    }
    const dlDate = new Date(deadlineStr);
    const now = new Date();
    const diffHours = (dlDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 0) {
      return {
        label: "Overdue",
        color: "red",
        bg: "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-450 border border-rose-100",
        dot: "bg-red-500"
      };
    } else if (diffHours <= 48) {
      return {
        label: "Due < 48h",
        color: "yellow",
        bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-450 border border-amber-100",
        dot: "bg-amber-500"
      };
    } else {
      return {
        label: "On Track",
        color: "green",
        bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-405 border border-emerald-100",
        dot: "bg-emerald-500"
      };
    }
  };

  const deadlinedActiveJobs = useMemo(() => {
    return clientJobs
      .filter((j) => j.status !== "Completed")
      .map((job) => {
        const clientDL = job.clientDeadline || job.deadline;
        const internalDL = job.internalDeadline || null;
        
        const clientStatus = getDLStatus(clientDL, job.status);
        const internalStatus = internalDL ? getDLStatus(internalDL, job.status) : null;

        return {
          ...job,
          clientDate: clientDL,
          clientStatus,
          internalDate: internalDL,
          internalStatus,
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.clientDate).getTime();
        const dateB = new Date(b.clientDate).getTime();
        return dateA - dateB;
      });
  }, [clientJobs]);

  const activeDlSummary = useMemo(() => {
    let overdueCount = 0;
    let warningCount = 0;
    let onTrackCount = 0;

    deadlinedActiveJobs.forEach((job) => {
      if (job.clientStatus?.color === "red" || job.internalStatus?.color === "red") {
        overdueCount++;
      } else if (job.clientStatus?.color === "yellow" || job.internalStatus?.color === "yellow") {
        warningCount++;
      } else {
        onTrackCount++;
      }
    });

    return { overdueCount, warningCount, onTrackCount };
  }, [deadlinedActiveJobs]);

  if (invoicesLoading) {
    return (
      <div className="space-y-6 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 animate-pulse space-y-3">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
              <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/2"></div>
              <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[350px] bg-white dark:bg-slate-900 rounded-2xl border border-gray-155 dark:border-slate-805 animate-pulse"></div>
          <div className="h-[350px] bg-white dark:bg-slate-900 rounded-2xl border border-gray-155 dark:border-slate-805 animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-8">
      {/* Scope visual filter indicator */}
      {selectedClient && selectedClient !== "All Clients" && (
        <div className="flex items-center gap-2.5 px-4.5 py-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-900/40 w-fit text-sm font-bold shadow-sm transition-all animate-fade-in">
          <Users className="w-4 h-4 text-indigo-500" />
          <span>Showing Focused Workspace Data for:</span>
          <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-md font-extrabold uppercase tracking-wide">
            {selectedClient}
          </span>
        </div>
      )}

      {/* KPI 6-Grid Section */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* TOTAL JOBS */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-md font-bold">Total</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Total Jobs</p>
            <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{totalJobsCount}</h3>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block truncate">All registered bids</p>
          </div>
        </div>

        {/* ACTIVE JOBS */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-450 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-450 px-1.5 py-0.5 rounded-md font-bold">{activePercent}%</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Active Jobs</p>
            <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{activeJobsCount}</h3>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block truncate">In execution pipeline</p>
          </div>
        </div>

        {/* COMPLETED JOBS */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-405 px-1.5 py-0.5 rounded-md font-bold font-mono">Success</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Completed Jobs</p>
            <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">{completedJobsCount}</h3>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block truncate">Delivered properly</p>
          </div>
        </div>

        {/* PENDING PAYMENTS */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-md font-bold">Awaiting</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Pending Pay</p>
            <h3 className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              ₹{pendingPaymentsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h3>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block truncate">Requires collection</p>
          </div>
        </div>

        {/* TOTAL REVENUE */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-bold">Income</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Total Revenue</p>
            <h3 className="text-xl font-black text-indigo-750 dark:text-indigo-400 mt-1 font-mono">
              ₹{totalRevenueAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h3>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block truncate">Gross cleared funds</p>
          </div>
        </div>

        {/* MONTHLY REVENUE */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 rounded-xl">
              <CalendarRange className="w-5 h-5" />
            </div>
            <span className="text-[10px] bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 px-1.5 py-0.5 rounded-md font-bold">Growth</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Monthly Revenue</p>
            <h3 className="text-xl font-black text-pink-700 dark:text-pink-405 mt-1 font-mono">
              ₹{monthlyRevenueAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </h3>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block truncate">{format(new Date(), "MMMM")} actuals</p>
          </div>
        </div>
      </div>

      {/* ACTIVE DEADLINES TRACKER WIDGET */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-4 border-b border-gray-100 dark:border-slate-800">
          <div>
            <h4 className="text-base font-black text-slate-805 dark:text-white flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-indigo-650 dark:text-indigo-400" />
              Dynamic Deadline Tracking & Task Alerts
            </h4>
            <p className="text-xs text-gray-400 mt-1">Automatic real-time tracking of Active Pipeline contracts and client SLA commitments.</p>
          </div>
          
          <div className="flex gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 rounded-lg border border-rose-100 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              {activeDlSummary.overdueCount} Overdue
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-500 rounded-lg border border-amber-100 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {activeDlSummary.warningCount} Due &lt; 48h
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-lg border border-emerald-100 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {activeDlSummary.onTrackCount} On Track
            </span>
          </div>
        </div>

        {deadlinedActiveJobs.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 font-medium">
            No active jobs found with upcoming deadlines. All caught up!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5">Active Job / Code</th>
                  <th className="py-2.5">Client</th>
                  <th className="py-2.5">Start Date</th>
                  <th className="py-2.5">Internal Deadline</th>
                  <th className="py-2.5 text-right md:text-left">Client Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-850">
                {deadlinedActiveJobs.slice(0, 5).map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-all">
                    <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-gray-800 dark:text-white leading-tight">
                          {job.jobName || "Untitled Job"}
                        </span>
                        <div className="flex gap-1.5 items-center mt-0.5">
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 px-1.5 py-0.2 rounded font-mono font-bold uppercase">
                            {job.jobCode || "N/A"}
                          </span>
                          <span className="text-[10px] text-gray-400 italic">
                            ({job.status})
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 font-medium">
                      <span className="text-xs bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded font-extrabold tracking-wide uppercase">
                        {job.clientCode}
                      </span>
                    </td>
                    <td className="py-3 font-medium text-gray-500 font-mono">
                      {job.startDate ? format(new Date(job.startDate), "MMM d, yyyy h:mm a") : "—"}
                    </td>
                    <td className="py-3">
                      {job.internalDate ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-gray-700 dark:text-slate-200">
                            {format(new Date(job.internalDate), "MMM d, h:mm a")}
                          </span>
                          {job.internalStatus && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${job.internalStatus.bg}`}>
                              {job.internalStatus.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right md:text-left">
                      <div className="flex items-center justify-end md:justify-start gap-1.5">
                        <span className="font-mono font-black text-gray-750 dark:text-white">
                          {format(new Date(job.clientDate), "MMM d, h:mm a")}
                        </span>
                        {job.clientStatus && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${job.clientStatus.bg}`}>
                            {job.clientStatus.label}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deadlinedActiveJobs.length > 5 && (
              <div className="text-right pt-2.5 mt-2.5 border-t border-gray-100">
                <span className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400">
                  And {deadlinedActiveJobs.length - 5} more active deadlines tracking on the Kanban board...
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CHARTS CONTAINER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: 2 TREND CHARTS (AREA & BAR) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Monthly Revenue Trend */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Monthly Revenue Trend (INR)
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">Cleared historical billings across 6 rolling billing months</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-bold">TOTAL OUTRIGHT EARNED</span>
                <span className="text-sm font-black text-indigo-600">
                  ₹{totalRevenueAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={last6MonthsData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-950 text-white p-3.5 rounded-xl border border-slate-800 text-xs font-bold shadow-xl space-y-1">
                            <p className="text-slate-400">{label}</p>
                            <p className="text-indigo-400">
                              Cleared Revenue: ₹{Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#4F46E5" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#revenueGrad)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Jobs Created per Month (BarChart) */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <BarChart4 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  Jobs Created Per Month
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">Pipeline job additions tracked by system month-of-creation</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-bold">TOTAL ASSIGNED CONTRACTS</span>
                <span className="text-sm font-black text-violet-600">{totalJobsCount} Jobs</span>
              </div>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={last6MonthsData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: "#94A3B8", fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-950 text-white p-3.5 rounded-xl border border-slate-800 text-xs font-bold shadow-xl space-y-1">
                            <p className="text-slate-400">{label}</p>
                            <p className="text-violet-400">
                              Jobs Created: {payload[0].value}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="jobsCreated" radius={[6, 6, 0, 0]}>
                    {last6MonthsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#7C3AED" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CIRCULAR PAYMENT BREAKDOWN */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-sm hover:shadow-md transition-all h-full flex flex-col justify-between">
            <div>
              <h4 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-650" />
                Payment Status Breakdown
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">Ratio of billing documents categorized by process clearing stages.</p>
            </div>

            <div className="py-6 flex items-center justify-center min-h-[190px]">
              {paymentBreakdownData.length === 0 ? (
                <div className="text-center space-y-2 py-8">
                  <div className="bg-slate-50 p-3.5 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-slate-300">
                    <PieIcon className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-gray-400">No invoices generated yet</p>
                  <p className="text-[10px] text-gray-300">Add client invoices to pop billing graphics status breakdown</p>
                </div>
              ) : (
                <div className="w-full h-44 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentBreakdownData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {paymentBreakdownData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-slate-950 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xl">
                                <span className="text-slate-400 mr-2">{payload[0].name}:</span>
                                <span>{payload[0].value} Invoices</span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Dynamic center absolute totals representation */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                    <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Invoices</span>
                    <span className="text-xl font-black text-slate-800 dark:text-white">
                      {clientInvoices.length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Custom Interactive Color Legend Table info representation */}
            <div className="space-y-3 mt-4 border-t border-gray-100 dark:border-slate-800 pt-4">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Legend Cleared Status</span>
              
              <div className="grid grid-cols-1 gap-2.5">
                {/* PAID KEY */}
                <div className="flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-950/40 p-2 rounded-xl border border-transparent dark:border-slate-850">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#10B981] inline-block"></span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">Paid Invoices</span>
                  </div>
                  <span className="font-black text-slate-700 dark:text-slate-200">
                    {clientInvoices.filter(i => i.status === "Paid").length}
                  </span>
                </div>

                {/* PENDING KEY */}
                <div className="flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-950/40 p-2 rounded-xl border border-transparent dark:border-slate-850">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#F59E0B] inline-block"></span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">Pending Settlement</span>
                  </div>
                  <span className="font-black text-slate-700 dark:text-slate-200">
                    {clientInvoices.filter(i => i.status === "Pending").length}
                  </span>
                </div>

                {/* OVERDUE KEY */}
                <div className="flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-950/40 p-2 rounded-xl border border-transparent dark:border-slate-850">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#EF4444] inline-block"></span>
                    <span className="font-bold text-slate-600 dark:text-slate-400">Overdue Alerts</span>
                  </div>
                  <span className="font-black text-slate-700 dark:text-slate-200">
                    {clientInvoices.filter(i => i.status === "Overdue").length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
