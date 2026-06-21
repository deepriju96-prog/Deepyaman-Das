import React, { useState, useEffect, useRef } from "react";
import { db, auth, OperationType, handleFirestoreError } from "../firebase";
import { collection, addDoc, serverTimestamp, query, where } from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { 
  Plus, X, Calendar, FileText, User, DollarSign, Type, 
  ChevronDown, Check, ListTodo, Trash2, Briefcase, Hash,
  Mail, Phone, Globe, Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AddJobFormProps {
  onClose: () => void;
  existingJobs: any[];
}

const AddJobForm: React.FC<AddJobFormProps> = ({ onClose, existingJobs }) => {
  const [jobName, setJobName] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [wordCount, setWordCount] = useState("");
  const [rate, setRate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [startDate, setStartDate] = useState("");
  const [internalDeadline, setInternalDeadline] = useState("");
  const [clientDeadline, setClientDeadline] = useState("");
  const [notes, setNotes] = useState("");
  
  // Profitability Analytics fields
  const [revenue, setRevenue] = useState("");
  const [writerCost, setWriterCost] = useState("");
  const [editorCost, setEditorCost] = useState("");
  const [qcCost, setQcCost] = useState("");
  const [otherExpenses, setOtherExpenses] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-calculate default revenue from wordCount * rate
  useEffect(() => {
    if (wordCount && rate) {
      setRevenue((Number(wordCount) * Number(rate)).toString());
    }
  }, [wordCount, rate]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Search/filter query for interactive select dropdown
  const [clientSearch, setClientSearch] = useState("");

  // Sub-modal state for creating a new client
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCodeString, setNewClientCodeString] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientCountry, setNewClientCountry] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);

  // Search/dropdown state
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch actual saved clients from the database
  const clientsQuery = auth.currentUser
    ? query(collection(db, "clients"), where("userId", "==", auth.currentUser.uid))
    : null;
  const [clientsSnapshot] = useCollection(clientsQuery);
  const savedClients = clientsSnapshot?.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any) || [];

  // Compute unique client list with their most recent rate in historic jobs & saved clients
  const clientMap = new Map<string, { lastRate: number; name?: string }>();
  
  // 1. Seed from saved registered clients
  savedClients.forEach((client) => {
    if (client.clientCode) {
      clientMap.set(client.clientCode.toUpperCase(), {
        lastRate: 0,
        name: client.clientName
      });
    }
  });

  // 2. Overwrite / update with rate from actual existing jobs in pipeline
  existingJobs.forEach((job) => {
    if (job.clientCode) {
      const codeUpper = job.clientCode.toUpperCase();
      const existingEntry = clientMap.get(codeUpper);
      clientMap.set(codeUpper, {
        lastRate: job.rate || 0,
        name: existingEntry?.name || codeUpper
      });
    }
  });

  const clientsList = Array.from(clientMap.entries()).map(([code, entry]) => ({
    clientCode: code,
    clientName: entry.name || code,
    lastRate: entry.lastRate,
  }));

  // Filter client list based on typed query inside the search box inside dropdown
  const filteredClients = clientsList.filter((client) =>
    client.clientCode.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.clientName.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Selected client details for display
  const selectedClientObj = savedClients.find(
    (c) => c.clientCode.toUpperCase() === clientCode.toUpperCase()
  );
  const displaySelectedName = selectedClientObj 
    ? `${selectedClientObj.clientName} (${selectedClientObj.clientCode})`
    : clientsList.find(c => c.clientCode.toUpperCase() === clientCode.toUpperCase())?.clientName 
      ? `${clientsList.find(c => c.clientCode.toUpperCase() === clientCode.toUpperCase())?.clientName} (${clientCode})`
      : clientCode 
        ? clientCode 
        : "Select Existing Client...";

  const handleSelectClient = (code: string, lastRate: number) => {
    setClientCode(code);
    if (lastRate > 0) {
      setRate(lastRate.toString());
    }
    setShowDropdown(false);
    setClientSearch("");
  };

  const handleAddNewClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setClientValidationError(null);

    const trimmedName = newClientName.trim();
    const trimmedCode = newClientCodeString.trim().toUpperCase();
    const trimmedEmail = newClientEmail.trim();
    const trimmedPhone = newClientPhone.trim();
    const trimmedCountry = newClientCountry.trim();
    const trimmedNotes = newClientNotes.trim();

    // Field Validations matching database constraints
    if (!trimmedName) return setClientValidationError("Client Name is required.");
    if (!trimmedCode) return setClientValidationError("Client Code is required.");
    if (!trimmedEmail) return setClientValidationError("Email is required.");
    if (!trimmedPhone) return setClientValidationError("Phone is required.");
    if (!trimmedCountry) return setClientValidationError("Country is required.");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return setClientValidationError("Please enter a valid email address.");
    }

    const codeRegex = /^[A-Z0-9_-]+$/;
    if (!codeRegex.test(trimmedCode)) {
      return setClientValidationError("Client Code must only contain letters, numbers, dashes, or underscores (no spaces).");
    }

    // Check duplicate client code
    const isDuplicate = savedClients.some(
      (c) => c.clientCode.toUpperCase() === trimmedCode
    );
    if (isDuplicate) {
      return setClientValidationError(`Client Code "${trimmedCode}" is already in use by another client.`);
    }

    setIsAddingClient(true);
    try {
      const clientData = {
        clientName: trimmedName,
        clientCode: trimmedCode,
        email: trimmedEmail,
        phone: trimmedPhone,
        country: trimmedCountry,
        notes: trimmedNotes,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "clients"), clientData);
      
      // Auto-select this newly created client
      handleSelectClient(trimmedCode, 0);
      
      // Clear fields and close modal
      setNewClientName("");
      setNewClientCodeString("");
      setNewClientEmail("");
      setNewClientPhone("");
      setNewClientCountry("");
      setNewClientNotes("");
      setShowAddClientModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "clients");
    } finally {
      setIsAddingClient(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setValidationError(null);

    const trimmedJobName = jobName.trim();
    const trimmedJobCode = jobCode.trim();

    if (!trimmedJobName) {
      setValidationError("Job Name is required.");
      return;
    }

    if (!trimmedJobCode) {
      setValidationError("Job Code is required.");
      return;
    }

    if (!clientCode) {
      setValidationError("Please select or add a client first.");
      return;
    }

    if (!startDate) {
      setValidationError("Start Date is required.");
      return;
    }

    if (!internalDeadline) {
      setValidationError("Internal Deadline is required.");
      return;
    }

    if (!clientDeadline) {
      setValidationError("Client Deadline is required.");
      return;
    }

    const startObj = new Date(startDate);
    const internalObj = new Date(internalDeadline);
    const clientObj = new Date(clientDeadline);

    if (internalObj <= startObj) {
      setValidationError("Internal Deadline must be after the Start Date.");
      return;
    }

    if (clientObj <= internalObj) {
      setValidationError("Client Deadline must be after the Internal Deadline.");
      return;
    }

    // Check for duplicates
    const isDuplicate = existingJobs.some(
      (job) => job.jobCode?.trim().toLowerCase() === trimmedJobCode.toLowerCase()
    );

    if (isDuplicate) {
      setValidationError(`Job Code "${trimmedJobCode}" already exists. Please choose a unique code.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const defaultChecklistItems = [
        { id: "req_rec", text: "Requirement Received", completed: false },
        { id: "writ_asg", text: "Writer Assigned", completed: false },
        { id: "writ_sub", text: "Writer Submitted", completed: false },
        { id: "qc_comp", text: "Quality Check Completed", completed: false },
        { id: "del_cli", text: "Delivered To Client", completed: false },
        { id: "pay_rec", text: "Payment Received", completed: false },
      ];

      const jobData = {
        jobName: trimmedJobName,
        jobCode: trimmedJobCode,
        clientCode: clientCode.trim(),
        wordCount: Number(wordCount),
        rate: Number(rate),
        startDate: new Date(startDate).toISOString(),
        internalDeadline: new Date(internalDeadline).toISOString(),
        clientDeadline: new Date(clientDeadline).toISOString(),
        deadline: new Date(clientDeadline).toISOString(), // Maintain backwards compatibility
        notes,
        status: "Todo",
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        useChecklist: true,
        checklist: defaultChecklistItems,
        revenue: Number(revenue) || 0,
        writerCost: Number(writerCost) || 0,
        editorCost: Number(editorCost) || 0,
        qcCost: Number(qcCost) || 0,
        otherExpenses: Number(otherExpenses) || 0,
      };

      const docRef = await addDoc(collection(db, "jobs"), jobData);

      // Create "Job Created" timeline activity log
      try {
        await addDoc(collection(db, "job_activities"), {
          jobId: docRef.id,
          action: "Job Created",
          userName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || "Owner",
          userEmail: auth.currentUser?.email || "unknown@system.local",
          userId: auth.currentUser?.uid || "",
          createdAt: serverTimestamp()
        });
      } catch (errActivity) {
        console.error("Failed to write job created timeline activity: ", errActivity);
      }

      // Auto-trigger instant notification document on successful registration
      try {
        await addDoc(collection(db, "notifications"), {
          title: "New Job Assigned",
          message: `New task assigned: "${trimmedJobName}" (${trimmedJobCode}) for client ${clientCode.trim()}.`,
          read: false,
          userId: auth.currentUser.uid,
          type: "new_job",
          referenceId: docRef.id,
          referenceType: "job",
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.error("Failed to post assignment notification: ", notifErr);
      }

      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "jobs");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-600" />
            Add New Job
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
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
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-400" />
              Job Name <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={jobName}
              onChange={(e) => {
                setJobName(e.target.value);
                if (validationError) setValidationError(null);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm"
              placeholder="e.g. MBA Marketing Assignment"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Hash className="w-4 h-4 text-gray-400" />
              Job Code <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={jobCode}
              onChange={(e) => {
                setJobCode(e.target.value);
                if (validationError) setValidationError(null);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 text-sm"
              placeholder="e.g. AOP-2026-001"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1" ref={dropdownRef}>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              Client Shorthand Profile <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-left text-sm flex items-center justify-between"
              >
                <span className={clientCode ? "text-gray-900 font-medium" : "text-gray-400"}>
                  {displaySelectedName}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>

              {showDropdown && (
                <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 divide-y divide-gray-100">
                  {/* Global + Add New Client Button inside dropdown */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      setClientSearch("");
                      setShowAddClientModal(true);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-indigo-600 hover:bg-indigo-50 font-bold flex items-center gap-2 transition-all"
                  >
                    <Plus className="w-4 h-4 shrink-0 stroke-[3]" />
                    + Add New Client
                  </button>

                  {/* Dropdown Local Search Bar */}
                  <div className="p-2 bg-gray-50 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      className="w-full bg-transparent outline-none border-none text-xs text-gray-700 placeholder-gray-400"
                      placeholder="Search existing clients..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()} // Prevent closing dropdown on search input click
                    />
                    {clientSearch && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setClientSearch("");
                        }}
                        className="p-0.5 hover:bg-gray-200 rounded-full"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>

                  {/* Matched Clients List */}
                  <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client) => {
                        const isSelected = clientCode.trim().toLowerCase() === client.clientCode.toLowerCase();
                        return (
                          <button
                            key={client.clientCode}
                            type="button"
                            onClick={() => handleSelectClient(client.clientCode, client.lastRate)}
                            className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between group transition-colors ${
                              isSelected ? "bg-indigo-50/50" : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className={`font-semibold ${isSelected ? "text-indigo-900" : "text-gray-800"}`}>
                                {client.clientName && client.clientName !== client.clientCode ? client.clientName : client.clientCode}
                              </span>
                              <span className="text-[10px] text-gray-500 font-mono">
                                Code: {client.clientCode} {client.lastRate > 0 && `• Last Rate: ₹${client.lastRate.toFixed(3)}/word`}
                              </span>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-xs text-gray-400 text-center">
                        {clientSearch ? "No matching clients found." : "No clients configured yet. Click above to add."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Type className="w-4 h-4 text-gray-400" />
                Word Count
              </label>
              <input
                required
                type="number"
                value={wordCount}
                onChange={(e) => setWordCount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                Rate (INR/Word)
              </label>
              <input
                required
                type="number"
                step="0.001"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          {(wordCount && rate) && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900 flex justify-between items-center">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">Calculated word-rate total:</span>
              <span className="text-lg font-bold text-indigo-900 dark:text-indigo-200">
                ₹{(Number(wordCount) * Number(rate)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Financials & Profitability Fields */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-gray-150 dark:border-slate-800 space-y-3.5">
            <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest block">Financials (Profitability Analytics)</span>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-slate-350">Revenue (₹)</label>
                <input
                  type="number"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-750 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-slate-350">Writer Cost (₹)</label>
                <input
                  type="number"
                  value={writerCost}
                  onChange={(e) => setWriterCost(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-750 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-slate-350">Editor Cost (₹)</label>
                <input
                  type="number"
                  value={editorCost}
                  onChange={(e) => setEditorCost(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-750 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-slate-350">QC Cost (₹)</label>
                <input
                  type="number"
                  value={qcCost}
                  onChange={(e) => setQcCost(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-750 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 dark:text-slate-350">Other Expenses (₹)</label>
              <input
                type="number"
                value={otherExpenses}
                onChange={(e) => setOtherExpenses(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-slate-750 dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="0.00"
              />
            </div>

            {/* Live Profit Calculation Preview */}
            {(() => {
              const revVal = Number(revenue) || 0;
              const expenses = (Number(writerCost) || 0) + (Number(editorCost) || 0) + (Number(qcCost) || 0) + (Number(otherExpenses) || 0);
              const profitVal = revVal - expenses;
              const isProfitPositive = profitVal >= 0;
              return (
                <div className={`p-2.5 rounded-lg border text-xs font-bold flex justify-between items-center transition-colors ${
                  isProfitPositive 
                    ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400" 
                    : "bg-rose-50/60 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-400"
                }`}>
                  <span>Live Profit Estimation:</span>
                  <span>{isProfitPositive ? "₹" : "-₹"}{Math.abs(profitVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-500" />
                Start Date
              </label>
              <input
                required
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                Internal Deadline
              </label>
              <input
                required
                type="datetime-local"
                value={internalDeadline}
                onChange={(e) => setInternalDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-500" />
                Client Deadline
              </label>
              <input
                required
                type="datetime-local"
                value={clientDeadline}
                onChange={(e) => setClientDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[100px]"
              placeholder="Any additional details..."
            />
          </div>

          {/* Standard Job Checklist Preview */}
          <div className="pt-4 border-t border-gray-150 space-y-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-indigo-505 shrink-0" />
                Standard Job Workflow Checklist
              </span>
              <span className="text-xs text-gray-400 mt-0.5">Every new job includes this standard tracker to automatically monitor progress:</span>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-gray-600">
                {[
                  "Requirement Received",
                  "Writer Assigned",
                  "Writer Submitted",
                  "Quality Check Completed",
                  "Delivered To Client",
                  "Payment Received"
                ].map((text, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-100 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-indigo-505 shrink-0" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            disabled={isSubmitting}
            type="submit"
            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {isSubmitting ? "Adding..." : "Create Job"}
          </button>
        </form>
      </motion.div>

      {/* Add Client Sub-modal */}
      <AnimatePresence>
        {showAddClientModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[85vh] flex flex-col border border-gray-100"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-indigo-50/20">
                <h3 className="text-md font-bold text-gray-950 flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-600" />
                  Quick-Add Client Profile
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddClientModal(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleAddNewClientSubmit} className="p-5 space-y-3.5 overflow-y-auto flex-1 text-left">
                {clientValidationError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-lg flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span>{clientValidationError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newClientName}
                    onChange={(e) => {
                      setNewClientName(e.target.value);
                      if (clientValidationError) setClientValidationError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400 text-xs"
                    placeholder="e.g. Acme Corporation"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Shorthand Client Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newClientCodeString}
                    onChange={(e) => {
                      setNewClientCodeString(e.target.value);
                      if (clientValidationError) setClientValidationError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400 text-xs font-mono uppercase"
                    placeholder="e.g. ACME"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={newClientEmail}
                    onChange={(e) => {
                      setNewClientEmail(e.target.value);
                      if (clientValidationError) setClientValidationError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400 text-xs"
                    placeholder="e.g. billing@acme.com"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newClientPhone}
                    onChange={(e) => {
                      setNewClientPhone(e.target.value);
                      if (clientValidationError) setClientValidationError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400 text-xs"
                    placeholder="e.g. +1 (555) 0192"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newClientCountry}
                    onChange={(e) => {
                      setNewClientCountry(e.target.value);
                      if (clientValidationError) setClientValidationError(null);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400 text-xs"
                    placeholder="e.g. United Kingdom"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                    Billing Notes (Optional)
                  </label>
                  <textarea
                    value={newClientNotes}
                    onChange={(e) => setNewClientNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400 text-xs resize-none"
                    placeholder="Any general metadata or billing rates..."
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAddClientModal(false)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingClient}
                    className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-lg transition shadow-md shadow-indigo-100 flex items-center gap-1.5"
                  >
                    {isAddingClient ? "Saving..." : "Create Client"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AddJobForm;
