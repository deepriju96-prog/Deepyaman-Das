import React, { useState, useMemo } from "react";
import { db, OperationType, handleFirestoreError } from "../firebase";
import { collection, query, where, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { 
  Plus, Search, User, Mail, Phone, Globe, FileText, 
  Trash2, Edit3, X, Eye, Briefcase, ExternalLink, RefreshCw, BarChart2, TrendingUp, DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

interface Client {
  id: string;
  clientName: string;
  clientCode: string;
  email: string;
  phone: string;
  country: string;
  notes?: string;
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
  status: string;
  revenue?: number;
  writerCost?: number;
  editorCost?: number;
  qcCost?: number;
  otherExpenses?: number;
}

interface ClientsSectionProps {
  user: any;
  jobs: Job[];
}

export default function ClientsSection({ user, jobs }: ClientsSectionProps) {
  // Fetch clients for current user
  const clientsQuery = user
    ? query(collection(db, "clients"), where("userId", "==", user.uid), orderBy("createdAt", "desc"))
    : null;

  const [clientsSnapshot, clientsLoading, clientsError] = useCollection(clientsQuery);

  const clients = (clientsSnapshot?.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Client[]) || [];

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Form Fields State
  const [clientName, setClientName] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deletion State
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Profitability sub-tab switch
  const [activeTab, setActiveTab] = useState<"directory" | "analytics">("directory");

  // Client Profitability calculations
  const clientStats = useMemo(() => {
    const statsMap = new Map<string, {
      clientCode: string;
      clientName: string;
      revenue: number;
      writerCost: number;
      editorCost: number;
      qcCost: number;
      otherExpenses: number;
      totalCosts: number;
      profit: number;
      jobCount: number;
    }>();

    // Seed from current profiles
    clients.forEach((client) => {
      statsMap.set(client.clientCode.toUpperCase(), {
        clientCode: client.clientCode,
        clientName: client.clientName,
        revenue: 0,
        writerCost: 0,
        editorCost: 0,
        qcCost: 0,
        otherExpenses: 0,
        totalCosts: 0,
        profit: 0,
        jobCount: 0,
      });
    });

    // Seed from jobs
    jobs.forEach((job) => {
      const codeUpper = job.clientCode.toUpperCase();
      if (!statsMap.has(codeUpper)) {
        statsMap.set(codeUpper, {
          clientCode: job.clientCode,
          clientName: job.clientCode,
          revenue: 0,
          writerCost: 0,
          editorCost: 0,
          qcCost: 0,
          otherExpenses: 0,
          totalCosts: 0,
          profit: 0,
          jobCount: 0,
        });
      }

      const current = statsMap.get(codeUpper)!;
      const jobRev = job.revenue !== undefined ? job.revenue : ((job.wordCount || 0) * (job.rate || 0));
      const jobWriter = job.writerCost || 0;
      const jobEditor = job.editorCost || 0;
      const jobQC = job.qcCost || 0;
      const jobOther = job.otherExpenses || 0;
      const jobTotalCosts = jobWriter + jobEditor + jobQC + jobOther;
      const jobProfit = jobRev - jobTotalCosts;

      current.revenue += jobRev;
      current.writerCost += jobWriter;
      current.editorCost += jobEditor;
      current.qcCost += jobQC;
      current.otherExpenses += jobOther;
      current.totalCosts += jobTotalCosts;
      current.profit += jobProfit;
      current.jobCount += 1;
    });

    return Array.from(statsMap.values());
  }, [clients, jobs]);

  // General total aggregates across all clients
  const globalTotals = useMemo(() => {
    let revenue = 0;
    let writerCost = 0;
    let editorCost = 0;
    let qcCost = 0;
    let otherExpenses = 0;
    let totalCosts = 0;
    let profit = 0;
    let jobCount = 0;

    clientStats.forEach((stat) => {
      revenue += stat.revenue;
      writerCost += stat.writerCost;
      editorCost += stat.editorCost;
      qcCost += stat.qcCost;
      otherExpenses += stat.otherExpenses;
      totalCosts += stat.totalCosts;
      profit += stat.profit;
      jobCount += stat.jobCount;
    });

    return {
      revenue,
      writerCost,
      editorCost,
      qcCost,
      otherExpenses,
      totalCosts,
      profit,
      jobCount,
    };
  }, [clientStats]);

  // Clients sorted descending by total profits made
  const sortedByProfit = useMemo(() => {
    return [...clientStats].sort((a, b) => b.profit - a.profit);
  }, [clientStats]);

  // Helper: Open Modal for Adding
  const openAddModal = () => {
    setClientName("");
    setClientCode("");
    setEmail("");
    setPhone("");
    setCountry("");
    setNotes("");
    setValidationError(null);
    setShowAddModal(true);
  };

  // Helper: Open Modal for Editing
  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setClientName(client.clientName);
    setClientCode(client.clientCode);
    setEmail(client.email);
    setPhone(client.phone);
    setCountry(client.country);
    setNotes(client.notes || "");
    setValidationError(null);
  };

  // Handle Form Submission (Add or Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setValidationError(null);

    const trimmedName = clientName.trim();
    const trimmedCode = clientCode.trim().toUpperCase();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedCountry = country.trim();
    const trimmedNotes = notes.trim();

    // Validation
    if (!trimmedName) return setValidationError("Client Name is required.");
    if (!trimmedCode) return setValidationError("Client Code is required.");
    if (!trimmedEmail) return setValidationError("Email is required.");
    if (!trimmedPhone) return setValidationError("Phone is required.");
    if (!trimmedCountry) return setValidationError("Country is required.");

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return setValidationError("Please enter a valid email address.");
    }

    // Code characters constraint (alphanumeric and dashes only, no space)
    const codeRegex = /^[A-Z0-9_-]+$/;
    if (!codeRegex.test(trimmedCode)) {
      return setValidationError("Client Code must only contain letters, numbers, dashes, or underscores (no spaces).");
    }

    // Duplicate client code checks (case-insensitive)
    const isDuplicateCode = clients.some(
      (c) => 
        c.clientCode.toUpperCase() === trimmedCode && 
        (!editingClient || c.id !== editingClient.id)
    );

    if (isDuplicateCode) {
      return setValidationError(`Client Code "${trimmedCode}" is already in use by another client.`);
    }

    setIsSubmitting(true);
    try {
      const clientData = {
        clientName: trimmedName,
        clientCode: trimmedCode,
        email: trimmedEmail,
        phone: trimmedPhone,
        country: trimmedCountry,
        notes: trimmedNotes,
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (editingClient) {
        const clientRef = doc(db, "clients", editingClient.id);
        await updateDoc(clientRef, clientData);
        setEditingClient(null);
      } else {
        const fullClientData = {
          ...clientData,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, "clients"), fullClientData);
        setShowAddModal(false);
      }
    } catch (err) {
      const operation = editingClient ? OperationType.UPDATE : OperationType.CREATE;
      const docPath = editingClient ? `clients/${editingClient.id}` : "clients";
      handleFirestoreError(err, operation, docPath);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Client Deletion Dialog Trigger
  const handleDeleteClient = (client: Client) => {
    setClientToDelete(client);
  };

  // Handle Client Deletion after confirmation
  const executeDeleteClient = async () => {
    if (!clientToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "clients", clientToDelete.id));
      // Reset view details if the deleted client was active
      if (viewingClient?.id === clientToDelete.id) {
        setViewingClient(null);
      }
      setClientToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `clients/${clientToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper: Get counts and details for matched jobs
  const getAssociatedJobs = (code: string) => {
    return jobs.filter((j) => j.clientCode.toLowerCase() === code.toLowerCase());
  };

  // Filter clients based on search query
  const filteredClients = clients.filter((client) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      client.clientName.toLowerCase().includes(q) ||
      client.clientCode.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      client.country.toLowerCase().includes(q) ||
      client.phone.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Clients</h2>
          <p className="text-sm text-gray-500 mt-1">Manage contact profiles, billing metadata, and view job associations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all w-full sm:w-64 text-sm shadow-sm"
            />
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all text-sm shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {clientsError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
          Error loading clients: {clientsError.message}
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div className="flex border-b border-gray-150 gap-4 mb-6">
        <button
          onClick={() => setActiveTab("directory")}
          className={`pb-3 px-1 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === "directory"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-950"
          }`}
        >
          Profiles Directory
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`pb-3 px-1 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === "analytics"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-950"
          }`}
        >
          Profitability Analytics
        </button>
      </div>

      {activeTab === "analytics" ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-xs">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block font-sans">Cumulative Revenue</span>
              <span className="text-2xl font-black text-indigo-600 block mt-2">
                ₹{globalTotals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-gray-400 mt-1 block">Total billed across {globalTotals.jobCount} assignments</span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-xs">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block font-sans">Total Expenses</span>
              <span className="text-2xl font-black text-rose-600 block mt-2">
                ₹{globalTotals.totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="text-[10px] text-gray-400 mt-1 flex gap-2">
                <span>Writer: {((globalTotals.writerCost / (globalTotals.totalCosts || 1)) * 100).toFixed(0)}%</span>
                <span>Editor: {((globalTotals.editorCost / (globalTotals.totalCosts || 1)) * 100).toFixed(0)}%</span>
                <span>QC: {((globalTotals.qcCost / (globalTotals.totalCosts || 1)) * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className={`bg-white rounded-2xl border p-6 shadow-xs ${
              globalTotals.profit >= 0 ? "border-emerald-200 bg-emerald-50/5" : "border-rose-100 bg-rose-50/5"
            }`}>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block font-sans">Calculated Net Profit</span>
              <span className={`text-2xl font-black block mt-2 ${
                globalTotals.profit >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                ₹{globalTotals.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {globalTotals.revenue > 0 ? (
                <span className="text-xs font-semibold text-emerald-700 mt-1 block">
                  Net Margin: {((globalTotals.profit / globalTotals.revenue) * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="text-xs text-gray-400 mt-1 block">Net Margin: N/A</span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-xs">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block font-sans">Active Base Volume</span>
              <span className="text-2xl font-extrabold text-slate-800 block mt-2">
                {globalTotals.jobCount} <span className="text-xs text-gray-400 font-normal">registered jobs</span>
              </span>
              <span className="text-xs text-gray-400 mt-1 block">
                Avg Profit / Job: ₹{(globalTotals.jobCount > 0 ? (globalTotals.profit / globalTotals.jobCount) : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Visual Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Client Revenue vs SLA Operating Expenses</h3>
                <p className="text-[11px] text-gray-400">Displays Billed Amount contrasted with Team payouts per profile.</p>
              </div>
              <div className="h-64 w-full">
                {sortedByProfit.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedByProfit.slice(0, 6)} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="clientCode" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                        itemStyle={{ color: '#fff' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar name="Revenue (₹)" dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar name="Expenses (₹)" dataKey="totalCosts" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">No client data yet.</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Client Contribution to Net Profit</h3>
                <p className="text-[11px] text-gray-400">Horizontal hierarchy showing total profits brought in by client accounts.</p>
              </div>
              <div className="h-64 w-full">
                {sortedByProfit.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedByProfit.slice(0, 6)} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="clientCode" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar name="Net Profit (₹)" dataKey="profit" radius={[0, 4, 4, 0]}>
                        {sortedByProfit.slice(0, 6).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#f43f5e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">No client data yet.</div>
                )}
              </div>
            </div>
          </div>

          {/* Leaders Board */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Client Accounts Profitability Leaderboard</h3>
                <p className="text-xs text-gray-400 mt-0.5">Ranked by total net profit contributions to AssignoPedia portfolio.</p>
              </div>
            </div>
            
            <div className="overflow-x-auto border-t border-gray-50">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase tracking-wider border-b border-gray-100">
                    <th className="px-6 py-4">Client Suffix</th>
                    <th className="px-6 py-4">Code</th>
                    <th className="px-6 py-4 text-center">Jobs count</th>
                    <th className="px-6 py-4 text-right">Revenue</th>
                    <th className="px-6 py-4 text-right">Costs (SLA)</th>
                    <th className="px-6 py-4 text-right">Net Profit</th>
                    <th className="px-6 py-4 text-right">Net Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-55">
                  {sortedByProfit.length > 0 ? (
                    sortedByProfit.map((stat, idx) => {
                      const isProfitPositive = stat.profit >= 0;
                      const marginPct = stat.revenue > 0 ? (stat.profit / stat.revenue) * 100 : 0;
                      return (
                        <tr key={stat.clientCode} className="hover:bg-gray-50/40 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
                              {idx + 1}
                            </span>
                            {stat.clientName}
                          </td>
                          <td className="px-6 py-4">
                            <span className="bg-indigo-50 text-indigo-700 font-mono text-xs font-bold px-2 py-0.5 rounded tracking-wide">
                              {stat.clientCode}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-gray-600 font-medium">{stat.jobCount}</td>
                          <td className="px-6 py-4 text-right text-gray-900 font-semibold">₹{stat.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 text-right text-rose-600 font-semibold">₹{stat.totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className={`px-6 py-4 text-right font-black ${isProfitPositive ? "text-emerald-700" : "text-rose-700"}`}>
                            {isProfitPositive ? "+" : "-"}₹{Math.abs(stat.profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isProfitPositive 
                                ? "bg-emerald-50 text-emerald-700" 
                                : "bg-rose-50 text-rose-700"
                            }`}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                        No clients are associated with any job transactions yet. Let's create jobs and edit financials!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Profiles Directory Display */
        clientsLoading ? (
          <div className="flex justify-center items-center py-20">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm p-6">
            <div className="bg-indigo-50 p-4 rounded-full mb-4">
              <User className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No clients found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              {searchQuery 
                ? "No clients match your search query. Try typing something else!" 
                : "Create directory profiles for clients to link jobs, coordinate pipelines, and organize metadata effortlessly."
              }
            </p>
            {!searchQuery && (
              <button
                onClick={openAddModal}
                className="mt-5 text-sm font-bold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition"
              >
                Add Your First Client
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => {
              const clientJobs = getAssociatedJobs(client.clientCode);
              return (
                <motion.div
                  key={client.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0 shadow-inner">
                          {client.clientName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-950 text-base leading-tight hover:text-indigo-600 transition truncate max-w-[150px]" title={client.clientName}>
                            {client.clientName}
                          </h4>
                          <span className="text-[11px] bg-indigo-50 text-indigo-700 font-mono font-bold px-2 py-0.5 rounded-md tracking-wider uppercase mt-1 inline-block">
                            {client.clientCode}
                          </span>
                        </div>
                      </div>
                      <div className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-xs font-semibold shrink-0">
                        {clientJobs.length} {clientJobs.length === 1 ? "Job" : "Jobs"}
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs text-gray-600 mt-4 border-t border-gray-50 pt-4">
                      <div className="flex items-center gap-2.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a href={`mailto:${client.email}`} className="hover:underline text-indigo-600 font-medium truncate">
                          {client.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{client.phone}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{client.country}</span>
                      </div>
                      {client.notes && (
                        <div className="mt-3 bg-gray-50 p-2.5 rounded-lg border border-gray-100 flex gap-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                            {client.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-gray-100 pt-4 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setViewingClient(client)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-bold rounded-lg transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Detail</span>
                    </button>
                    <button
                      onClick={() => openEditModal(client)}
                      className="p-2 hover:bg-indigo-50 hover:text-indigo-600 text-gray-500 rounded-lg transition"
                      title="Edit Profile"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClient(client)}
                      className="p-2 hover:bg-red-50 hover:text-red-650 text-gray-500 rounded-lg transition"
                      title="Delete Client"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {/* Add & Edit Modal Wrapper */}
      <AnimatePresence>
        {(showAddModal || editingClient !== null) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-600" />
                  {editingClient ? "Edit Client Profile" : "Add New Client"}
                </h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingClient(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                {validationError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm"
                    placeholder="e.g. Acme Corporations"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase flex items-center justify-between">
                    <span>Shorthand Client Code <span className="text-red-500">*</span></span>
                    <span className="text-[10px] font-normal text-gray-400 font-mono">Use same code for Jobs</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={clientCode}
                    onChange={(e) => setClientCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm font-mono uppercase"
                    placeholder="e.g. ACME"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm"
                    placeholder="e.g. accounts@acme.com"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm"
                    placeholder="e.g. +1 (555) 123-4567"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm"
                    placeholder="e.g. United States"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">
                    Internal Notes / Address / Billing Details
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm resize-none"
                    placeholder="Enter additional billing structures, office addresses, or milestones metadata..."
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingClient(null);
                    }}
                    className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-bold rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold rounded-xl transition shadow-md shadow-indigo-100 flex items-center gap-2"
                  >
                    {isSubmitting ? "Saving..." : (editingClient ? "Save Changes" : "Create Client")}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Details Drawer/Modal */}
      <AnimatePresence>
        {viewingClient !== null && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0 bg-indigo-50/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                    {viewingClient.clientName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900 leading-tight">
                      {viewingClient.clientName}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-mono font-bold px-1.5 py-0.5 rounded uppercase">
                        Code: {viewingClient.clientCode}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setViewingClient(null)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Meta Fields Card */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Email Address</span>
                    <a href={`mailto:${viewingClient.email}`} className="text-sm text-indigo-600 hover:underline font-bold truncate block">
                      {viewingClient.email}
                    </a>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Phone Number</span>
                    <span className="text-sm font-bold text-gray-800 block">
                      {viewingClient.phone}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Country / Locale</span>
                    <span className="text-sm font-bold text-gray-800 block">
                      {viewingClient.country}
                    </span>
                  </div>
                </div>

                {viewingClient.notes && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Internal Notes & Address</h4>
                    <pre className="text-xs text-gray-700 bg-gray-55/80 p-3.5 rounded-xl border border-gray-100 leading-relaxed font-sans whitespace-pre-wrap">
                      {viewingClient.notes}
                    </pre>
                  </div>
                )}

                {/* Job Associations List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Associated Pipeline Jobs</span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {getAssociatedJobs(viewingClient.clientCode).length}
                    </span>
                  </h4>

                  {getAssociatedJobs(viewingClient.clientCode).length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs">
                      No active pipeline jobs linked to client code "{viewingClient.clientCode}".
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 font-bold uppercase tracking-wider">
                            <th className="p-3">Job Name</th>
                            <th className="p-3">Code</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3 text-right">Words</th>
                            <th className="p-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {getAssociatedJobs(viewingClient.clientCode).map((job) => {
                            const amount = job.wordCount * job.rate;
                            return (
                              <tr key={job.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="p-3 font-semibold text-gray-900 max-w-[200px] truncate" title={job.jobName}>
                                  {job.jobName || "Untitled Job"}
                                </td>
                                <td className="p-3 text-gray-500 font-mono">
                                  {job.jobCode || "—"}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                    job.status === "Completed" ? "bg-green-100 text-green-700" :
                                    job.status === "Review" ? "bg-amber-100 text-amber-700" :
                                    job.status === "In Progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                                  }`}>
                                    {job.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right text-gray-600 font-mono">
                                  {job.wordCount.toLocaleString()}
                                </td>
                                <td className="p-3 text-right font-bold text-gray-900 font-mono">
                                  ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end shrink-0">
                <button
                  onClick={() => setViewingClient(null)}
                  className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-xs font-bold text-gray-700 rounded-lg shadow-sm transition"
                >
                  Close Detail
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {clientToDelete !== null && (
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
                  Confirm Deletion
                </h3>
                <button
                  onClick={() => setClientToDelete(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  disabled={isDeleting}
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-650 leading-relaxed">
                  Are you sure you want to permanently delete client{" "}
                  <strong className="text-gray-900">“{clientToDelete.clientName}”</strong> ({clientToDelete.clientCode})?
                </p>

                {getAssociatedJobs(clientToDelete.clientCode).length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-xl space-y-1">
                    <span className="font-bold">Warning: Associated Pipeline Jobs Found</span>
                    <p className="font-normal text-amber-700 leading-relaxed">
                      This client is currently linked with <strong className="font-bold">{getAssociatedJobs(clientToDelete.clientCode).length} jobs</strong> in your workspace. Deleting this client dashboard will NOT delete the jobs themselves, but they will no longer be linked to a registered client profile. This action is irreversible.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setClientToDelete(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={executeDeleteClient}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-red-100 flex items-center gap-2"
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
