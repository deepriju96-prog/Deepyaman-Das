import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  Download, 
  CreditCard, 
  User, 
  Tag, 
  Plus, 
  Check, 
  Trash2, 
  Edit, 
  X, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Search, 
  Filter,
  Eye,
  PlusCircle,
  TrendingUp,
  Landmark,
  Briefcase,
  ArrowRight,
  HardDrive
} from "lucide-react";
import { jsPDF } from "jspdf";
import { 
  getCachedAccessToken, 
  connectGoogleDrive, 
  uploadFileToDrive, 
  ensureAppFolder, 
  findFolder, 
  createDriveFolder 
} from "../lib/googleDriveService";
import { auth, db, OperationType, handleFirestoreError } from "../firebase";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy 
} from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { motion, AnimatePresence } from "motion/react";

interface Job {
  id: string;
  clientCode: string;
  wordCount: number;
  rate: number;
  deadline: string;
  notes?: string;
  status: string;
  userId: string;
  createdAt: any;
  jobName?: string;
  jobCode?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  jobCode: string;
  client: string;
  amount: number;
  billingDate: string;
  dueDate: string;
  status: "Pending" | "Paid" | "Overdue";
  userId: string;
  createdAt: any;
  companyName?: string;
  billingMethod?: "manual" | "qty_rate" | "pages";
  quantity?: number;
  rate?: number;
  pages?: number;
  unitLabel?: string;
  taxPercentage?: number;
  discountAmount?: number;
  jobId?: string;
}

interface BillingSectionProps {
  jobs: Job[];
  user: {
    displayName: string | null;
    email: string | null;
    uid: string;
  };
  prefilledJobId?: string;
  onPrefilledJobIdCleared?: () => void;
  highlightedInvoiceId?: string;
  onHighlightedInvoiceIdCleared?: () => void;
}

export function getInvoicePricing(inv: { amount: number; taxPercentage?: number; discountAmount?: number }) {
  const base = Number(inv.amount) || 0;
  if (inv.taxPercentage === undefined || inv.taxPercentage === null) {
    const subtotal = Math.round((base / 1.18) * 100) / 100;
    const taxAmount = Math.round((base - subtotal) * 100) / 100;
    return {
      subtotal,
      discount: 0,
      taxPercent: 18,
      taxAmount,
      grandTotal: base
    };
  } else {
    const discount = Number(inv.discountAmount) || 0;
    const taxPercent = Number(inv.taxPercentage) || 0;
    const net = Math.max(0, base - discount);
    const taxAmount = Math.round(net * (taxPercent / 100) * 100) / 100;
    const grandTotal = Math.round((net + taxAmount) * 100) / 100;
    return {
      subtotal: base,
      discount,
      taxPercent,
      taxAmount,
      grandTotal
    };
  }
}

export function getDraftInvoicePricing(baseRect: number, discountInput: number | "", taxPctInput: number | "") {
  const base = Number(baseRect) || 0;
  const discount = discountInput !== "" ? Number(discountInput) : 0;
  const taxPercent = taxPctInput !== "" ? Number(taxPctInput) : 0;
  const net = Math.max(0, base - discount);
  const taxAmount = Math.round(net * (taxPercent / 100) * 100) / 100;
  const grandTotal = Math.round((net + taxAmount) * 100) / 100;
  return {
    subtotal: base,
    discount,
    taxPercent,
    taxAmount,
    grandTotal
  };
}

export default function BillingSection({ 
  jobs, 
  user,
  prefilledJobId,
  onPrefilledJobIdCleared,
  highlightedInvoiceId,
  onHighlightedInvoiceIdCleared
}: BillingSectionProps) {
  // Real-time fetching of invoices for the current user
  const invoicesQuery = useMemo(() => {
    return query(
      collection(db, "invoices"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
  }, [user.uid]);

  const [invoicesSnapshot, invoicesLoading, invoicesError] = useCollection(invoicesQuery);

  const invoices = useMemo(() => {
    return invoicesSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Invoice[] || [];
  }, [invoicesSnapshot]);

  // Clients options (for dropdown)
  const clientCodes = useMemo(() => {
    return Array.from(new Set(jobs.map((job) => job.clientCode))).sort();
  }, [jobs]);

  // Real-time fetching of registered clients for detail lookups
  const clientsQuery = useMemo(() => {
    return query(
      collection(db, "clients"),
      where("userId", "==", user.uid)
    );
  }, [user.uid]);

  const [clientsSnapshot] = useCollection(clientsQuery);

  const registeredClients = useMemo(() => {
    return clientsSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data() as any,
    })) || [];
  }, [clientsSnapshot]);

  // States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [clientFilter, setClientFilter] = useState<string>("All");

  // Job selection states
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [useJobAmount, setUseJobAmount] = useState<boolean>(true);

  // Modal and Form States
  const [showFormModal, setShowFormModal] = useState(false);
  const [modalTab, setModalTab] = useState<"form" | "preview">("form");
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
  const [formJobCode, setFormJobCode] = useState("");
  const [formClient, setFormClient] = useState("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formBillingDate, setFormBillingDate] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formStatus, setFormStatus] = useState<"Pending" | "Paid" | "Overdue">("Pending");
  const [formTaxPercentage, setFormTaxPercentage] = useState<number | "">("");
  const [formDiscountAmount, setFormDiscountAmount] = useState<number | "">("");
  
  // Custom input state if client is not in suggestions list
  const [isCustomClient, setIsCustomClient] = useState(false);
  const [customClientText, setCustomClientText] = useState("");

  const [isCustomJobCode, setIsCustomJobCode] = useState(false);
  const [customJobCodeText, setCustomJobCodeText] = useState("");

  // Calculation system states
  const [formCompanyName, setFormCompanyName] = useState("");
  const [calcMethod, setCalcMethod] = useState<"manual" | "qty_rate" | "pages">("manual");
  const [calcQuantity, setCalcQuantity] = useState<number>(20);
  const [calcRate, setCalcRate] = useState<number>(500);
  const [calcPages, setCalcPages] = useState<number>(10);
  const [calcUnitName, setCalcUnitName] = useState<string>("Assignments");

  // Page-based pricing calculator breakdown
  const pagePricingBreakdown = useMemo(() => {
    if (calcPages <= 0) {
      return { total: 0, breakdown: "0 pages specified" };
    }
    if (calcPages <= 10) {
      return { total: 1000, breakdown: "1-10 Pages tier flat rate = ₹1,000" };
    }
    if (calcPages <= 20) {
      return { total: 1800, breakdown: "11-20 Pages tier flat rate = ₹1,800" };
    }
    if (calcPages <= 30) {
      return { total: 2500, breakdown: "21-30 Pages tier flat rate = ₹2,500" };
    }
    const extra = calcPages - 30;
    const extraAmount = extra * 80;
    const total = 2500 + extraAmount;
    return {
      total,
      breakdown: `21-30 Pages base (₹2,500) + ${extra} extra pages × ₹80/page (₹${extraAmount.toLocaleString()}) = ₹${total.toLocaleString()}`
    };
  }, [calcPages]);

  // Selected job helper memos
  const selectedJob = useMemo(() => {
    return jobs.find(j => j.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const resolvedClient = useMemo(() => {
    if (!selectedJob) return null;
    return registeredClients.find(
      (c) => c.clientCode.toUpperCase() === selectedJob.clientCode.toUpperCase()
    ) || null;
  }, [selectedJob, registeredClients]);

  const resolvedProjectAmount = useMemo(() => {
    if (!selectedJob) return 0;
    return selectedJob.wordCount * selectedJob.rate;
  }, [selectedJob]);

  // Keep formAmount in sync with selected billing calculation method and useJobAmount checkbox
  React.useEffect(() => {
    if (selectedJob && useJobAmount) {
      const amt = selectedJob.wordCount * selectedJob.rate;
      setFormAmount(Math.round(amt * 100) / 100);
    } else if (calcMethod === "qty_rate") {
      const qty = Number(calcQuantity) || 0;
      const rate = Number(calcRate) || 0;
      setFormAmount(Math.round(qty * rate * 100) / 100);
    } else if (calcMethod === "pages") {
      setFormAmount(pagePricingBreakdown.total);
    }
  }, [selectedJob, useJobAmount, calcMethod, calcQuantity, calcRate, calcPages, pagePricingBreakdown.total]);

  // Invoice view preview state (for a nice paper slide-over or preview card)
  const [previewingInvoice, setPreviewingInvoice] = useState<Invoice | null>(null);

  // Memoized lookups for previewing details in the invoice
  const previewClient = useMemo(() => {
    if (!previewingInvoice) return null;
    const clientTerm = previewingInvoice.client ? previewingInvoice.client.toUpperCase().trim() : "";
    return registeredClients.find(
      (c) =>
        (c.clientCode && c.clientCode.toUpperCase().trim() === clientTerm) ||
        (c.clientName && c.clientName.toUpperCase().trim() === clientTerm)
    ) || null;
  }, [previewingInvoice, registeredClients]);

  const previewJob = useMemo(() => {
    if (!previewingInvoice) return null;
    return jobs.find(
      (j) =>
        (previewingInvoice.jobId && j.id === previewingInvoice.jobId) ||
        (previewingInvoice.jobCode && j.jobCode?.toUpperCase().trim() === previewingInvoice.jobCode.toUpperCase().trim())
    ) || null;
  }, [previewingInvoice, jobs]);

  // Stats calculation
  const stats = useMemo(() => {
    let paidAmt = 0;
    let paidCount = 0;
    
    let pendingAmt = 0;
    let pendingCount = 0;
    
    let overdueAmt = 0;
    let overdueCount = 0;
    
    let draftAmt = 0;
    let draftCount = 0;
    
    let cancelledAmt = 0;
    let cancelledCount = 0;

    invoices.forEach((inv) => {
      const pricing = getInvoicePricing(inv);
      const amt = pricing.grandTotal;
      
      if (inv.status === "Paid") {
        paidAmt += amt;
        paidCount += 1;
      } else if (inv.status === "Pending" || inv.status === "Sent") {
        pendingAmt += amt;
        pendingCount += 1;
      } else if (inv.status === "Overdue") {
        overdueAmt += amt;
        overdueCount += 1;
      } else if (inv.status === "Draft") {
        draftAmt += amt;
        draftCount += 1;
      } else if (inv.status === "Cancelled") {
        cancelledAmt += amt;
        cancelledCount += 1;
      }
    });

    const activeInvoices = invoices.filter(i => i.status !== "Cancelled");
    const totalInvoicesSum = activeInvoices.reduce((sum, i) => sum + getInvoicePricing(i).grandTotal, 0);

    return {
      totalCount: invoices.length,
      totalSum: totalInvoicesSum,
      paid: paidAmt,
      paidCount,
      pending: pendingAmt,
      pendingCount,
      overdue: overdueAmt,
      overdueCount,
      draft: draftAmt,
      draftCount,
      cancelled: cancelledAmt,
      cancelledCount,
      totalRevenue: paidAmt
    };
  }, [invoices]);

  // Track already invoiced jobs to prevent duplicates
  const alreadyInvoicedJobIds = useMemo(() => {
    return new Set(
      invoices
        .filter((inv) => inv.status !== "Cancelled" && inv.jobId)
        .map((inv) => inv.jobId)
    );
  }, [invoices]);

  const alreadyInvoicedJobCodes = useMemo(() => {
    return new Set(
      invoices
        .filter((inv) => inv.status !== "Cancelled" && inv.jobCode)
        .map((inv) => inv.jobCode.toUpperCase().trim())
    );
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Search matches
      const queryStr = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !queryStr ||
        inv.invoiceNumber.toLowerCase().includes(queryStr) ||
        inv.client.toLowerCase().includes(queryStr) ||
        inv.jobCode.toLowerCase().includes(queryStr);

      // Status Matches
      const matchesStatus = statusFilter === "All" || inv.status === statusFilter;

      // Client Matches
      const matchesClient = clientFilter === "All" || inv.client === clientFilter;

      return matchesSearch && matchesStatus && matchesClient;
    });
  }, [invoices, searchQuery, statusFilter, clientFilter]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingInvoice(null);
    setFormInvoiceNumber(`INV-${Math.floor(100000 + Math.random() * 900000)}`);
    setFormJobCode("");
    setFormClient("");
    setFormAmount("");
    setFormBillingDate(format(new Date(), "yyyy-MM-dd"));
    
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
    setFormDueDate(format(twoWeeksLater, "yyyy-MM-dd"));
    
    setFormStatus("Pending");
    setFormTaxPercentage("");
    setFormDiscountAmount("");
    setIsCustomClient(false);
    setCustomClientText("");
    setIsCustomJobCode(false);
    setCustomJobCodeText("");
    
    // Reset Job select state
    setSelectedJobId("");
    setUseJobAmount(true);
    
    // Reset Calculation system
    setFormCompanyName(user.displayName || "Freelance Writing Services");
    setCalcMethod("manual");
    setCalcQuantity(20);
    setCalcRate(500);
    setCalcPages(10);
    setCalcUnitName("Assignments");
    
    setModalTab("form");
    setShowFormModal(true);
  };

  // React to prefilledJobId (Generate Invoice from Job Details action)
  React.useEffect(() => {
    if (prefilledJobId && jobs.length > 0) {
      setEditingInvoice(null);
      setFormInvoiceNumber(`INV-${Math.floor(100000 + Math.random() * 900000)}`);
      setFormBillingDate(format(new Date(), "yyyy-MM-dd"));
      
      const twoWeeksLater = new Date();
      twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
      setFormDueDate(format(twoWeeksLater, "yyyy-MM-dd"));
      
      setFormStatus("Pending");
      
      const chosenJob = jobs.find(j => j.id === prefilledJobId);
      if (chosenJob) {
        setSelectedJobId(prefilledJobId);
        if (chosenJob.jobCode) {
          setFormJobCode(chosenJob.jobCode);
          setIsCustomJobCode(false);
          setCustomJobCodeText("");
        }
        
        // Find client details in registered clients for full descriptive name, or fallback on clientCode
        const matchedClientObj = registeredClients.find(
          (c) => c.clientCode.toUpperCase() === chosenJob.clientCode.toUpperCase()
        );
        
        if (matchedClientObj) {
          setFormClient(matchedClientObj.clientName || chosenJob.clientCode);
          setIsCustomClient(true);
          setCustomClientText(matchedClientObj.clientName || chosenJob.clientCode);
        } else {
          setFormClient(chosenJob.clientCode);
          setIsCustomClient(false);
          setCustomClientText("");
        }
        
        // Set amount automatically
        const amt = chosenJob.wordCount * chosenJob.rate;
        setFormAmount(Math.round(amt * 100) / 100);
        setUseJobAmount(true);
      }
      
      setFormTaxPercentage("");
      setFormDiscountAmount("");
      setFormCompanyName(user.displayName || "Freelance Writing Services");
      setCalcMethod("manual");
      setCalcQuantity(20);
      setCalcRate(500);
      setCalcPages(10);
      setCalcUnitName("Assignments");
      
      setModalTab("form");
      setShowFormModal(true);
      
      // Clear parent trigger state
      onPrefilledJobIdCleared?.();
    }
  }, [prefilledJobId, jobs, registeredClients, user?.displayName, onPrefilledJobIdCleared]);

  // React to highlightedInvoiceId (View Invoice from Job Details action)
  React.useEffect(() => {
    if (highlightedInvoiceId && invoices.length > 0) {
      const match = invoices.find(inv => inv.id === highlightedInvoiceId);
      if (match) {
        setPreviewingInvoice(match);
      }
      onHighlightedInvoiceIdCleared?.();
    }
  }, [highlightedInvoiceId, invoices, onHighlightedInvoiceIdCleared]);

  // Open Edit Modal
  const handleOpenEditModal = (inv: Invoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingInvoice(inv);
    setFormInvoiceNumber(inv.invoiceNumber);
    setFormJobCode(inv.jobCode);
    setFormClient(inv.client);
    setFormAmount(inv.amount);
    setFormBillingDate(inv.billingDate);
    setFormDueDate(inv.dueDate);
    setFormStatus(inv.status);
    setFormTaxPercentage(inv.taxPercentage !== undefined && inv.taxPercentage !== null ? inv.taxPercentage : "");
    setFormDiscountAmount(inv.discountAmount !== undefined && inv.discountAmount !== null ? inv.discountAmount : "");

    // Check if client matches standard code or is custom
    if (clientCodes.includes(inv.client)) {
      setIsCustomClient(false);
      setCustomClientText("");
    } else {
      setIsCustomClient(true);
      setCustomClientText(inv.client);
    }

    // Check if jobCode is in system or is custom
    const existingJob = jobs.find(j => j.jobCode === inv.jobCode);
    if (existingJob) {
      setSelectedJobId(existingJob.id);
      setIsCustomJobCode(false);
      setCustomJobCodeText("");
      // If invoice amount matches the job project amount, set checkbox enabled
      const jobAmt = existingJob.wordCount * existingJob.rate;
      setUseJobAmount(Math.abs(inv.amount - jobAmt) < 0.01);
    } else {
      setSelectedJobId("");
      setIsCustomJobCode(true);
      setCustomJobCodeText(inv.jobCode);
      setUseJobAmount(false);
    }

    // Default editing back to loaded calculations
    setFormCompanyName(inv.companyName || user.displayName || "Freelance Writing Services");
    setCalcMethod(inv.billingMethod || "manual");
    setCalcQuantity(inv.quantity ?? 20);
    setCalcRate(inv.rate ?? 500);
    setCalcPages(inv.pages ?? 10);
    setCalcUnitName(inv.unitLabel || "Assignments");

    setModalTab("form");
    setShowFormModal(true);
  };

  // Autofill from active completed/not completed jobs (Full job selection & sync)
  const handleJobSelectionChange = (jobId: string) => {
    setSelectedJobId(jobId);
    if (!jobId) {
      setUseJobAmount(false);
      return;
    }
    const chosenJob = jobs.find(j => j.id === jobId);
    if (!chosenJob) return;

    if (chosenJob.jobCode) {
      setFormJobCode(chosenJob.jobCode);
      setIsCustomJobCode(false);
    }
    
    // Find client details in registered clients for full descriptive name, or fallback on clientCode
    const matchedClientObj = registeredClients.find(
      (c) => c.clientCode.toUpperCase() === chosenJob.clientCode.toUpperCase()
    );
    
    if (matchedClientObj) {
      setFormClient(matchedClientObj.clientName || chosenJob.clientCode);
      setIsCustomClient(true);
      setCustomClientText(matchedClientObj.clientName || chosenJob.clientCode);
    } else {
      setFormClient(chosenJob.clientCode);
      setIsCustomClient(false);
      setCustomClientText("");
    }
    
    // Set amount automatically
    const amt = chosenJob.wordCount * chosenJob.rate;
    setFormAmount(Math.round(amt * 100) / 100);
    setUseJobAmount(true);
  };

  const handleAutofillFromJob = handleJobSelectionChange;

  // Quick Change Status
  const handleToggleStatusPaid = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = inv.status === "Paid" ? "Pending" : "Paid";
    try {
      await updateDoc(doc(db, "invoices", inv.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });

      // Handle timeline activity for associated job
      if (inv.jobId) {
        try {
          const actionText = nextStatus === "Paid" 
            ? `Invoice Paid: ${inv.invoiceNumber} status is now Paid` 
            : `Invoice Status Updated: ${inv.invoiceNumber} status reverted to Pending`;
          
          await addDoc(collection(db, "job_activities"), {
            jobId: inv.jobId,
            action: actionText,
            userName: user.displayName || user.email?.split('@')[0] || "User",
            userEmail: user.email || "unknown@system.local",
            userId: user.uid,
            createdAt: serverTimestamp()
          });
        } catch (actErr) {
          console.error("Failed to write invoice status toggle activity:", actErr);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${inv.id}`);
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this invoice? This action is permanent.")) return;
    try {
      await deleteDoc(doc(db, "invoices", invoiceId));
      if (previewingInvoice?.id === invoiceId) {
        setPreviewingInvoice(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`);
    }
  };

  // Handle Form Submission
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoiceNum = formInvoiceNumber.trim();
    const clientName = isCustomClient ? customClientText.trim() : formClient.trim();
    const jCode = isCustomJobCode ? customJobCodeText.trim() : formJobCode.trim();
    const billingAmt = Number(formAmount);

    if (!invoiceNum) {
      alert("Please provide an invoice number.");
      return;
    }
    if (!clientName) {
      alert("Please specify a client.");
      return;
    }
    if (!jCode) {
      alert("Please specify a job code.");
      return;
    }
    if (isNaN(billingAmt) || billingAmt <= 0) {
      alert("Please provide a valid invoice amount greater than zero.");
      return;
    }
    if (!formBillingDate) {
      alert("Please specify a billing date.");
      return;
    }
    if (!formDueDate) {
      alert("Please specify a payment due date.");
      return;
    }

    const taxPct = formTaxPercentage !== "" ? Number(formTaxPercentage) : undefined;
    const discountAmt = formDiscountAmount !== "" ? Number(formDiscountAmount) : undefined;

    if (taxPct !== undefined && (isNaN(taxPct) || taxPct < 0 || taxPct > 100)) {
      alert("Please provide a valid tax percentage between 0 and 100.");
      return;
    }
    if (discountAmt !== undefined && (isNaN(discountAmt) || discountAmt < 0)) {
      alert("Please provide a valid discount amount of 0 or greater.");
      return;
    }

    // Prevent duplicate invoices for the same job (Requirement 3)
    if (selectedJobId && formStatus !== "Cancelled") {
      const isJobAlreadyInvoiced = alreadyInvoicedJobIds.has(selectedJobId);
      const isCurrentEditJob = editingInvoice && editingInvoice.jobId === selectedJobId;
      if (isJobAlreadyInvoiced && !isCurrentEditJob) {
        alert("Alert: This job already has an active invoice associated with it. To prevent duplicate billing, you cannot generate multiple invoices for the same job.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const dataPayload: any = {
        invoiceNumber: invoiceNum,
        jobCode: jCode,
        client: clientName,
        amount: billingAmt,
        billingDate: formBillingDate,
        dueDate: formDueDate,
        status: formStatus,
        userId: user.uid,
        companyName: formCompanyName.trim() || user.displayName || "Freelance Writing Services",
        billingMethod: calcMethod,
      };

      if (taxPct !== undefined) {
        dataPayload.taxPercentage = taxPct;
      }
      if (discountAmt !== undefined) {
        dataPayload.discountAmount = discountAmt;
      }

      if (selectedJobId) {
        dataPayload.jobId = selectedJobId;
      }

      if (calcMethod === "qty_rate") {
        dataPayload.quantity = Number(calcQuantity) || 0;
        dataPayload.rate = Number(calcRate) || 0;
        dataPayload.unitLabel = calcUnitName.trim() || "Assignments";
      } else if (calcMethod === "pages") {
        dataPayload.pages = Number(calcPages) || 0;
      }

      if (editingInvoice) {
        // Edit Mode
        await updateDoc(doc(db, "invoices", editingInvoice.id), {
          ...dataPayload,
          updatedAt: serverTimestamp()
        });

        // Track timeline status edits
        if (editingInvoice.jobId) {
          try {
            let actionText = "";
            if (formStatus === "Paid" && editingInvoice.status !== "Paid") {
              actionText = `Invoice Paid: ${invoiceNum} status is now Paid`;
            } else if (formStatus !== editingInvoice.status) {
              actionText = `Invoice Status Updated: ${invoiceNum} status is now ${formStatus}`;
            }

            if (actionText) {
              await addDoc(collection(db, "job_activities"), {
                jobId: editingInvoice.jobId,
                action: actionText,
                userName: user.displayName || user.email?.split('@')[0] || "User",
                userEmail: user.email || "unknown@system.local",
                userId: user.uid,
                createdAt: serverTimestamp()
              });
            }
          } catch (actErr) {
            console.error("Failed to log invoice update action in timeline:", actErr);
          }
        }
      } else {
        // Create Mode
        await addDoc(collection(db, "invoices"), {
          ...dataPayload,
          createdAt: serverTimestamp()
        });

        if (selectedJobId) {
          try {
            await addDoc(collection(db, "job_activities"), {
              jobId: selectedJobId,
              action: `Invoice Generated: ${invoiceNum} (₹${billingAmt.toLocaleString()})`,
              userName: user.displayName || user.email?.split('@')[0] || "User",
              userEmail: user.email || "unknown@system.local",
              userId: user.uid,
              createdAt: serverTimestamp()
            });
          } catch (actErr) {
            console.error("Failed to log Invoice Generated timeline activity:", actErr);
          }
        }
        
        if (selectedJobId) {
          setSuccessMessage("Invoice generated successfully from job.");
          setTimeout(() => {
            setSuccessMessage(null);
          }, 6000);
        }
      }

      setShowFormModal(false);
      setEditingInvoice(null);
    } catch (error) {
      const op = editingInvoice ? OperationType.UPDATE : OperationType.CREATE;
      const pathStr = editingInvoice ? `invoices/${editingInvoice.id}` : "invoices";
      handleFirestoreError(error, op, pathStr);
    } finally {
      setIsSubmitting(false);
    }
  };

  // PDF Export Logic for a single invoice
  const handleExportSinglePDF = (inv: Invoice, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Helper to calculate page-based tier values in PDF
    const getPdfPagePricing = (pCount: number) => {
      if (pCount <= 0) return { total: 0, breakdown: "0 pages specified" };
      if (pCount <= 10) return { total: 1000, breakdown: "1-10 Pages flat rate" };
      if (pCount <= 20) return { total: 1800, breakdown: "11-20 Pages flat rate" };
      if (pCount <= 30) return { total: 2500, breakdown: "21-30 Pages flat rate" };
      const extra = pCount - 30;
      const extraAmount = extra * 80;
      const total = 2500 + extraAmount;
      return {
        total,
        breakdown: `21-30 Pages base (₹2,500) + ${extra} extra pages × ₹80`
      };
    };

    // Instantiate A4 PDF
    const docPDF = new jsPDF("p", "mm", "a4");

    const billDateStr = inv.billingDate ? format(new Date(inv.billingDate), "MMM dd, yyyy") : format(new Date(), "MMM dd, yyyy");
    const dueDateStr = inv.dueDate ? format(new Date(inv.dueDate), "MMM dd, yyyy") : format(new Date(), "MMM dd, yyyy");

    // Dynamic Lookups
    const pdfClient = registeredClients.find(
      (c) =>
        (inv.client && c.clientCode && c.clientCode.toUpperCase().trim() === inv.client.toUpperCase().trim()) ||
        (inv.client && c.clientName && c.clientName.toUpperCase().trim() === inv.client.toUpperCase().trim())
    ) || null;

    const pdfJob = jobs.find(
      (j) =>
        (inv.jobCode && j.jobCode && j.jobCode.toUpperCase().trim() === inv.jobCode.toUpperCase().trim())
    ) || null;

    // Running Y marker tracking
    let currentY = 20;

    // Dynamic running header drawn on Page 2+
    const drawPageHeader = () => {
      docPDF.setFillColor(79, 70, 229); // Indigo
      docPDF.roundedRect(20, currentY, 6, 6, 1, 1, "F");
      docPDF.setTextColor(255, 255, 255);
      docPDF.setFont("Helvetica", "bold");
      docPDF.setFontSize(5.5);
      docPDF.text("A", 21.8, currentY + 4.2);

      docPDF.setTextColor(15, 23, 42); // slate-900
      docPDF.setFont("Helvetica", "bold");
      docPDF.setFontSize(8);
      const cName = inv.companyName || user.displayName || "Freelance Writing Services";
      docPDF.text(cName, 28, currentY + 4);

      docPDF.setTextColor(148, 163, 184); // slate-400
      docPDF.setFont("Helvetica", "normal");
      docPDF.setFontSize(7.5);
      docPDF.text(`Invoice: ${inv.invoiceNumber}`, 190, currentY + 4, { align: "right" });

      docPDF.setDrawColor(241, 245, 249); // slate-100
      docPDF.setLineWidth(0.3);
      docPDF.line(20, currentY + 8, 190, currentY + 8);
      currentY += 14;
    };

    // Page Break Utility
    const checkSpace = (neededHeight: number) => {
      if (currentY + neededHeight > 255) {
        docPDF.addPage();
        currentY = 20;
        drawPageHeader();
      }
    };

    // 1. TOP HEADER & LOGO BLOCK (Page 1 static)
    // Left side: Logo details
    docPDF.setFillColor(79, 70, 229); // Indigo-600 #4f46e5
    docPDF.roundedRect(20, currentY, 12, 12, 2.5, 2.5, "F");
    
    docPDF.setTextColor(255, 255, 255);
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(10);
    docPDF.text("A", 24.5, currentY + 8.5);

    // Business letterhead meta
    docPDF.setTextColor(15, 23, 42); // slate-900
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(14);
    const companyLabel = inv.companyName || user.displayName || "Freelance Writing Services";
    docPDF.text(companyLabel, 36, currentY + 4.5);

    // Billed From Address & Contact
    docPDF.setTextColor(100, 100, 100);
    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(8);
    docPDF.text("AssignoPedia Creative Headquarters", 36, currentY + 9);
    docPDF.text(`Contact: ${user.email || "freelance@workflow.com"}`, 36, currentY + 13);

    // Right side: INVOICE title & meta
    docPDF.setTextColor(79, 70, 229); // Indigo core
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(20);
    docPDF.text("INVOICE", 190, currentY + 4.5, { align: "right" });

    docPDF.setTextColor(100, 100, 100);
    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(9);
    docPDF.text(`No: ${inv.invoiceNumber}`, 190, currentY + 9.5, { align: "right" });
    docPDF.text(`Date: ${billDateStr}`, 190, currentY + 14, { align: "right" });

    currentY += 19;

    // Divider bar
    docPDF.setDrawColor(226, 232, 240); // slate-200
    docPDF.setLineWidth(0.4);
    docPDF.line(20, currentY, 190, currentY);

    currentY += 6;

    // 2. PAYMENT STATUS BAR INDICATOR
    docPDF.setFillColor(248, 250, 252); // slate-50
    docPDF.setDrawColor(241, 245, 249); // slate-100
    docPDF.setLineWidth(0.3);
    docPDF.roundedRect(20, currentY, 170, 10, 1.5, 1.5, "FD");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(8);
    docPDF.setTextColor(100, 100, 100);
    docPDF.text("SETTLEMENT STATE INDICATOR", 24, currentY + 6.2);

    // Badge styling and text
    const badgeBg = inv.status === "Paid" ? [236, 253, 245] : (inv.status === "Overdue" ? [254, 242, 242] : [255, 251, 235]);
    const badgeTextCol = inv.status === "Paid" ? [4, 120, 87] : (inv.status === "Overdue" ? [185, 28, 28] : [180, 83, 9]);

    // Draw solid color badge background inside status bar
    docPDF.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]);
    docPDF.roundedRect(154, currentY + 2.5, 32, 5, 1, 1, "F");

    docPDF.setTextColor(badgeTextCol[0], badgeTextCol[1], badgeTextCol[2]);
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(7.5);
    const badgeLabel = inv.status.toUpperCase();
    docPDF.text(badgeLabel, 154 + (32 - docPDF.getTextWidth(badgeLabel)) / 2, currentY + 6);

    currentY += 15;

    // 3. CLIENT INFO CARD & TERM DETAILS (Side-by-Side Double Column)
    checkSpace(38);
    const cardsStartY = currentY;

    // Left card box (Client Info Bill to)
    docPDF.setFillColor(255, 255, 255);
    docPDF.setDrawColor(226, 232, 240); // slate-200
    docPDF.setLineWidth(0.35);
    docPDF.roundedRect(20, cardsStartY, 82, 32, 2, 2, "D");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(7.5);
    docPDF.setTextColor(148, 163, 184); // slate-400
    docPDF.text("BILL TO (CLIENT INFORMATION):", 24, cardsStartY + 6);

    // Client Name wrapping
    docPDF.setTextColor(15, 23, 42); // slate-900
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(9.5);
    const clientNameRaw = pdfClient ? pdfClient.clientName : (inv.client || "Unspecified Client");
    const splitClientName = docPDF.splitTextToSize(clientNameRaw, 72);
    docPDF.text(splitClientName, 24, cardsStartY + 11.5);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(8);
    docPDF.setTextColor(100, 100, 100);
    
    let clientEmailLine = "Email: N/A";
    let clientPhoneLine = "Phone: N/A";
    let clientCountryLine = "Country: N/A";
    if (pdfClient) {
      if (pdfClient.email) clientEmailLine = `Email: ${pdfClient.email}`;
      if (pdfClient.phone) clientPhoneLine = `Phone: ${pdfClient.phone}`;
      if (pdfClient.country) clientCountryLine = `Country: ${pdfClient.country}`;
    } else {
      clientEmailLine = `Client Account: ${inv.client}`;
    }
    
    docPDF.text(clientEmailLine, 24, cardsStartY + 19);
    docPDF.text(clientPhoneLine, 24, cardsStartY + 23);
    docPDF.text(clientCountryLine, 24, cardsStartY + 27);

    // Right card box (Invoice and Dates terms info)
    docPDF.roundedRect(108, cardsStartY, 82, 32, 2, 2, "D");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(7.5);
    docPDF.setTextColor(148, 163, 184); // slate-400
    docPDF.text("INVOICE TERMS & DELAY MATRIX:", 112, cardsStartY + 6);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(8.5);
    docPDF.setTextColor(71, 85, 105); // slate-600

    docPDF.text("Billing Issue Date:", 112, cardsStartY + 13);
    docPDF.text("Payment Due Date:", 112, cardsStartY + 19);
    docPDF.text("Secure Client Token:", 112, cardsStartY + 25);

    docPDF.setFont("Helvetica", "bold");
    docPDF.setTextColor(15, 23, 42); // Slate-900
    docPDF.text(billDateStr, 148, cardsStartY + 13);
    
    // Highlight due date if pending/overdue
    if (inv.status === "Overdue") {
      docPDF.setTextColor(185, 28, 28); // Red
    } else if (inv.status === "Pending") {
      docPDF.setTextColor(180, 83, 9); // Amber
    } else {
      docPDF.setTextColor(15, 23, 42);
    }
    docPDF.text(dueDateStr, 148, cardsStartY + 19);

    docPDF.setFont("Courier-Bold", "bold");
    docPDF.setFontSize(7.5);
    docPDF.setTextColor(100, 116, 139); // Slate-500
    const securityToken = inv.id ? inv.id.slice(0, 8).toUpperCase() : "N/A";
    docPDF.text(`ST-${securityToken}`, 148, cardsStartY + 25);

    currentY = cardsStartY + 38;

    // 4. ASSOCIATED JOB INFORMATION CARD
    checkSpace(28);
    docPDF.setFillColor(248, 250, 252); // slate-50
    docPDF.setDrawColor(226, 232, 240); // slate-200
    docPDF.setLineWidth(0.35);
    docPDF.roundedRect(20, currentY, 170, 24, 2, 2, "FD");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(7.5);
    docPDF.setTextColor(148, 163, 184); // slate-400
    docPDF.text("ASSOCIATED JOB & PROJECT INFORMATION:", 24, currentY + 6);

    // Job Title/Code Details
    docPDF.setTextColor(15, 23, 42); // slate-900
    docPDF.setFontSize(9.5);
    docPDF.setFont("Helvetica", "bold");
    const jobHeadline = pdfJob ? (pdfJob.jobName || "Content Writing Task Assignment") : "Registered Service Contract Assignment";
    const splitJobHeadline = docPDF.splitTextToSize(jobHeadline, 105);
    docPDF.text(splitJobHeadline, 24, currentY + 11.5);

    docPDF.setFont("Courier-Bold", "bold");
    docPDF.setFontSize(8);
    docPDF.setTextColor(79, 70, 229); // Indigo code
    docPDF.text(`Code: ${inv.jobCode}`, 24, currentY + 18.5);

    // Right aligned Job metric details
    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(8);
    docPDF.setTextColor(100, 100, 100);
    const deadlineTxt = pdfJob?.deadline ? `Original Due: ${pdfJob.deadline}` : "No specific deadline listed";
    docPDF.text(deadlineTxt, 186, currentY + 11.5, { align: "right" });

    // Word count / Rates metric
    let metricsLabel = "Pricing style: Manual fixed adjustments";
    if (pdfJob) {
      metricsLabel = `${pdfJob.wordCount.toLocaleString()} words @ ₹${(pdfJob.rate).toFixed(2)}/word`;
    }
    docPDF.setFont("Helvetica", "bold");
    docPDF.setTextColor(71, 85, 105);
    docPDF.text(metricsLabel, 186, currentY + 18.5, { align: "right" });

    currentY += 30;

    // 5. BILLING SUMMARY COMPACT TABLE
    checkSpace(32);

    // Table Header Area
    docPDF.setFillColor(15, 23, 42); // slate-900
    docPDF.rect(20, currentY, 170, 8, "F");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(8);
    docPDF.setTextColor(255, 255, 255);
    docPDF.text("LINE DESCRIPTION", 24, currentY + 5.5);
    docPDF.text("METRIC", 110, currentY + 5.5, { align: "center" });
    docPDF.text("AMOUNT (INR)", 186, currentY + 5.5, { align: "right" });

    currentY += 8;

    // Define line descriptions and metrics based on types
    let tableTitleRaw = "Corporate Flat Scope Editorial Assignment Fee";
    let tableSubRaw = "Deliverable written assignment and editing matching original directives.";
    let metricValStr = "Manual Flat Scale (1 Flat)";

    if (inv.billingMethod === "qty_rate") {
      tableTitleRaw = "Professional Content Writing Service Plan";
      const qValStr = inv.quantity ?? 20;
      const uValStr = inv.unitLabel || "Assignments";
      const rValStr = inv.rate ?? 500;
      tableSubRaw = `High-standard service execution of content assets.`;
      metricValStr = `${qValStr.toLocaleString()} ${uValStr} @ ₹${rValStr.toLocaleString()}/ea`;
    } else if (inv.billingMethod === "pages") {
      tableTitleRaw = "Premium Document Page-Based Tier Operations";
      const pCountVal = inv.pages ?? 10;
      const tierData = getPdfPagePricing(pCountVal);
      tableSubRaw = `${tierData.breakdown}`;
      metricValStr = `${pCountVal} Pages (Volume Rate)`;
    }

    // Wrap Table Descriptions safely to avoid any overlap!
    const splitTitleLines = docPDF.splitTextToSize(tableTitleRaw, 72);
    const splitSubLines = docPDF.splitTextToSize(tableSubRaw, 72);

    // Calculate row heights dynamically
    const textHeight = (splitTitleLines.length + splitSubLines.length) * 4.5;
    const computedRowHeight = Math.max(14, textHeight + 6);

    checkSpace(computedRowHeight);

    // Draw single unified border row box
    docPDF.setDrawColor(226, 232, 240); // slate-200
    docPDF.setLineWidth(0.35);
    docPDF.setFillColor(255, 255, 255);
    docPDF.rect(20, currentY, 170, computedRowHeight, "D");

    // Render wrap text descriptions inside row
    let textDrawY = currentY + 5.5;
    
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(8.5);
    docPDF.setTextColor(15, 23, 42); // slate-900
    docPDF.text(splitTitleLines, 24, textDrawY);

    textDrawY += (splitTitleLines.length * 4.2);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(7.5);
    docPDF.setTextColor(115, 115, 115); // Neutral-450
    docPDF.text(splitSubLines, 24, textDrawY);

    // Render quantities in center column
    docPDF.setFont("Helvetica", "semibold");
    docPDF.setFontSize(8);
    docPDF.setTextColor(71, 85, 105); // slate-600
    docPDF.text(metricValStr, 110, currentY + (computedRowHeight / 2) + 2.5, { align: "center" });

    // Render price value in right-aligned column
    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(9);
    docPDF.setTextColor(15, 23, 42); // slate-900
    const rawAmtText = `₹${Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    docPDF.text(rawAmtText, 186, currentY + (computedRowHeight / 2) + 2.5, { align: "right" });

    currentY += computedRowHeight;

    // 6. TAX CALCULATOR & TOTALS BOX (SUPPORT FOR OVERALL DISCOUNTS & DYNAMIC TAX PERCENTAGE)
    const pricing = getInvoicePricing(inv);
    const hasDiscount = pricing.discount > 0;
    
    checkSpace(hasDiscount ? 38 : 32);

    // Draw Totals calculations block right-aligned
    const totalBlockX = 120;
    const spacingY = 5.5;
    let localY = currentY + 6;

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(8);
    docPDF.setTextColor(120, 120, 120);

    docPDF.text("Subtotal (Base Value):", totalBlockX, localY);
    docPDF.text(`₹${pricing.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 186, localY, { align: "right" });

    if (hasDiscount) {
      localY += spacingY;
      docPDF.text("Discount Deducted:", totalBlockX, localY);
      docPDF.text(`- ₹${pricing.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 186, localY, { align: "right" });
    }

    localY += spacingY;
    docPDF.text(`Estimated Tax (${pricing.taxPercent}%):`, totalBlockX, localY);
    docPDF.text(`₹${pricing.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 186, localY, { align: "right" });

    localY += spacingY + 1.5;

    // Bold highlight for grand total
    docPDF.setFillColor(241, 245, 249); // slate-100 backdrop for main total
    docPDF.roundedRect(totalBlockX - 4, localY - 3.5, 74, 8, 1, 1, "F");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(9);
    docPDF.setTextColor(15, 23, 42); // slate-900
    docPDF.text("Grand Total Amount:", totalBlockX, localY + 2);

    docPDF.setFontSize(10);
    docPDF.setTextColor(79, 70, 229); // Indigo bold primary
    docPDF.text(`₹${pricing.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 186, localY + 2, { align: "right" });

    currentY = localY + 12;

    // 7. REMITTANCE DIRECTION INFORMATION
    checkSpace(28);
    docPDF.setDrawColor(241, 245, 249); // slate-100
    docPDF.setFillColor(250, 251, 252); // slate-25
    docPDF.roundedRect(20, currentY, 170, 22, 1.5, 1.5, "FD");

    docPDF.setFont("Helvetica", "bold");
    docPDF.setFontSize(7.5);
    docPDF.setTextColor(71, 85, 105); // slate-600
    docPDF.text("REMITTANCE DIRECTIONS & INSTRUCTIONS:", 24, currentY + 5.5);

    docPDF.setFont("Helvetica", "normal");
    docPDF.setFontSize(7);
    docPDF.setTextColor(120, 120, 120);
    docPDF.text(`1. Please clear the complete total of ₹${pricing.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on or before the due date (${dueDateStr}).`, 24, currentY + 10.5);
    docPDF.text(`2. Kindly quote active Invoice reference number: "${inv.invoiceNumber}" in the bank deposit remarks for instant auto-clearance.`, 24, currentY + 15.5);

    // End-of-file page footprint iteration
    const totalPagesCount = (docPDF.internal as any).getNumberOfPages();
    for (let pageIdx = 1; pageIdx <= totalPagesCount; pageIdx++) {
      docPDF.setPage(pageIdx);
      docPDF.setFont("Helvetica", "normal");
      docPDF.setFontSize(7.5);
      docPDF.setTextColor(156, 163, 175); // gray-400

      // Divider row just above bottom footprint text
      docPDF.setDrawColor(241, 245, 249); // slate-100
      docPDF.setLineWidth(0.35);
      docPDF.line(20, 276, 190, 276);

      // Centered footer branding requested by the user
      const docFooterBranding = "Generated by AssignoPedia Services";
      docPDF.text(docFooterBranding, 20, 281.5);
      
      const docPageMetricLabel = `Page ${pageIdx} of ${totalPagesCount}`;
      docPDF.text(docPageMetricLabel, 190, 281.5, { align: "right" });
    }

    docPDF.save(`${inv.invoiceNumber}_invoice.pdf`);

    // Asynchronously perform cloud backup in Google Drive if authorized
    if (getCachedAccessToken()) {
      const pdfBlob = docPDF.output("blob");
      const pdfFile = new File([pdfBlob], `${inv.invoiceNumber}_invoice.pdf`, { type: "application/pdf" });

      (async () => {
        try {
          const appFolderId = await ensureAppFolder();
          
          // Separate Folder for Invoices inside our Workspace
          const invoiceFolderId = await findFolder("Invoices", appFolderId) || await createDriveFolder("Invoices", appFolderId);
          
          const uploadedFile = await uploadFileToDrive(
            `${inv.invoiceNumber}_invoice.pdf`, 
            "application/pdf", 
            pdfFile, 
            invoiceFolderId
          );

          // Find the related job if any exists
          const correlatedJob = jobs.find(
            (j) =>
              (inv.jobId && j.id === inv.jobId) ||
              (inv.jobCode && j.jobCode && j.jobCode.toUpperCase().trim() === inv.jobCode.toUpperCase().trim())
          );

          // If linked to a job, register it in job_files for cohesive repository viewing
          if (correlatedJob) {
            await addDoc(collection(db, "job_files"), {
              jobId: correlatedJob.id,
              fileName: `${inv.invoiceNumber}_invoice.pdf`,
              category: "Invoice",
              fileType: "application/pdf",
              fileSize: pdfBlob.size,
              fileData: uploadedFile.webViewLink || "",
              uploadedBy: user?.displayName || user?.email?.split("@")[0] || "System",
              userId: user?.uid || "system",
              createdAt: serverTimestamp(),
              driveFileId: uploadedFile.id || null,
              driveFileUrl: uploadedFile.webViewLink || null
            });

            await addDoc(collection(db, "job_activities"), {
              jobId: correlatedJob.id,
              action: `Invoice PDF generated and backed up to Google Drive Folder: ${inv.invoiceNumber}_invoice.pdf`,
              userName: user?.displayName || user?.email?.split("@")[0] || "System",
              userEmail: user?.email || "system@assignopedia.local",
              userId: user?.uid || "system",
              createdAt: serverTimestamp()
            });
          }

          setSuccessMessage(`Invoice backed up to Google Drive successfully! Filename: ${inv.invoiceNumber}_invoice.pdf`);
          setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
          console.error("Failed to backup generated invoice PDF to Google Drive:", err);
        }
      })();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Dynamic Success Banner */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/85 rounded-2xl flex items-center justify-between shadow-xs transition-all font-sans"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-xl">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-205">
                {successMessage}
              </p>
            </div>
            <button 
              onClick={() => setSuccessMessage(null)}
              className="p-1 px-2.5 text-emerald-800 dark:text-emerald-350 hover:bg-emerald-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition text-xs font-bold"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Invoice Analytics */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-indigo-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs px-3 py-1 rounded-full font-bold tracking-wide uppercase">
            Invoicing Panel
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2.5">Billing & Accounts Desk</h2>
          <p className="text-gray-300 mt-2 text-sm md:text-base max-w-xl">
            Create, track, edit, and export client invoices. Monitor real-time payments pipeline, aging invoices, and streamline remittance.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 shrink-0"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>Generate Invoice</span>
        </button>
      </div>

      {/* Grid of Financial Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Invoices */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-150 dark:border-slate-850 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Total Invoices</span>
            <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block">
              ₹{stats.totalSum.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-extrabold inline-block">
              {stats.totalCount} Invoiced
            </span>
          </div>
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5 rounded-xl border border-slate-100 dark:border-indigo-950/40 self-start">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
        </div>

        {/* Card 2: Paid Invoices */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-150 dark:border-slate-850 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-emerald-600 dark:text-emerald-500 font-bold uppercase tracking-wider block">Paid Invoices</span>
            <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 block">
              ₹{stats.paid.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-extrabold inline-block">
              {stats.paidCount} Cleared
            </span>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-950/40 self-start">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        {/* Card 3: Pending Invoices */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-150 dark:border-slate-850 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider block">Pending Invoices</span>
            <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400 block">
              ₹{stats.pending.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-extrabold inline-block">
              {stats.pendingCount} Standing
            </span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-950/40 self-start">
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
        </div>

        {/* Card 4: Overdue Invoices */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-150 dark:border-slate-850 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-red-650 dark:text-red-400 font-bold uppercase tracking-wider block">Overdue Invoices</span>
            <span className="text-lg font-extrabold text-red-650 dark:text-red-400 block">
              ₹{stats.overdue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-full font-extrabold inline-block">
              {stats.overdueCount} Aging
            </span>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-950/40 self-start">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
        </div>

        {/* Card 5: Total Revenue */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-150 dark:border-slate-850 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block">Total Revenue</span>
            <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block">
              ₹{stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-450 px-1.5 py-0.5 rounded-full font-extrabold inline-block">
              Cash Received
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-850 self-start">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Control Filters Row */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80 group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            placeholder="Search invoice #, job code, client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-100 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 flex-1 sm:flex-initial">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-semibold text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer focus:ring-1 focus:ring-indigo-500"
            >
              <option value="All" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">All Statuses</option>
              <option value="Draft" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Draft</option>
              <option value="Sent" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Sent</option>
              <option value="Pending" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Pending</option>
              <option value="Paid" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Paid</option>
              <option value="Overdue" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Overdue</option>
              <option value="Cancelled" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">Cancelled</option>
            </select>
          </div>

          {/* Client Filter */}
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 flex-1 sm:flex-initial">
            <User className="w-3.5 h-3.5" />
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="text-xs font-semibold text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer focus:ring-1 focus:ring-indigo-500"
            >
              <option value="All" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">All Clients</option>
              {clientCodes.map((code) => (
                <option key={code} value={code} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">{code}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Invoice List Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-xs overflow-hidden">
        {invoicesLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-650 mb-2"></div>
            <p className="text-gray-400 dark:text-slate-500 text-xs font-semibold">Synchronizing invoice records...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-20 text-center space-y-4 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-2xl m-4">
            <div className="bg-gray-50 dark:bg-slate-800 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border border-gray-100 dark:border-slate-700">
              <FileText className="w-8 h-8 text-gray-300 dark:text-slate-600" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-gray-800 dark:text-white">No invoices match selected filters</h4>
              <p className="text-xs text-gray-400 dark:text-slate-500 max-w-sm mx-auto">
                Modify your filters above, or generate a fresh invoice sheet to start registering incoming payments.
              </p>
            </div>
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-black rounded-lg transition-all"
            >
              Configure Invoice
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-150 dark:border-slate-800 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                  <th className="py-4 px-6">Invoice details</th>
                  <th className="py-4 px-4">Associated job</th>
                  <th className="py-4 px-4">Amount</th>
                  <th className="py-4 px-4">Billed / due date</th>
                  <th className="py-4 px-4 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-xs text-gray-700 dark:text-slate-300">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.status === "Paid";
                  const isOverdue = inv.status === "Overdue";
                  
                  return (
                    <tr 
                      key={inv.id} 
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      onClick={() => setPreviewingInvoice(inv)}
                    >
                      {/* Invoice details */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
                              {inv.invoiceNumber}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 font-semibold flex items-center gap-1">
                              <Tag className="w-3 h-3 text-indigo-400 dark:text-indigo-500" />
                              {inv.client}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Associated job */}
                      <td className="py-4 px-4">
                        <span className="font-mono text-slate-600 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/60 px-2.5 py-1 rounded-md">
                          {inv.jobCode}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-4 px-4">
                        <span className="font-extrabold text-slate-800 dark:text-white text-sm">
                          ₹{getInvoicePricing(inv).grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Dates */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400 dark:text-slate-500" />
                            {inv.billingDate}
                          </span>
                          <span className={`text-[10px] font-bold mt-1 ${isOverdue ? 'text-red-550 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'}`}>
                            Due: {inv.dueDate}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase border ${
                            isPaid 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : isOverdue 
                                ? "bg-red-50 text-red-700 border-red-100" 
                                : "bg-amber-50 text-amber-700 border-amber-100"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isPaid ? "bg-emerald-500" : isOverdue ? "bg-red-500" : "bg-amber-500"
                            }`} />
                            {inv.status}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2.5">
                          {/* Toggle status paid button */}
                          <button
                            onClick={(e) => handleToggleStatusPaid(inv, e)}
                            title={isPaid ? "Mark as Pending" : "Mark as Paid"}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isPaid 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" 
                                : "bg-white border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50/30"
                            }`}
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </button>

                          {/* Export single PDF */}
                          <button
                            onClick={(e) => handleExportSinglePDF(inv, e)}
                            title="Export PDF Invoice"
                            className="p-1.5 bg-white border border-gray-200 hover:border-indigo-300 rounded-lg text-gray-450 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Edit button */}
                          <button
                            onClick={(e) => handleOpenEditModal(inv, e)}
                            title="Edit Invoice"
                            className="p-1.5 bg-white border border-gray-200 hover:border-indigo-300 rounded-lg text-gray-450 hover:text-indigo-650 hover:bg-indigo-50/30 transition-all cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDeleteInvoice(inv.id, e)}
                            title="Delete Invoice"
                            className="p-1.5 bg-white border border-gray-200 hover:border-red-300 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50/30 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Sidebar / View Panel Overlay */}
      <AnimatePresence>
        {previewingInvoice && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex justify-end">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              className="bg-slate-50 dark:bg-slate-950 w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden relative"
            >
              {/* Overlay header */}
              <div className="p-5 border-b border-gray-150 dark:border-slate-800 flex items-center justify-between bg-slate-900 text-white shadow-md">
                <div className="flex items-center gap-3">
                  <Landmark className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="font-extrabold text-sm tracking-tight">Professional Invoice Console</h4>
                    <p className="text-[10px] text-indigo-200/80 font-bold font-mono tracking-wide">SYSTEM ID: {previewingInvoice.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewingInvoice(null)}
                  className="p-2 hover:bg-slate-850 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Overlay Paper Wrapper: Beautiful Invoice Paper style */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-100/50 dark:bg-slate-950/40">
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-sm space-y-8 relative overflow-hidden transition-all">
                  {/* Top decorative visual strip representing state color */}
                  <div className={`absolute top-0 inset-x-0 h-1.5 ${
                    previewingInvoice.status === "Paid" ? "bg-emerald-500" : previewingInvoice.status === "Overdue" ? "bg-red-500" : "bg-amber-500"
                  }`} />

                  {/* Letterhead header section */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block">Official Document</span>
                      <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none font-sans flex items-center gap-2">
                        <span>INVOICE</span>
                        <span className="text-gray-300 dark:text-slate-700 font-light">|</span>
                        <span className="text-indigo-500 font-mono tracking-tighter text-lg md:text-xl font-bold">{previewingInvoice.invoiceNumber}</span>
                      </h3>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Date Created: {previewingInvoice.billingDate}</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-1.5 self-start sm:self-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                        previewingInvoice.status === "Paid" 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50" 
                          : previewingInvoice.status === "Overdue" 
                            ? "bg-red-50 text-red-700 border-red-200/60 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50" 
                            : "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          previewingInvoice.status === "Paid" ? "bg-emerald-500" : previewingInvoice.status === "Overdue" ? "bg-red-500" : "bg-amber-500"
                        }`} />
                        {previewingInvoice.status}
                      </span>
                    </div>
                  </div>

                  {/* Company Information section (Redesigned structure) */}
                  <div className="space-y-3 bg-slate-50/50 dark:bg-slate-900/40 p-4 border border-gray-100 dark:border-slate-800/80 rounded-xl flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-indigo-550 dark:text-indigo-400" />
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Company Information</span>
                    </div>
                    <div className="space-y-1.5 min-w-0 break-words">
                      <h4 className="text-sm font-black text-slate-850 dark:text-slate-150 leading-tight">
                        {previewingInvoice.companyName || user.displayName || "Freelance Writing Services"}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal flex items-start gap-1">
                        <span className="font-semibold text-[10px] text-indigo-500 dark:text-indigo-400 uppercase mt-0.5 shrink-0">EMAIL:</span>
                        <span className="break-all">{user.email || "freelance@workflow.com"}</span>
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold leading-normal">
                        Secure Workspace Billing Agent
                      </p>
                    </div>
                  </div>

                  {/* Client Information section (Redesigned structure) */}
                  <div className="space-y-3 bg-slate-50/50 dark:bg-slate-900/40 p-4 border border-gray-100 dark:border-slate-800/80 rounded-xl flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-550 dark:text-indigo-400" />
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Client Information</span>
                    </div>
                    <div className="space-y-1.5 min-w-0 break-words">
                      <h4 className="text-sm font-black text-slate-855 dark:text-slate-150 leading-tight border-b border-gray-100 dark:border-slate-800 pb-1">
                        {previewClient ? previewClient.clientName : (previewingInvoice.client || "Unspecified Client")}
                      </h4>
                      {previewClient ? (
                        <div className="space-y-1">
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal flex items-start gap-1">
                            <span className="font-semibold text-[10px] text-indigo-500 dark:text-indigo-400 uppercase shrink-0 mt-0.5">CODE:</span>
                            <span className="font-mono bg-indigo-50 dark:bg-indigo-950/30 px-1 py-0.5 text-indigo-600 dark:text-indigo-400 rounded text-[10px] tracking-tight">{previewClient.clientCode}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal flex items-start gap-1">
                            <span className="font-semibold text-[10px] text-indigo-500 dark:text-indigo-400 uppercase shrink-0 mt-0.5">EMAIL:</span>
                            <span className="break-all text-slate-750 dark:text-slate-300 font-bold">{previewClient.email || "N/A"}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal flex items-start gap-1">
                            <span className="font-semibold text-[10px] text-indigo-500 dark:text-indigo-400 uppercase shrink-0 mt-0.5">PHONE:</span>
                            <span>{previewClient.phone || "N/A"}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal flex items-start gap-1">
                            <span className="font-semibold text-[10px] text-indigo-500 dark:text-indigo-400 uppercase shrink-0 mt-0.5">COUNTRY:</span>
                            <span className="font-black text-slate-800 dark:text-slate-200">{previewClient.country || "N/A"}</span>
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal flex items-start gap-1">
                            <span className="font-semibold text-[10px] text-indigo-500 dark:text-indigo-400 uppercase shrink-0 mt-0.5">CODE:</span>
                            <span className="font-mono bg-slate-50 dark:bg-slate-800 px-1 py-0.5 text-slate-550 dark:text-slate-400 rounded text-[10px] tracking-tight">{previewingInvoice.client}</span>
                          </p>
                          <p className="text-[11px] text-gray-400 dark:text-slate-500 font-medium italic">Detailed contact details not registered in database.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Job Information section (Redesigned structure) */}
                  <div className="space-y-4 bg-slate-5/50 dark:bg-slate-900/40 p-5 border border-gray-100 dark:border-slate-800/80 rounded-xl min-w-0">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-indigo-550 dark:text-indigo-400" />
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Job Information</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                      <div className="space-y-1 min-w-0 break-words">
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-extrabold uppercase">Associated Writeup job</span>
                        <p className="font-extrabold text-slate-850 dark:text-slate-200 text-sm">
                          {previewJob ? (previewJob.jobName || "Associated Content Assignment") : "Registered Service Contract"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-extrabold uppercase">Unique Job Code</span>
                        <div className="flex items-center">
                          <span className="font-mono text-xs font-black text-indigo-605 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-900/30 px-2.5 py-1 rounded-md tracking-wider">
                            {previewingInvoice.jobCode}
                          </span>
                        </div>
                      </div>
                      {previewJob && (
                        <>
                          <div className="space-y-1 min-w-0">
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 font-extrabold uppercase">Job Word Count & Rate</span>
                            <p className="font-semibold text-slate-700 dark:text-slate-350">
                              {previewJob.wordCount.toLocaleString()} words @ ₹{(previewJob.rate ?? 0).toFixed(2)}/word
                            </p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 font-extrabold uppercase">Original Deadline</span>
                            <p className="font-semibold text-slate-700 dark:text-slate-350 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{previewJob.deadline}</span>
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {/* Scope Notes Sub-wrapper */}
                    {previewJob?.notes && (
                      <div className="mt-2.5 p-3.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/80 rounded-xl space-y-1">
                        <span className="text-[9px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest block">Scope briefing / Delivery Notes</span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-450 font-medium whitespace-pre-line leading-relaxed break-words">
                          {previewJob.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Billing Summary section (Redesigned with responsive auto-resizing table & word wrap) */}
                  <div className="space-y-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-550 dark:text-indigo-400" />
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Billing Summary</span>
                    </div>
                    
                    <div className="border border-gray-150 dark:border-slate-800 rounded-xl overflow-x-auto bg-slate-50/40 dark:bg-slate-900/50">
                      <table className="w-full text-left border-collapse table-auto">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-900 border-b border-gray-150 dark:border-slate-800 text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            <th className="py-3 px-4 min-w-[190px]">Line Item & Description</th>
                            <th className="py-3 px-4 text-center">Quantities / Metric</th>
                            <th className="py-3 px-4 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-150 dark:divide-slate-800 text-xs text-gray-700 dark:text-slate-300">
                          <tr>
                            {/* Description column */}
                            <td className="py-4 px-4 min-w-[190px] whitespace-normal break-words font-medium text-slate-800 dark:text-slate-205">
                              {previewingInvoice.billingMethod === "qty_rate" ? (
                                <div className="space-y-0.5 min-w-0">
                                  <span className="font-extrabold block text-slate-800 dark:text-slate-200">Regular Tier Rate Work Assignment</span>
                                  <span className="text-[10px] text-gray-400 block dark:text-slate-500">Unit-based manual breakdown contract</span>
                                </div>
                              ) : previewingInvoice.billingMethod === "pages" ? (
                                <div className="space-y-0.5 min-w-0">
                                  <span className="font-extrabold block text-slate-800 dark:text-slate-200 font-sans">Corporate Document Page Service Billing</span>
                                  <span className="text-[10px] text-gray-400 block dark:text-slate-500">Tier volume based page computation contract</span>
                                </div>
                              ) : (
                                <div className="space-y-0.5 min-w-0">
                                  <span className="font-extrabold block text-slate-800 dark:text-slate-200">Custom Manual/Flat Specification Plan</span>
                                  <span className="text-[10px] text-indigo-500 block dark:text-indigo-400 font-bold">Standard fixed scope writer fee</span>
                                </div>
                              )}
                            </td>

                            {/* Quantities column */}
                            <td className="py-4 px-4 text-center whitespace-normal break-words font-semibold text-slate-700 dark:text-slate-300">
                              {previewingInvoice.billingMethod === "qty_rate" ? (
                                <span>{previewingInvoice.quantity ?? 20} {previewingInvoice.unitLabel || "Assignments"} × ₹{previewingInvoice.rate ?? 500}</span>
                              ) : previewingInvoice.billingMethod === "pages" ? (
                                <span>{previewingInvoice.pages ?? 10} Pages</span>
                              ) : (
                                <span className="text-gray-400 dark:text-slate-500">1 Unique Contract Set</span>
                              )}
                            </td>

                            {/* Total column */}
                            <td className="py-4 px-4 text-right whitespace-nowrap font-black text-slate-950 dark:text-white text-sm">
                              ₹{Number(previewingInvoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                          
                          {/* Summary aggregates in table footer layout */}
                          {(() => {
                            const pricing = getInvoicePricing(previewingInvoice);
                            return (
                              <>
                                <tr className="border-t border-gray-200 dark:border-slate-850 font-medium">
                                  <td colSpan={2} className="py-2 px-4 text-right text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    Subtotal (Base Value)
                                  </td>
                                  <td className="py-2 px-4 text-right font-bold text-slate-700 dark:text-slate-300">
                                    ₹{pricing.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                                {pricing.discount > 0 && (
                                  <tr className="border-t border-gray-150 dark:border-slate-850 text-emerald-600 dark:text-emerald-400 font-medium">
                                    <td colSpan={2} className="py-2 px-4 text-right text-[10px] uppercase tracking-widest">
                                      Discount Deducted
                                    </td>
                                    <td className="py-2 px-4 text-right font-bold">
                                      - ₹{pricing.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                )}
                                <tr className="border-t border-gray-150 dark:border-slate-850 font-medium">
                                  <td colSpan={2} className="py-2 px-4 text-right text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    Estimated Tax ({pricing.taxPercent}%)
                                  </td>
                                  <td className="py-2 px-4 text-right font-bold text-slate-700 dark:text-slate-300">
                                    ₹{pricing.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                                <tr className="bg-indigo-55/20 dark:bg-indigo-950/10 font-bold border-t-2 border-indigo-100 dark:border-indigo-950">
                                  <td colSpan={2} className="py-3.5 px-4 text-right text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    Grand Total Invoice Amount
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-black text-indigo-900 dark:text-indigo-400 text-sm md:text-base">
                                    ₹{pricing.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment Status & Term Information Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-slate-800/65">
                    <div className="space-y-1.5 p-4 bg-slate-50/50 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-450" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Invoice Billing Terms</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="text-slate-600 dark:text-slate-350 flex justify-between">
                          <span className="font-medium text-gray-400">Post Date:</span>
                          <span className="font-extrabold">{previewingInvoice.billingDate}</span>
                        </p>
                        <p className="text-slate-650 dark:text-slate-350 flex justify-between">
                          <span className="font-medium text-gray-400">Due Date:</span>
                          <span className="font-extrabold text-indigo-650 dark:text-indigo-400">{previewingInvoice.dueDate}</span>
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 p-4 bg-slate-50/50 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-450" />
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Settlement State</span>
                      </div>
                      <div className="text-xs space-y-1 font-sans">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-medium font-sans">Status Flag:</span>
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider font-sans ${
                            previewingInvoice.status === "Paid" ? "bg-emerald-100 text-emerald-800" :
                            previewingInvoice.status === "Overdue" ? "bg-red-100 text-red-800" :
                            "bg-amber-100 text-amber-800"
                          }`}>
                            {previewingInvoice.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 text-right font-medium">
                          {previewingInvoice.status === "Paid" ? "Paid in full" : "Pending clearance check"}
                        </p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Bottom Admin Control Desk (Redesigned with professional cards) */}
                <div className="space-y-3 font-sans">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Administrative actions</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={(e) => handleToggleStatusPaid(previewingInvoice, e)}
                      className="w-full py-3 border border-gray-250 bg-white hover:bg-slate-50 hover:border-gray-300 rounded-xl font-bold text-xs text-gray-700 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
                      <span>{previewingInvoice.status === "Paid" ? "Mark Pending" : "Mark as Paid"}</span>
                    </button>
                    <button
                      onClick={() => handleExportSinglePDF(previewingInvoice)}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-800 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-indigo-400" />
                      <span>Download Receipt</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      onClick={(e) => handleOpenEditModal(previewingInvoice, e)}
                      className="w-full py-2.5 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Modify Invoice</span>
                    </button>
                    <button
                      onClick={(e) => handleDeleteInvoice(previewingInvoice.id, e)}
                      className="w-full py-2.5 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Document</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Elegant Invoice Form Modal (New & Editing both with Live PDF Mockup) */}
      <AnimatePresence>
        {showFormModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-xl border border-gray-100 max-w-lg md:max-w-5xl lg:max-w-6xl w-full overflow-hidden flex flex-col h-[90vh] max-h-[92vh] md:max-h-[90vh] transition-all"
            >
              <div className="p-5 border-b border-gray-150 flex items-center justify-between bg-gradient-to-r from-slate-900 to-indigo-950 text-white shrink-0">
                <h3 className="font-extrabold text-sm md:text-base tracking-tight flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  {editingInvoice ? "Configure Client Invoice Record" : "Draft Fresh Billing Invoice"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Responsive Tabs (Hidden on Desktop) */}
              <div className="flex md:hidden border-b border-gray-150 bg-gray-50/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalTab("form")}
                  className={`flex-1 py-3 text-center text-xs font-black transition-all border-b-2 tracking-wide uppercase ${
                    modalTab === "form"
                      ? "border-indigo-600 text-indigo-600 bg-indigo-50/20"
                      : "border-transparent text-gray-450 hover:text-slate-800"
                  }`}
                >
                  📝 Configuration
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("preview")}
                  className={`flex-1 py-3 text-center text-xs font-black transition-all border-b-2 tracking-wide uppercase ${
                    modalTab === "preview"
                      ? "border-indigo-600 text-indigo-600 bg-indigo-50/20"
                      : "border-transparent text-gray-450 hover:text-slate-800"
                  }`}
                >
                  📄 Live PDF Preview
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-slate-50">
                {/* 1. LEFT COLUMN: CONFIGURATION INPUT PANEL */}
                <div 
                  className={`flex-1 overflow-y-auto p-6 space-y-4 bg-white border-r border-gray-200 ${
                    modalTab === "form" ? "flex flex-col" : "hidden md:flex md:flex-col"
                  }`}
                >
                {/* JOB SELECTION FIELD */}
                {jobs.length > 0 && (
                  <div className="bg-indigo-50/40 dark:bg-slate-900/40 border border-indigo-100/80 dark:border-slate-800 p-4 rounded-2xl space-y-3.5 shadow-2xs antialiased">
                    <div className="space-y-1">
                      <label className="text-[11px] font-extrabold text-indigo-900 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Briefcase className="w-4 h-4 text-indigo-650" />
                        <span>Job Selection Reference</span>
                      </label>
                      <select
                        id="job-selection-dropdown"
                        value={selectedJobId}
                        onChange={(e) => handleJobSelectionChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-indigo-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-800 dark:text-slate-100 font-semibold text-indigo-950"
                      >
                        <option value="">-- Choose system active job reference --</option>
                        {jobs.map((j) => {
                          const isJobBilled = alreadyInvoicedJobIds.has(j.id);
                          const isCurrentEditJob = editingInvoice && editingInvoice.jobId === j.id;
                          const isDisabled = isJobBilled && !isCurrentEditJob;
                          return (
                            <option 
                              key={j.id} 
                              value={j.id} 
                              disabled={isDisabled}
                              className={isDisabled ? "text-slate-400 bg-slate-100 line-through dark:bg-slate-950 dark:text-slate-600" : ""}
                            >
                              {j.clientCode} — {j.jobName || j.jobCode} (₹{(j.wordCount * j.rate).toLocaleString()}) {isJobBilled ? " [ALREADY BILLED]" : ""}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[10px] text-gray-400">Selecting a job automatically fetches and populates its metadata.</p>
                    </div>

                    {selectedJob && (
                      <div className="flex items-center gap-2 pt-1 font-semibold text-xs text-slate-700 dark:text-slate-350 select-none">
                        <input
                          id="use-job-amount-cb"
                          type="checkbox"
                          checked={useJobAmount}
                          onChange={(e) => setUseJobAmount(e.target.checked)}
                          className="w-4.5 h-4.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-slate-900 dark:border-slate-800 cursor-pointer"
                        />
                        <label htmlFor="use-job-amount-cb" className="cursor-pointer">
                          Use Job Amount (₹{resolvedProjectAmount.toLocaleString()})
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* DYNAMIC SUMMARY SECTION */}
                {selectedJob && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl space-y-3.5 shadow-2xs antialiased">
                    <div>
                      <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2 border-b border-dashed border-gray-200 dark:border-slate-800 pb-1.5">
                        <span>Job Information</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block">Job Code</span>
                          <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200">{selectedJob.jobCode || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block">Job Name</span>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedJob.jobName || "Unnamed Job"}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block">Client Name</span>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">
                            {resolvedClient ? resolvedClient.clientName : selectedJob.clientCode}
                          </span>
                          {resolvedClient?.email && (
                            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-bold block mt-1">
                              📧 {resolvedClient.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-250 dark:border-slate-800 pt-3">
                      <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2 border-b border-dashed border-gray-200 dark:border-slate-800 pb-1.5">
                        <span>Billing Information</span>
                      </h4>
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block">Project Amount</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                            ₹{resolvedProjectAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* INVOICE NUMBER */}
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">Invoice Number</label>
                  <input
                    type="text"
                    required
                    value={formInvoiceNumber}
                    onChange={(e) => setFormInvoiceNumber(e.target.value)}
                    placeholder="INV-928139"
                    className="w-full px-3.5 py-2.5 border border-gray-250 bg-gray-50/50 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* COMPANY BRANDING */}
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">Company/Agency Branding Name</label>
                  <input
                    type="text"
                    required
                    value={formCompanyName}
                    onChange={(e) => setFormCompanyName(e.target.value)}
                    placeholder="e.g. Freelance Writing Services"
                    className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Custom agency or brand title visible on printed and shared billing exports.</p>
                </div>

                {/* CLIENT SELECTION */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Client Identifier</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomClient(!isCustomClient)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      {isCustomClient ? "Select from contacts" : "Input custom name"}
                    </button>
                  </div>

                  {isCustomClient ? (
                    <input
                      type="text"
                      required
                      placeholder="e.g. Acme Corporation Inc."
                      value={customClientText}
                      onChange={(e) => setCustomClientText(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-gray-300 font-semibold"
                    />
                  ) : (
                    <select
                      value={formClient}
                      required
                      onChange={(e) => setFormClient(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer bg-white"
                    >
                      <option value="">-- Select Client Code --</option>
                      {clientCodes.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* JOB CODE SELECTION */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Referenced Job Code</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomJobCode(!isCustomJobCode)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      {isCustomJobCode ? "Select system job code" : "Input custom job code"}
                    </button>
                  </div>

                  {isCustomJobCode ? (
                    <input
                      type="text"
                      required
                      placeholder="e.g. ARTICLE-200"
                      value={customJobCodeText}
                      onChange={(e) => setCustomJobCodeText(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-gray-300 font-semibold"
                    />
                  ) : (
                    <select
                      value={formJobCode}
                      required
                      onChange={(e) => setFormJobCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer bg-white"
                    >
                      <option value="">-- Choose Job Code --</option>
                      {Array.from(new Set(jobs.map(j => j.jobCode).filter(Boolean))).map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* AUTOMATIC BILL CALCULATION SECTION */}
                <div className="bg-slate-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                      Billing Mode / Pricing Method
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-gray-200">
                      {(["manual", "qty_rate", "pages"] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setCalcMethod(method)}
                          className={`py-2 text-xs font-bold rounded-lg transition-all ${
                            calcMethod === method
                              ? "bg-slate-900 text-white shadow-xs"
                              : "text-gray-500 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          {method === "manual" ? "✏️ Manual" : method === "qty_rate" ? "🔢 Qty × Rate" : "📄 Pages"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {calcMethod === "qty_rate" && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-3 gap-3"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Quantity</label>
                        <input
                          type="number"
                          min="0"
                          required={calcMethod === "qty_rate"}
                          value={calcQuantity}
                          onChange={(e) => setCalcQuantity(e.target.value === "" ? "" as any : Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                          placeholder="e.g. 20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required={calcMethod === "qty_rate"}
                          value={calcRate}
                          onChange={(e) => setCalcRate(e.target.value === "" ? "" as any : Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                          placeholder="e.g. 500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Unit Label</label>
                        <input
                          type="text"
                          value={calcUnitName}
                          onChange={(e) => setCalcUnitName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                          placeholder="e.g. Assignments"
                        />
                      </div>
                    </motion.div>
                  )}

                  {calcMethod === "pages" && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Number of Pages</label>
                        <input
                          type="number"
                          min="0"
                          required={calcMethod === "pages"}
                          value={calcPages}
                          onChange={(e) => setCalcPages(e.target.value === "" ? "" as any : Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none"
                          placeholder="e.g. 15"
                        />
                      </div>

                      {/* Page rates guide */}
                      <div className="bg-white border border-gray-200 rounded-xl p-3 text-[11px] space-y-1 text-gray-600 animate-fade-in">
                        <span className="font-extrabold text-[10px] text-gray-400 uppercase tracking-wider block mb-1">
                          Standard Page-based Rates Card
                        </span>
                        <div className="flex justify-between border-b border-gray-100 pb-1">
                          <span>📄 1 - 10 pages</span>
                          <span className="font-bold text-slate-800">₹1,000 flat</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 py-1">
                          <span>📘 11 - 20 pages</span>
                          <span className="font-bold text-slate-800">₹1,800 flat</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 py-1">
                          <span>📙 21 - 30 pages</span>
                          <span className="font-bold text-slate-800">₹2,500 flat</span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span>📑 Additional pages (&gt;30)</span>
                          <span className="font-bold text-slate-800">₹2,500 + ₹80 per extra page</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* CALCULATION BREAKDOWN PANEL */}
                  {calcMethod !== "manual" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5 text-indigo-800 font-extrabold text-[10px] uppercase tracking-wider">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Calculation Breakdown</span>
                      </div>
                      
                      <div className="text-gray-750 leading-relaxed font-semibold">
                        {calcMethod === "qty_rate" ? (
                          <div className="space-y-1 text-slate-700">
                            <div>
                              Mode: <span className="font-bold text-indigo-900">Quantity × Rate pricing</span>
                            </div>
                            <div className="font-mono text-[11px] bg-white/60 p-1.5 rounded border border-indigo-100 leading-snug">
                              Formula: {calcQuantity || 0} {calcUnitName} × ₹{(calcRate || 0).toLocaleString()} = ₹{((calcQuantity || 0) * (calcRate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1 text-slate-700">
                            <div>
                              Mode: <span className="font-bold text-indigo-900">Page-based tier pricing</span>
                            </div>
                            <div className="font-mono text-[11px] bg-white/60 p-1.5 rounded border border-indigo-100 leading-snug">
                              Formula: {pagePricingBreakdown.breakdown}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* AMOUNT FIELD */}
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">
                    {calcMethod !== "manual" ? "Auto-Calculated Amount (INR)" : "Billing Amount (INR)"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-extrabold text-gray-400">₹</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      placeholder="4500"
                      disabled={calcMethod !== "manual" || (!!selectedJob && useJobAmount)}
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value === "" ? "" : Number(e.target.value))}
                      className={`w-full pl-8 pr-4 py-2.5 border rounded-xl text-sm font-extrabold focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${
                        (calcMethod !== "manual" || (!!selectedJob && useJobAmount))
                          ? "bg-gray-100 border-gray-200 text-slate-700 cursor-not-allowed"
                          : "border-gray-250 bg-white"
                      }`}
                    />
                  </div>
                  {useJobAmount && selectedJob && (
                    <span className="text-[10px] text-indigo-650 font-bold block mt-1">
                      💡 Amount locked to Job Project Amount. Uncheck the "Use Job Amount" box to modify manually.
                    </span>
                  )}
                  {calcMethod !== "manual" && !useJobAmount && (
                    <span className="text-[10px] text-indigo-650 font-bold block mt-1">
                      💡 Amount locked. Change pricing mode above to alter the total bill.
                    </span>
                  )}
                </div>

                {/* TAX AND DISCOUNT FIELDS */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">
                      Tax Percentage (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        placeholder="0 (Tax free)"
                        value={formTaxPercentage}
                        onChange={(e) => setFormTaxPercentage(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-250 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 font-mono">%</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">
                      Discount Amount (INR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0 (No discount)"
                        value={formDiscountAmount}
                        onChange={(e) => setFormDiscountAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-2.5 bg-white border border-gray-250 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* DATES ROW */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">Billing Date</label>
                    <input
                      type="date"
                      required
                      value={formBillingDate}
                      onChange={(e) => setFormBillingDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">Due Date</label>
                    <input
                      type="date"
                      required
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-250 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* INVOICE STATUS */}
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">Remittance Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Pending", "Paid", "Overdue"].map((st) => {
                      const isActive = formStatus === st;
                      const activeColor = st === "Paid" 
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                        : st === "Overdue" 
                          ? "bg-red-50 border-red-500 text-red-700" 
                          : "bg-amber-50 border-amber-500 text-amber-700";

                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setFormStatus(st as any)}
                          className={`py-3 border rounded-xl text-xs font-bold text-center transition-all ${
                            isActive 
                              ? `${activeColor} border-2 scale-[1.02] shadow-xs` 
                              : "border-gray-200 bg-white text-gray-500 hover:bg-slate-50"
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>

                  {/* MODAL ACTION ROW inside Form Panel */}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-150 mt-4 shrink-0 bg-white">
                    <button
                      type="button"
                      onClick={() => setModalTab("preview")}
                      className="md:hidden px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 rounded-xl font-extrabold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Preview Invoice</span>
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                    </button>
                    <div className="flex gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setShowFormModal(false)}
                        className="px-4 py-2 border border-gray-250 text-gray-500 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-indigo-650 hover:bg-indigo-600 text-white font-black text-xs rounded-xl transition-all shadow-xs cursor-pointer"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Saving..." : "Register Invoice"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. RIGHT COLUMN: LIVE RECTANGULAR A4 PREVIEW WORKSPACE */}
                <div 
                  className={`flex-1 overflow-y-auto p-4 md:p-6 bg-slate-150 flex flex-col space-y-4 ${
                    modalTab === "preview" ? "flex" : "hidden md:flex md:flex-col"
                  }`}
                >
                  {/* Real-time Indicator Header bar */}
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-2xs shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
                      <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
                        Live A4 PDF Mockup
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const liveInvoiceObj: any = {
                            id: editingInvoice?.id || "draft-temp-id",
                            invoiceNumber: formInvoiceNumber || "DRAFT-0000",
                            companyName: formCompanyName,
                            client: isCustomClient ? customClientText : formClient,
                            jobCode: isCustomJobCode ? customJobCodeText : formJobCode,
                            billingMethod: calcMethod,
                            quantity: calcMethod === "qty_rate" ? (calcQuantity || 20) : undefined,
                            rate: calcMethod === "qty_rate" ? (calcRate || 500) : undefined,
                            unitLabel: calcMethod === "qty_rate" ? calcUnitName : undefined,
                            pages: calcMethod === "pages" ? (calcPages || 10) : undefined,
                            amount: Number(formAmount) || 0,
                            billingDate: formBillingDate,
                            dueDate: formDueDate,
                            status: formStatus,
                          };
                          handleExportSinglePDF(liveInvoiceObj);
                        }}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10.5px] rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer leading-none"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* VIRTUAL A4 SHEET COMPACT REPRESENTATION */}
                  <div className="flex-grow flex items-center justify-center py-1">
                    {(() => {
                      // Lookup Client info in real-time
                      const previewClient = registeredClients.find(
                        (c) =>
                          (isCustomClient && customClientText && c.clientName && c.clientName.toUpperCase().trim() === customClientText.toUpperCase().trim()) ||
                          (!isCustomClient && formClient && c.clientCode && c.clientCode.toUpperCase().trim() === formClient.toUpperCase().trim()) ||
                          (!isCustomClient && formClient && c.clientName && c.clientName.toUpperCase().trim() === formClient.toUpperCase().trim())
                      ) || null;

                      // Lookup Job info in real-time
                      const previewJob = jobs.find(
                        (j) =>
                          (selectedJobId && j.id === selectedJobId) ||
                          (isCustomJobCode && customJobCodeText && j.jobCode && j.jobCode.toUpperCase().trim() === customJobCodeText.toUpperCase().trim()) ||
                          (!isCustomJobCode && formJobCode && j.jobCode && j.jobCode.toUpperCase().trim() === formJobCode.toUpperCase().trim())
                      ) || null;

                      // Pricing strings helper
                      const getMockPagePricing = (pCount: number) => {
                        if (pCount <= 0) return { total: 0, breakdown: "0 pages specified" };
                        if (pCount <= 10) return { total: 1000, breakdown: "1-10 Pages flat rate" };
                        if (pCount <= 20) return { total: 1800, breakdown: "11-20 Pages flat rate" };
                        if (pCount <= 30) return { total: 2500, breakdown: "21-30 Pages flat rate" };
                        const extra = pCount - 30;
                        const extraAmount = extra * 80;
                        const total = 2500 + extraAmount;
                        return {
                          total,
                          breakdown: `21-30 Pages base (₹2,500) + ${extra} extra pages × ₹80`
                        };
                      };

                      // Calculations draft representation
                      const baseAmtVal = Number(formAmount) || 0;
                      const draftPricing = getDraftInvoicePricing(baseAmtVal, formDiscountAmount, formTaxPercentage);
                      
                      const totalAmt = draftPricing.grandTotal;
                      const subtotalBaseVal = draftPricing.subtotal;
                      const discountAmtVal = draftPricing.discount;
                      const taxVal = draftPricing.taxAmount;
                      const taxPercentageVal = draftPricing.taxPercent;

                      // Dynamic Table fields
                      let tableLineName = "Corporate Flat Scope Editorial Assignment Fee";
                      let tableLineSubStr = "Deliverable written assignment and editing matching original directives.";
                      let tableLineMetric = "Manual Flat Scale";

                      if (calcMethod === "qty_rate") {
                        tableLineName = "Professional Content Writing Service Plan";
                        tableLineSubStr = "High-standard service execution of content assets.";
                        tableLineMetric = `${calcQuantity || 0} ${calcUnitName} @ ₹${(calcRate || 0).toLocaleString()}/ea`;
                      } else if (calcMethod === "pages") {
                        tableLineName = "Premium Document Page-Based Tier Operations";
                        tableLineSubStr = getMockPagePricing(calcPages || 10).breakdown;
                        tableLineMetric = `${calcPages || 0} Pages (Volume Rate)`;
                      }

                      // Date format strings mockup
                      const mockBillDate = formBillingDate ? format(new Date(formBillingDate), "MMM dd, yyyy") : format(new Date(), "MMM dd, yyyy");
                      const mockDueDate = formDueDate ? format(new Date(formDueDate), "MMM dd, yyyy") : format(new Date(), "MMM dd, yyyy");

                      // Badge styles
                      const isStatusPaid = formStatus === "Paid";
                      const isStatusOverdue = formStatus === "Overdue";
                      const statusColStyle = isStatusPaid 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                        : isStatusOverdue 
                          ? "bg-red-50 text-red-700 border-red-100" 
                          : "bg-amber-50 text-amber-700 border-amber-100";

                      return (
                        <div className="bg-white border border-gray-300 shadow-md p-5 rounded-lg text-slate-800 font-sans w-full max-w-[440px] aspect-[1/1.414] text-[9.5px] leading-relaxed flex flex-col justify-between select-none">
                          
                          {/* A. Letterhead Block */}
                          <div>
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex items-start gap-2">
                                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-extrabold text-[12px] shrink-0">
                                  A
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-[11px] font-black text-slate-900 tracking-tight leading-none mb-1 truncate max-w-[150px]">
                                    {formCompanyName || user.displayName || "Freelance Writing Services"}
                                  </h4>
                                  <p className="text-[7.5px] text-gray-500 font-extrabold uppercase tracking-wide">AssignoPedia Creative Headquarters</p>
                                  <p className="text-[7.5px] text-gray-400 truncate max-w-[150px]">Contact: {user.email || "freelance@workflow.com"}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <h3 className="text-xs font-black text-indigo-650 tracking-tight leading-none mb-1">INVOICE</h3>
                                <p className="text-[8.5px] font-mono font-bold text-slate-600">{formInvoiceNumber || "INV-0000"}</p>
                                <p className="text-[8px] text-gray-400 mt-0.5">Date: {mockBillDate}</p>
                              </div>
                            </div>

                            {/* Divider line */}
                            <div className="border-b border-gray-150 my-2.5"></div>

                            {/* B. Settlement Bar */}
                            <div className="bg-slate-50 border border-slate-150 py-1.5 px-2.5 rounded-lg flex justify-between items-center text-[8px] font-bold mb-2">
                              <span className="text-gray-400 font-black tracking-widest uppercase text-[7.5px]">SETTLEMENT STATE INDICATOR</span>
                              <span className={`px-2 py-0.5 rounded font-black text-[7.5px] tracking-wide uppercase border ${statusColStyle}`}>
                                {formStatus.toUpperCase()}
                              </span>
                            </div>

                            {/* C. Split-Column Details Block */}
                            <div className="grid grid-cols-2 gap-3 mb-2">
                              {/* Client Info Card */}
                              <div className="border border-slate-150 rounded-lg p-2.5 flex flex-col justify-between min-h-[55px] bg-white">
                                <div>
                                  <span className="text-[7px] font-black text-gray-400 block tracking-widest uppercase mb-0.5">BILL TO (CLIENT):</span>
                                  <span className="text-[9.5px] font-black text-slate-900 block truncate max-w-[150px]">
                                    {isCustomClient ? customClientText : (formClient || "Unspecified Client")}
                                  </span>
                                </div>
                                <div className="text-[8px] text-gray-500 space-y-0.5 mt-1 leading-none font-semibold">
                                  <p className="truncate max-w-[150px]">Email: {previewClient?.email || "N/A"}</p>
                                  <p className="truncate max-w-[150px]">Phone: {previewClient?.phone || "N/A"}</p>
                                </div>
                              </div>
                              {/* Invoice Terms Card */}
                              <div className="border border-slate-150 rounded-lg p-2.5 flex flex-col justify-between min-h-[55px] bg-white">
                                <div>
                                  <span className="text-[7px] font-black text-gray-400 block tracking-widest uppercase mb-0.5">INVOICE TERMS:</span>
                                  <div className="grid grid-cols-2 gap-y-0.5 text-[8px] leading-tight font-semibold">
                                    <span className="text-gray-400">Issue Date:</span>
                                    <span className="text-right text-slate-800">{mockBillDate}</span>
                                    
                                    <span className="text-gray-450">Due Date:</span>
                                    <span className={`text-right font-bold ${isStatusOverdue ? "text-red-650" : formStatus === "Pending" ? "text-amber-650" : "text-slate-850"}`}>
                                      {mockDueDate}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center text-[7px] pt-1 border-t border-dashed border-gray-100">
                                  <span className="text-gray-450 uppercase">Client Token:</span>
                                  <span className="font-mono font-bold text-slate-500 bg-slate-50 px-1 rounded uppercase">ST-{(editingInvoice?.id || "DRAFT").slice(0, 8)}</span>
                                </div>
                              </div>
                            </div>

                            {/* D. Job Reference Card */}
                            <div className="bg-slate-50 border border-slate-150 rounded-lg p-2 mb-2">
                              <span className="text-[7px] font-black text-gray-400 block tracking-widest uppercase mb-1">ASSOCIATED CONTRACT RECORD:</span>
                              <div className="flex justify-between items-start gap-4">
                                <div>
                                  <span className="text-[9.5px] font-black text-slate-900 leading-tight block truncate max-w-[200px]">
                                    {previewJob ? (previewJob.jobName || "Content Writing Task Assignment") : "Registered Service Contract Assignment"}
                                  </span>
                                  <span className="inline-block mt-1 font-mono font-bold text-[7.5px] text-indigo-650 bg-indigo-50 px-1 rounded">
                                    Code: {isCustomJobCode ? customJobCodeText : (formJobCode || "N/A")}
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[8px] text-gray-450 block font-bold">
                                    {previewJob?.deadline ? `Due: ${previewJob.deadline}` : "No deadline"}
                                  </span>
                                  <span className="inline-block mt-1 text-[8.5px] font-black text-slate-700 bg-slate-100/80 px-1 rounded">
                                    {previewJob ? `${previewJob.wordCount.toLocaleString()} words @ ₹${previewJob.rate}/wd` : "Manual Rating Style"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* E. Billing Items Table */}
                            <div className="mb-2">
                              {/* Header row */}
                              <div className="grid grid-cols-12 bg-slate-900 text-white rounded-t-lg py-1 px-2.5 text-[7px] font-black uppercase tracking-wider">
                                <div className="col-span-7">LINE DESCRIPTION</div>
                                <div className="col-span-3 text-center">METRIC</div>
                                <div className="col-span-2 text-right">AMOUNT (INR)</div>
                              </div>
                              {/* Item row */}
                              <div className="grid grid-cols-12 border-x border-b border-gray-200 py-2 px-2.5 bg-white text-[8px] rounded-b-lg">
                                <div className="col-span-7 pr-3">
                                  <span className="font-extrabold text-slate-900 block leading-tight">{tableLineName}</span>
                                  <span className="text-[7.5px] text-gray-450 mt-0.5 block leading-normal">{tableLineSubStr}</span>
                                </div>
                                <div className="col-span-3 flex items-center justify-center font-bold text-slate-500 text-center leading-none">
                                  {tableLineMetric}
                                </div>
                                <div className="col-span-2 flex items-center justify-end font-extrabold text-slate-950 text-right">
                                  ₹{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                            </div>

                             {/* F. Summary math panel */}
                             <div className="flex flex-col items-end space-y-0.5 text-[8px] mb-2">
                               <div className="flex justify-between w-full max-w-[170px] text-gray-400 font-semibold">
                                 <span>Subtotal (Base Value):</span>
                                 <span className="font-mono text-slate-600">₹{subtotalBaseVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                               </div>
                               {discountAmtVal > 0 && (
                                 <div className="flex justify-between w-full max-w-[170px] text-emerald-650 font-semibold">
                                   <span>Discount Deducted:</span>
                                   <span className="font-mono">- ₹{discountAmtVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                 </div>
                               )}
                               <div className="flex justify-between w-full max-w-[170px] text-gray-400 pb-1 border-b border-slate-100 font-semibold">
                                 <span>Estimated Tax ({taxPercentageVal}%):</span>
                                 <span className="font-mono text-slate-600">₹{taxVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                               </div>
                               <div className="flex justify-between w-full max-w-[170px] bg-slate-50 rounded px-1.5 py-1 mt-0.5 border border-slate-200">
                                 <span className="font-black text-slate-900">Grand Total Amount:</span>
                                 <span className="font-mono font-black text-indigo-650">₹{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                               </div>
                             </div>

                            {/* G. Directions panel */}
                            <div className="bg-slate-50 border border-slate-150 rounded-lg p-2 text-[7.5px] leading-relaxed text-gray-500">
                              <span className="font-extrabold text-slate-700 block tracking-wide uppercase mb-0.5">REMITTANCE INSTRUCTIONS:</span>
                              <p>1. Please clear the complete total of ₹{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })} on/before {mockDueDate}.</p>
                              <p className="mt-0.5 font-semibold">2. Kindly quote reference: "{formInvoiceNumber || "INV-0000"}" in remarks.</p>
                            </div>
                          </div>

                          {/* H. Mock Footer */}
                          <div className="mt-auto border-t border-slate-150 pt-1 flex justify-between items-center text-[6.5px] font-bold text-gray-400 tracking-wide uppercase">
                            <span>Generated by AssignoPedia Services</span>
                            <span>Page 1 of 1</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* FOOTER ACTIONS FOR PREVIEW */}
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 shrink-0 mt-auto bg-slate-150">
                    <button
                      type="button"
                      onClick={() => setModalTab("form")}
                      className="md:hidden px-4 py-2 text-slate-700 hover:bg-slate-200 bg-slate-200 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                    >
                      ← Back to Config
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl transition-all shadow-md ml-auto hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : "Save & Close"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
