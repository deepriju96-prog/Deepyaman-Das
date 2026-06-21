import React, { useState, useMemo, useEffect } from "react";
import { jsPDF } from "jspdf";
import { 
  getCachedAccessToken, 
  connectGoogleDrive, 
  uploadFileToDrive, 
  deleteDriveFile, 
  ensureAppFolder, 
  findFolder, 
  createDriveFolder 
} from "../lib/googleDriveService";
import { 
  X, 
  Calendar, 
  DollarSign, 
  FileText, 
  ListTodo, 
  PenTool, 
  CheckCircle, 
  ClipboardCheck, 
  History, 
  UserPlus, 
  UserCheck, 
  Mail, 
  ShieldCheck, 
  FileCheck2, 
  Plus, 
  ArrowRight, 
  Info, 
  Eye, 
  PlusCircle,
  Download,
  Paperclip,
  Upload,
  Trash2,
  FolderOpen,
  RefreshCw,
  MessageSquare,
  Send,
  Sliders,
  Settings,
  HardDrive
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  serverTimestamp, 
  Timestamp,
  setDoc,
  onSnapshot
} from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { db, auth, OperationType, handleFirestoreError } from "../firebase";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";

interface TeamMember {
  id: string;
  name: string;
  role: "Writer" | "Editor" | "Quality Checker";
  email: string;
  userId: string;
  createdAt: any;
}

interface AssignmentLog {
  id: string;
  jobId: string;
  jobCode: string;
  role: "Writer" | "Editor" | "Quality Checker";
  previousAssigneeName: string;
  newAssigneeName: string;
  userId: string;
  createdAt: any;
}

interface Revision {
  id: string;
  jobId: string;
  revisionNumber: number;
  requestedDate: string;
  requestedBy: string;
  revisionNotes: string;
  completionDate?: string | null;
  status: "Pending" | "In Progress" | "Completed" | string;
  userId: string;
  createdAt: any;
  createdAtParsed: Date;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
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
  internalDeadline?: string;
  clientDeadline?: string;
  notes?: string;
  status: string;
  userId: string;
  createdAt: any;
  useChecklist?: boolean;
  checklist?: ChecklistItem[];
  assignedWriterId?: string | null;
  assignedWriterName?: string | null;
  assignedEditorId?: string | null;
  assignedEditorName?: string | null;
  assignedQCId?: string | null;
  assignedQCName?: string | null;
  revenue?: number;
  writerCost?: number;
  editorCost?: number;
  qcCost?: number;
  otherExpenses?: number;
  revisionCount?: number;
  completedAt?: string | null;
}

interface CategoryFolderProps {
  key?: string;
  categoryName: string;
  files: any[];
  onPreview: (file: any) => void;
  onDelete: (id: string, name: string) => void;
  getLogTimestamp: (createdAt: any) => string;
}

function CategoryFolder({ categoryName, files, onPreview, onDelete, getLogTimestamp }: CategoryFolderProps) {
  const [isOpen, setIsOpen] = useState(files.length > 0);

  // Auto-expand folder when new files are added
  useEffect(() => {
    if (files.length > 0) {
      setIsOpen(true);
    }
  }, [files.length]);

  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden font-sans bg-white dark:bg-slate-950/10">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-950/80 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <FolderOpen className={`w-3.5 h-3.5 ${files.length > 0 ? 'text-indigo-500' : 'text-slate-400'}`} />
          <span>{categoryName}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded-md font-mono">
            {files.length}
          </span>
        </div>
        <span className="text-gray-400 text-[9px]">
          {isOpen ? "Collapse" : "Expand"}
        </span>
      </button>

      {isOpen && (
        <div className="p-2 space-y-1.5 border-t border-slate-100 dark:border-slate-850 bg-white/50 dark:bg-slate-950/5 animate-fade-in">
          {files.length === 0 ? (
            <p className="text-[9px] text-gray-400 italic text-center py-2.5">No files in this folder</p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div 
                  key={file.id} 
                  className="p-2 bg-slate-50/50 dark:bg-slate-950/20 border border-gray-100/80 dark:border-slate-800/60 rounded-xl flex items-center justify-between gap-3 hover:border-indigo-100 dark:hover:border-slate-700 transition text-[10px]"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate pr-1" title={file.fileName}>
                        {file.fileName}
                      </p>
                      {file.driveFileId && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-150/40 rounded-md font-sans hover:scale-105 shrink-0 select-none">
                          <HardDrive className="w-2.5 h-2.5 text-indigo-500" />
                          <span>DRIVE</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8px] text-gray-450 dark:text-slate-500">
                      <span className="font-mono">{(file.fileSize / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span className="text-indigo-650 dark:text-indigo-455 font-bold truncate max-w-[80px]">By {file.uploadedBy}</span>
                      <span>•</span>
                      <span>{getLogTimestamp(file.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {file.driveFileId ? (
                      <a
                        href={file.fileData}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg transition"
                        title="Open in Google Drive"
                      >
                        <Eye className="w-3 h-3 text-indigo-500" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPreview(file)}
                        className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg transition"
                        title="Preview File"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                    )}
                    <a
                      href={file.fileData}
                      download={file.fileName}
                      target={file.driveFileId ? "_blank" : undefined}
                      rel={file.driveFileId ? "noopener noreferrer" : undefined}
                      className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg transition"
                      title={file.driveFileId ? "Open in Google Drive" : "Download File"}
                    >
                      <Download className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onDelete(file.id, file.fileName)}
                      className="p-1 text-slate-400 hover:text-rose-600 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg transition"
                      title="Delete File"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const getDLStatusForDetails = (deadlineStr?: string, status?: string) => {
  if (!deadlineStr) return null;
  if (status === "Completed") {
    return {
      label: "Completed",
      bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100",
    };
  }
  const deadlineDate = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    return {
      label: "Overdue",
      bg: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-450 border border-rose-100",
    };
  } else if (diffHours <= 48) {
    return {
      label: "Due within 48 Hours",
      bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-550 border border-amber-100",
    };
  } else {
    return {
      label: "On Track",
      bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-450 border border-emerald-100",
    };
  }
};

interface JobDetailsModalProps {
  job: Job;
  onClose: () => void;
  onGenerateInvoice?: (jobId: string) => void;
  onViewInvoice?: (invoiceId: string) => void;
}

export default function JobDetailsModal({ job, onClose, onGenerateInvoice, onViewInvoice }: JobDetailsModalProps) {
  const user = auth.currentUser;

  // Custom inline PDF builder
  const handleDownloadInvoicePDF = (inv: any) => {
    try {
      const docPDF = new jsPDF("p", "mm", "a4");
      
      const base = Number(inv.amount) || 0;
      const taxPercentage = Number(inv.taxPercentage) || 0;
      const discountAmount = Number(inv.discountAmount) || 0;
      const net = base - discountAmount;
      const taxAmount = (net * taxPercentage) / 100;
      const grandTotal = Math.round((net + taxAmount) * 100) / 100;

      // Dark Indigo header background
      docPDF.setFillColor(15, 23, 42); // slate-900 style
      docPDF.rect(0, 0, 210, 42, "F");

      // Badge accent
      docPDF.setFillColor(99, 102, 241); // indigo-500
      docPDF.rect(20, 12, 10, 10, "F");

      // Title
      docPDF.setTextColor(255, 255, 255);
      docPDF.setFont("Helvetica", "bold");
      docPDF.setFontSize(22);
      docPDF.text("INVOICE", 36, 20);

      docPDF.setFont("Helvetica", "normal");
      docPDF.setFontSize(9);
      docPDF.setTextColor(191, 219, 254); // blue-200
      docPDF.text(`Invoice Ref: ${inv.invoiceNumber}`, 36, 27);

      // Date information
      docPDF.setTextColor(255, 255, 255);
      const issueDate = inv.billingDate ? format(new Date(inv.billingDate), "MMM dd, yyyy") : format(new Date(), "MMM dd, yyyy");
      const dueDate = inv.dueDate ? format(new Date(inv.dueDate), "MMM dd, yyyy") : format(new Date(), "MMM dd, yyyy");
      docPDF.text(`Billed: ${issueDate}`, 190, 18, { align: "right" });
      docPDF.text(`Due: ${dueDate}`, 190, 25, { align: "right" });
      
      // Status badge in PDF
      docPDF.setFont("Helvetica", "bold");
      docPDF.text(`Status: ${inv.status.toUpperCase()}`, 190, 32, { align: "right" });

      // Client Box
      docPDF.setTextColor(30, 41, 59); // slate-800
      docPDF.setFont("Helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.text("Bill To Client:", 20, 60);
      docPDF.setFont("Helvetica", "normal");
      docPDF.setFontSize(11);
      docPDF.text(inv.client || "Unspecified Client", 20, 68);

      // Job Box
      docPDF.setFont("Helvetica", "bold");
      docPDF.text("Contract / Job Reference:", 20, 84);
      docPDF.setFont("Helvetica", "normal");
      docPDF.text(inv.jobCode || "None Linked", 20, 92);

      // Main product grid
      docPDF.setDrawColor(226, 232, 240); // slate-200
      docPDF.setLineWidth(0.4);
      docPDF.line(20, 106, 190, 106);

      // Table Header
      docPDF.setFont("Helvetica", "bold");
      docPDF.setFontSize(9.5);
      docPDF.setTextColor(100, 116, 139); // slate-500
      docPDF.text("Description of Content Services Delivered", 22, 113);
      docPDF.text("Line Total (₹)", 188, 113, { align: "right" });
      docPDF.line(20, 117, 190, 117);

      // Product Row
      docPDF.setTextColor(30, 41, 59);
      docPDF.setFont("Helvetica", "normal");
      docPDF.setFontSize(10.5);
      docPDF.text(`Professional Write-Up and Review services [${inv.jobCode || 'N/A'}]`, 22, 127);
      docPDF.text(`₹${base.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 188, 127, { align: "right" });
      docPDF.line(20, 134, 190, 134);

      // Sum block
      let yMark = 145;
      docPDF.setFontSize(9.5);
      docPDF.setTextColor(71, 85, 105); // slate-600

      // Subtotal
      docPDF.text("Billing Subtotal:", 120, yMark);
      docPDF.text(`₹${base.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 188, yMark, { align: "right" });
      yMark += 8;

      if (discountAmount > 0) {
        docPDF.text("Discount Deducted:", 120, yMark);
        docPDF.text(`- ₹${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 188, yMark, { align: "right" });
        yMark += 8;
      }

      if (taxPercentage > 0) {
        docPDF.text(`Tax Applied (${taxPercentage}%):`, 120, yMark);
        docPDF.text(`+ ₹${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 188, yMark, { align: "right" });
        yMark += 8;
      }

      docPDF.line(116, yMark - 4, 190, yMark - 4);

      // Grand Total
      docPDF.setFont("Helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.setTextColor(79, 70, 229); // Indigo
      docPDF.text("Grand Settlement Total:", 116, yMark + 2);
      docPDF.text(`₹${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 188, yMark + 2, { align: "right" });

      // Footer
      docPDF.setDrawColor(241, 245, 249);
      docPDF.line(20, 262, 190, 262);
      docPDF.setFont("Helvetica", "normal");
      docPDF.setFontSize(8);
      docPDF.setTextColor(148, 163, 184);
      docPDF.text("Produced automatically and encrypted with AssignoPedia Billing Desk.", 105, 270, { align: "center" });

      docPDF.save(`${inv.invoiceNumber}_invoice.pdf`);
    } catch (e) {
      console.error(e);
      alert("An error occurred whilst compiling the document PDF.");
    }
  };
  
  // State for adding a new teammate inline
  const [showAddTeammate, setShowAddTeammate] = useState(false);
  const [selectedRoleForAdd, setSelectedRoleForAdd] = useState<"Writer" | "Editor" | "Quality Checker">("Writer");
  const [newTeammateName, setNewTeammateName] = useState("");
  const [newTeammateEmail, setNewTeammateEmail] = useState("");
  const [newTeammatePhone, setNewTeammatePhone] = useState("");
  const [isSavingTeammate, setIsSavingTeammate] = useState(false);

  // States for drop-downs
  const [activeSelectRole, setActiveSelectRole] = useState<string | null>(null);

  // States for Editing Financials
  const [isEditingFinancials, setIsEditingFinancials] = useState(false);
  const [editRevenue, setEditRevenue] = useState("");
  const [editWriterCost, setEditWriterCost] = useState("");
  const [editEditorCost, setEditEditorCost] = useState("");
  const [editQcCost, setEditQcCost] = useState("");
  const [editOtherExpenses, setEditOtherExpenses] = useState("");

  useEffect(() => {
    if (job) {
      setEditRevenue((job.revenue !== undefined ? job.revenue : ((job.wordCount || 0) * (job.rate || 0))).toString());
      setEditWriterCost((job.writerCost || 0).toString());
      setEditEditorCost((job.editorCost || 0).toString());
      setEditQcCost((job.qcCost || 0).toString());
      setEditOtherExpenses((job.otherExpenses || 0).toString());
    }
  }, [job]);

  const handleSaveFinancials = async () => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, "jobs", job.id), {
        revenue: Number(editRevenue) || 0,
        writerCost: Number(editWriterCost) || 0,
        editorCost: Number(editEditorCost) || 0,
        qcCost: Number(editQcCost) || 0,
        otherExpenses: Number(editOtherExpenses) || 0,
      });

      // Track Activity
      try {
        await addDoc(collection(db, "job_activities"), {
          jobId: job.id,
          action: "Job Financials Updated",
          userName: user.displayName || user.email?.split('@')[0] || "User",
          userEmail: user.email || "unknown@system.local",
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      } catch (actErr) {
        console.error("Failed to automatically record financials timeline activity:", actErr);
      }

      setIsEditingFinancials(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${job.id}/financials`);
    }
  };

  // Real-time query to fetch team members
  const teamQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "team_members"),
      where("userId", "==", user.uid)
    );
  }, [user?.uid]);

  const [teamSnapshot, teamLoading] = useCollection(teamQuery);

  const teamMembers = useMemo(() => {
    return teamSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    })) as TeamMember[] || [];
  }, [teamSnapshot]);

  // Real-time query to fetch assignment history logs
  const logsQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "assignment_logs"),
      where("jobId", "==", job.id),
      orderBy("createdAt", "desc")
    );
  }, [user?.uid, job.id]);

  const [logsSnapshot] = useCollection(logsQuery);

  const logs = useMemo(() => {
    return logsSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    })) as AssignmentLog[] || [];
  }, [logsSnapshot]);

  // Real-time query to fetch job activities
  const activitiesQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "job_activities"),
      where("jobId", "==", job.id)
    );
  }, [user?.uid, job.id]);

  const [activitiesSnapshot] = useCollection(activitiesQuery);

  const activities = useMemo(() => {
    return activitiesSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    })) || [];
  }, [activitiesSnapshot]);

  const chronologicalActivities = useMemo(() => {
    return [...activities].sort((a: any, b: any) => {
      const timeA = a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeA - timeB; // Chronological order (oldest first)
    });
  }, [activities]);

  // Real-time query to fetch files repository
  const filesQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "job_files"),
      where("jobId", "==", job.id)
    );
  }, [user?.uid, job.id]);

  const [filesSnapshot] = useCollection(filesQuery);

  const jobFiles = useMemo(() => {
    return filesSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    })) || [];
  }, [filesSnapshot]);

  // Real-time query to fetch communications logs for this job
  const commsQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "communications"),
      where("jobId", "==", job.id),
      orderBy("createdAt", "desc")
    );
  }, [user?.uid, job.id]);

  const [commsSnapshot] = useCollection(commsQuery);

  const communications = useMemo(() => {
    return commsSnapshot?.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        createdAtParsed: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : (d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : new Date())
      };
    }) || [];
  }, [commsSnapshot]);

  // Real-time query to fetch revisions for this job
  const revisionsQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "revisions"),
      where("jobId", "==", job.id)
    );
  }, [user?.uid, job.id]);

  const [revisionsSnapshot] = useCollection(revisionsQuery);

  const revisionsList = useMemo(() => {
    const list = revisionsSnapshot?.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        createdAtParsed: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : (d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : new Date())
      } as any;
    }) || [];
    return list.sort((a, b) => (b.revisionNumber || 0) - (a.revisionNumber || 0)) as Revision[];
  }, [revisionsSnapshot]);

  // Real-time query to fetch the client detail matching clientCode
  const clientQuery = useMemo(() => {
    if (!user?.uid || !job.clientCode) return null;
    return query(
      collection(db, "clients"),
      where("userId", "==", user.uid),
      where("clientCode", "==", job.clientCode)
    );
  }, [user?.uid, job.clientCode]);

  const [clientSnapshot] = useCollection(clientQuery);

  const matchedClient = useMemo(() => {
    if (!clientSnapshot || clientSnapshot.empty) return null;
    const d = clientSnapshot.docs[0];
    return { id: d.id, ...d.data() } as any;
  }, [clientSnapshot]);

  // WhatsApp states & templates
  const [clientTemplate, setClientTemplate] = useState("Hello {{ClientName}}, your project {{JobCode}} has been completed.");
  const [writerTemplate, setWriterTemplate] = useState("Hello {{WriterName}}, please review job {{JobCode}}.");
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [tempClientText, setTempClientText] = useState("");
  const [tempWriterText, setTempWriterText] = useState("");
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);

  // Active compose slide-over
  const [activeCompose, setActiveCompose] = useState<{
    recipientRole: "Client" | "Writer";
    recipientName: string;
    recipientPhone: string;
    messageText: string;
  } | null>(null);

  // Load custom templates on mount / snapshot
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "whatsapp_templates", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.clientTemplate) {
          setClientTemplate(data.clientTemplate);
          setTempClientText(data.clientTemplate);
        }
        if (data.writerTemplate) {
          setWriterTemplate(data.writerTemplate);
          setTempWriterText(data.writerTemplate);
        }
      } else {
        setTempClientText("Hello {{ClientName}}, your project {{JobCode}} has been completed.");
        setTempWriterText("Hello {{WriterName}}, please review job {{JobCode}}.");
      }
    }, (error) => {
      console.error("Failed to read templates:", error);
    });
    return () => unsub();
  }, [user?.uid]);

  const handleSaveTemplates = async () => {
    if (!user?.uid) return;
    setIsSavingTemplates(true);
    try {
      await setDoc(doc(db, "whatsapp_templates", user.uid), {
        clientTemplate: tempClientText.trim(),
        writerTemplate: tempWriterText.trim(),
        userId: user.uid,
        updatedAt: serverTimestamp()
      });
      setClientTemplate(tempClientText.trim());
      setWriterTemplate(tempWriterText.trim());
      setIsTemplatesOpen(false);
    } catch (err) {
      console.error("Failed to save templates:", err);
    } finally {
      setIsSavingTemplates(false);
    }
  };

  const handleOpenComposeClient = () => {
    const rName = matchedClient?.clientName || "Client";
    const rPhone = matchedClient?.phone || "";
    let finalMsg = clientTemplate;
    finalMsg = finalMsg.replace(/\{\{ClientName\}\}/g, rName);
    finalMsg = finalMsg.replace(/\{\{JobCode\}\}/g, job.jobCode || "N/A");
    
    setActiveCompose({
      recipientRole: "Client",
      recipientName: rName,
      recipientPhone: rPhone,
      messageText: finalMsg
    });
  };

  const handleOpenComposeWriter = () => {
    const rName = job.assignedWriterName || "Writer";
    
    // Find matching member in team snapshot to get phone
    const writerObj = teamMembers.find(m => m.id === job.assignedWriterId);
    const rPhone = writerObj?.phone || "";

    let finalMsg = writerTemplate;
    finalMsg = finalMsg.replace(/\{\{WriterName\}\}/g, rName);
    finalMsg = finalMsg.replace(/\{\{JobCode\}\}/g, job.jobCode || "N/A");

    setActiveCompose({
      recipientRole: "Writer",
      recipientName: rName,
      recipientPhone: rPhone,
      messageText: finalMsg
    });
  };

  const handleSendWhatsAppMessage = async () => {
    if (!user?.uid || !activeCompose) return;
    const { recipientRole, recipientName, recipientPhone, messageText } = activeCompose;
    const cleanPhone = recipientPhone.replace(/[^0-9]/g, "");

    try {
      // 1. Save Communication Log to Firestore
      await addDoc(collection(db, "communications"), {
        jobId: job.id,
        jobCode: job.jobCode || "N/A",
        recipientRole,
        recipientName,
        recipientPhone: cleanPhone,
        message: messageText,
        status: "Sent",
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      // 2. Log Activity Timeline
      try {
        await addDoc(collection(db, "job_activities"), {
          jobId: job.id,
          action: `Contacted ${recipientRole} via WhatsApp (${recipientName})`,
          userName: user.displayName || user.email?.split('@')[0] || "User",
          userEmail: user.email || "unknown@system.local",
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      } catch (actErr) {
        console.error("Failed to timeline log WhatsApp communication:", actErr);
      }

      // 3. Clear compose block & launch WhatsApp
      setActiveCompose(null);
      const deepLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
      window.open(deepLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "communications");
    }
  };

  // Revision Management States
  const [showAddRevision, setShowAddRevision] = useState(false);
  const [revRequestedDate, setRevRequestedDate] = useState(() => {
    // Local time ISO
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1000);
    return localNow.toISOString().slice(0, 16);
  });
  const [revRequestedBy, setRevRequestedBy] = useState("");
  const [revNotes, setRevNotes] = useState("");
  const [revStatus, setRevStatus] = useState<"Pending" | "In Progress" | "Completed" | string>("Pending");
  const [revCompletionDate, setRevCompletionDate] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  // Initialize requester name when client loaded
  useEffect(() => {
    if (matchedClient?.clientName) {
      setRevRequestedBy(matchedClient.clientName);
    } else {
      setRevRequestedBy("Client");
    }
  }, [matchedClient]);

  const handleCreateRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !job.id) return;
    if (!revRequestedBy.trim() || !revNotes.trim()) return;

    setIsSubmittingRevision(true);
    // Auto-calculate the next sequential revisionNumber based on existing count
    const nextRevNum = (revisionsList.length > 0)
      ? Math.max(...revisionsList.map(r => r.revisionNumber || 0)) + 1
      : 1;

    try {
      const payload: any = {
        jobId: job.id,
        revisionNumber: nextRevNum,
        requestedDate: new Date(revRequestedDate).toISOString(),
        requestedBy: revRequestedBy.trim(),
        revisionNotes: revNotes.trim(),
        status: revStatus,
        userId: user.uid,
        createdAt: serverTimestamp()
      };

      if (revStatus === "Completed") {
        payload.completionDate = revCompletionDate ? new Date(revCompletionDate).toISOString() : new Date().toISOString();
      }

      await addDoc(collection(db, "revisions"), payload);

      // Create an activity timeline log
      await addDoc(collection(db, "job_activities"), {
        jobId: job.id,
        action: `Revision requested #${nextRevNum} was logged (By: ${revRequestedBy.trim()}, Status: ${revStatus})`,
        userName: user.displayName || user.email?.split("@")[0] || "Workspace Administrator",
        userEmail: user.email || "unknown@system.local",
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      // Update parent Job revisionCount if applicable
      await updateDoc(doc(db, "jobs", job.id), {
        revisionCount: nextRevNum
      });

      // Reset
      setShowAddRevision(false);
      setRevNotes("");
      setRevStatus("Pending");
      setRevCompletionDate("");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "revisions");
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const handleUpdateRevisionStatus = async (revisionId: string, item: any, newStatus: "Pending" | "In Progress" | "Completed") => {
    if (!user?.uid || !job.id) return;

    let updatedCompletionDate = item.completionDate || null;
    if (newStatus === "Completed") {
      updatedCompletionDate = new Date().toISOString();
    } else {
      updatedCompletionDate = null;
    }

    try {
      await updateDoc(doc(db, "revisions", revisionId), {
        status: newStatus,
        completionDate: updatedCompletionDate
      });

      // Create an activity timeline log
      await addDoc(collection(db, "job_activities"), {
        jobId: job.id,
        action: `Revision #${item.revisionNumber} status changed to ${newStatus}`,
        userName: user.displayName || user.email?.split("@")[0] || "Workspace Administrator",
        userEmail: user.email || "unknown@system.local",
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `revisions/${revisionId}`);
    }
  };

  const handleDeleteRevision = async (revisionId: string, revNum: number) => {
    if (!window.confirm("Are you sure you want to delete this revision record? This action is permanent!")) return;
    try {
      await deleteDoc(doc(db, "revisions", revisionId));

      // Append revision activity timeline entry
      await addDoc(collection(db, "job_activities"), {
        jobId: job.id,
        action: `Deleted Revision Record #${revNum}`,
        userName: user.displayName || user.email?.split("@")[0] || "Workspace Administrator",
        userEmail: user.email || "unknown@system.local",
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      // Recalculate revisionCount
      const remainingRevs = revisionsList.filter(r => r.id !== revisionId);
      const nextMax = remainingRevs.length > 0
        ? Math.max(...remainingRevs.map(r => r.revisionNumber || 0))
        : 0;

      await updateDoc(doc(db, "jobs", job.id), {
        revisionCount: nextMax
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `revisions/${revisionId}`);
    }
  };

  const [stagedFiles, setStagedFiles] = useState<Array<{
    id: string;
    file: File;
    name: string;
    size: number;
    type: string;
    category: string;
    dataUrl: string;
  }>>([]);

  const [uploadToDrive, setUploadToDrive] = useState<boolean>(!!getCachedAccessToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activePreviewFile, setActivePreviewFile] = useState<any | null>(null);

  // Authenticate and toggle Google Drive
  const toggleUploadToDrive = async (checked: boolean) => {
    if (checked && !getCachedAccessToken()) {
      setIsConnectingDrive(true);
      try {
        await connectGoogleDrive();
        setUploadToDrive(true);
      } catch (err: any) {
        console.error("Failed to connect to Google Drive:", err);
        setUploadError("Could not authenticate with Google Drive. Please authorize first.");
        setUploadToDrive(false);
      } finally {
        setIsConnectingDrive(false);
      }
    } else {
      setUploadToDrive(checked);
    }
  };

  // File categories list
  const fileCategories = [
    "Requirements",
    "Source Materials",
    "Writer Draft",
    "QC Version",
    "Final Submission",
    "Invoice"
  ];

  // Read files and add to staging queue
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);
    let hasTooLargeFile = false;

    Array.from(files).forEach((file: any) => {
      // 800 KB limit only applies if local Firestore storage is selected
      if (!uploadToDrive && file.size > 800 * 1024) {
        hasTooLargeFile = true;
        return;
      }

      const tempId = Math.random().toString(36).substring(2, 9);
      
      // Auto guess category based on filename keywords
      let guessedCategory = "Source Materials";
      const lowerName = file.name.toLowerCase();
      if (lowerName.includes("req") || lowerName.includes("brief") || lowerName.includes("guideline")) {
        guessedCategory = "Requirements";
      } else if (lowerName.includes("draft") || lowerName.includes("version") || lowerName.includes("write")) {
        guessedCategory = "Writer Draft";
      } else if (lowerName.includes("qc") || lowerName.includes("review") || lowerName.includes("editing")) {
        guessedCategory = "QC Version";
      } else if (lowerName.includes("final") || lowerName.includes("submission") || lowerName.includes("submit")) {
        guessedCategory = "Final Submission";
      } else if (lowerName.includes("invoice") || lowerName.includes("bill") || lowerName.includes("receipt")) {
        guessedCategory = "Invoice";
      }

      if (uploadToDrive) {
        // Direct staging without loading file content into memory strings
        setStagedFiles((prev) => [
          ...prev,
          {
            id: tempId,
            file,
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            category: guessedCategory,
            dataUrl: "" // Will occupy viewLink once uploaded
          }
        ]);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setStagedFiles((prev) => [
            ...prev,
            {
              id: tempId,
              file,
              name: file.name,
              size: file.size,
              type: file.type || "application/octet-stream",
              category: guessedCategory,
              dataUrl
            }
          ]);
        };
        reader.readAsDataURL(file);
      }
    });

    if (hasTooLargeFile) {
      setUploadError("Some files were skipped. Local database storage supports files up to 800KB. Enable 'Store in Google Drive' to upload files of any size!");
    }

    // Reset input value to allow selecting same files again
    e.target.value = "";
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateStagedFileCategory = (id: string, category: string) => {
    setStagedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, category } : f))
    );
  };

  const clearStagedQueue = () => {
    setStagedFiles([]);
    setUploadError(null);
  };

  // Perform firestore / Google Drive uploads
  const handleUploadStagedFiles = async () => {
    if (stagedFiles.length === 0 || !user?.uid) return;

    setIsUploadingFiles(true);
    setUploadError(null);

    try {
      let folderId: string | undefined;

      if (uploadToDrive) {
        // Create full organized structures in Google Drive dynamically
        const appFolderId = await ensureAppFolder();
        const clientFolderId = await findFolder(job?.clientCode || "General", appFolderId) || await createDriveFolder(job?.clientCode || "General", appFolderId);
        
        const jobFolderName = `${job?.jobCode || "JOB"} - ${job?.jobName || "Untitled"}`;
        folderId = await findFolder(jobFolderName, clientFolderId) || await createDriveFolder(jobFolderName, clientFolderId);
      }

      for (const staged of stagedFiles) {
        let finalDataUrl = staged.dataUrl;
        let driveFileId: string | undefined;
        let driveUrl: string | undefined;

        if (uploadToDrive) {
          const uploadedDriveFile = await uploadFileToDrive(staged.name, staged.type, staged.file, folderId);
          driveFileId = uploadedDriveFile.id;
          driveUrl = uploadedDriveFile.webViewLink;
          finalDataUrl = uploadedDriveFile.webViewLink || ""; // Save direct web link as fileData
        }

        // 1. Create document in job_files collection
        await addDoc(collection(db, "job_files"), {
          jobId: job.id,
          fileName: staged.name,
          category: staged.category,
          fileType: staged.type,
          fileSize: staged.size,
          fileData: finalDataUrl,
          uploadedBy: user.displayName || user.email?.split("@")[0] || "User",
          userId: user.uid,
          createdAt: serverTimestamp(),
          driveFileId: driveFileId || null,
          driveFileUrl: driveUrl || null
        });

        // 2. Log separate timeline activity
        await addDoc(collection(db, "job_activities"), {
          jobId: job.id,
          action: uploadToDrive
            ? `File Uploaded to Google Drive (${staged.category}): ${staged.name} (${(staged.size / 1024).toFixed(1)} KB)`
            : `File Uploaded (${staged.category}): ${staged.name} (${(staged.size / 1024).toFixed(1)} KB)`,
          userName: user.displayName || user.email?.split("@")[0] || "User",
          userEmail: user.email || "unknown@system.local",
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }

      // Success, clear queue
      setStagedFiles([]);
    } catch (err: any) {
      console.error("Failed to upload job files:", err);
      setUploadError(err?.message || "An error occurred during file upload. Please verify Google Drive permissions and try again.");
    } finally {
      setIsUploadingFiles(false);
    }
  };

  // Handle file deletion
  const handleDeleteFile = async (fileId: string, fileName: string, category: string) => {
    if (!user?.uid) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${fileName}"?`)) return;

    try {
      // If it exists as a Google Drive file, remote-delete it too
      const targetFile = jobFiles.find((f: any) => f.id === fileId);
      if (targetFile?.driveFileId) {
        try {
          await deleteDriveFile(targetFile.driveFileId);
        } catch (driveErr) {
          console.warn("Could not delete file from Google Drive (already trashed or lacking permissions):", driveErr);
        }
      }

      // 1. Delete document
      await deleteDoc(doc(db, "job_files", fileId));

      // 2. Log activity
      await addDoc(collection(db, "job_activities"), {
        jobId: job.id,
        action: `File Deleted (${category}): ${fileName}`,
        userName: user.displayName || user.email?.split("@")[0] || "User",
        userEmail: user.email || "unknown@system.local",
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to delete file:", err);
      alert("Failed to delete file. Insufficient permissions or network error.");
    }
  };

  // Real-time query to check if related invoice already exists
  const invoicesQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "invoices"),
      where("userId", "==", user.uid)
    );
  }, [user?.uid]);

  const [invoicesSnapshot] = useCollection(invoicesQuery);

  const relatedInvoice = useMemo(() => {
    if (!invoicesSnapshot) return null;
    const allInvoices = invoicesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    // Find matching invoice by jobId or by jobCode
    return allInvoices.find(inv => {
      if (inv.jobId && inv.jobId === job.id) return true;
      if (job.jobCode && inv.jobCode && inv.jobCode.toUpperCase() === job.jobCode.toUpperCase()) return true;
      return false;
    }) || null;
  }, [invoicesSnapshot, job.id, job.jobCode]);

  // Auto-seed team members if they are completely empty
  useEffect(() => {
    if (!user?.uid || teamLoading) return;

    if (teamMembers.length === 0) {
      const defaultTeammates = [
        { name: "Amit Sharma", role: "Writer", email: "amit.sharma@talent.co" },
        { name: "Pooja Roy", role: "Editor", email: "pooja.editing@talent.co" },
        { name: "Robert Miller", role: "Quality Checker", email: "robert.miller@talent.co" },
        { name: "Kiran Goel", role: "Writer", email: "kiran.goel@talent.co" }
      ];

      const seedTeam = async () => {
        try {
          for (const teammate of defaultTeammates) {
            await addDoc(collection(db, "team_members"), {
              ...teammate,
              userId: user.uid,
              createdAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Failed to seed default team members:", e);
        }
      };

      seedTeam();
    }
  }, [teamMembers.length, user?.uid, teamLoading]);

  // Separate teammates by roles
  const writers = useMemo(() => teamMembers.filter(m => m.role === "Writer"), [teamMembers]);
  const editors = useMemo(() => teamMembers.filter(m => m.role === "Editor"), [teamMembers]);
  const qcs = useMemo(() => teamMembers.filter(m => m.role === "Quality Checker"), [teamMembers]);

  // Triggered when assignment changes
  const handleAssignMember = async (role: "Writer" | "Editor" | "Quality Checker", memberId: string | null) => {
    if (!user?.uid) return;

    let idField = "";
    let nameField = "";
    let previousName = "None";

    if (role === "Writer") {
      idField = "assignedWriterId";
      nameField = "assignedWriterName";
      previousName = job.assignedWriterName || "None";
    } else if (role === "Editor") {
      idField = "assignedEditorId";
      nameField = "assignedEditorName";
      previousName = job.assignedEditorName || "None";
    } else {
      idField = "assignedQCId";
      nameField = "assignedQCName";
      previousName = job.assignedQCName || "None";
    }

    const selectedTeammate = teamMembers.find(m => m.id === memberId);
    const newName = selectedTeammate ? selectedTeammate.name : "None";

    // If no change occurs, skip
    if (previousName === newName) {
      setActiveSelectRole(null);
      return;
    }

    try {
      // 1. Update Job Document with new Assignee
      await updateDoc(doc(db, "jobs", job.id), {
        [idField]: memberId || null,
        [nameField]: selectedTeammate ? selectedTeammate.name : null
      });

      // 2. Track Audit Log in database
      await addDoc(collection(db, "assignment_logs"), {
        jobId: job.id,
        jobCode: job.jobCode || "N/A",
        role,
        previousAssigneeName: previousName,
        newAssigneeName: newName,
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      // 3. Post System-alert Notification to Notification Hub if setting up a true assignee
      if (selectedTeammate) {
        await addDoc(collection(db, "notifications"), {
          title: "Assignment Updated",
          message: `${role} assigned for job "${job.jobName || job.jobCode}": ${selectedTeammate.name}.`,
          read: false,
          userId: user.uid,
          type: "new_job",
          referenceId: job.id,
          referenceType: "job",
          createdAt: serverTimestamp()
        });
      }

      // 4. Automatically record assignment timeline activity
      try {
        let activityAction = "";
        if (role === "Writer") {
          activityAction = previousName === "None" ? `Writer Assigned: ${newName}` : `Writer Changed: ${previousName} to ${newName}`;
        } else {
          activityAction = previousName === "None" ? `${role} Assigned: ${newName}` : `${role} Changed: ${previousName} to ${newName}`;
        }

        await addDoc(collection(db, "job_activities"), {
          jobId: job.id,
          action: activityAction,
          userName: user.displayName || user.email?.split('@')[0] || "User",
          userEmail: user.email || "unknown@system.local",
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      } catch (actErr) {
        console.error("Failed to automatically record assignment timeline activity:", actErr);
      }

      setActiveSelectRole(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${job.id}/assignment`);
    }
  };

  // Create custom Team Member contact on-the-fly
  const handleCreateTeammate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !newTeammateName.trim() || !newTeammateEmail.trim()) return;

    setIsSavingTeammate(true);
    try {
      const docRef = await addDoc(collection(db, "team_members"), {
        name: newTeammateName.trim(),
        role: selectedRoleForAdd,
        email: newTeammateEmail.trim(),
        phone: newTeammatePhone.trim().replace(/[^0-9]/g, ""),
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      // Instant Auto-Assign freshly created contract teammate
      await handleAssignMember(selectedRoleForAdd, docRef.id);

      // Clean inputs
      setNewTeammateName("");
      setNewTeammateEmail("");
      setNewTeammatePhone("");
      setShowAddTeammate(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "team_members");
    } finally {
      setIsSavingTeammate(false);
    }
  };

  const getLogTimestamp = (createdAt: any) => {
    if (!createdAt) return "Just now";
    let dateObj: Date;
    if (createdAt instanceof Timestamp) {
      dateObj = createdAt.toDate();
    } else if (createdAt.seconds) {
      dateObj = new Date(createdAt.seconds * 1000);
    } else {
      dateObj = new Date(createdAt);
    }

    try {
      return format(dateObj, "MMM d, hh:mm a");
    } catch (e) {
      return "recently";
    }
  };

  return (
    <div id="job-details-modal-overlay" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col my-8 border border-slate-100 dark:border-slate-800 max-h-[90vh]"
      >
        {/* Modal Main Header */}
        <div className="px-6 py-5 bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex gap-2.5 items-center">
            <span className="bg-indigo-600 text-white text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full shadow-sm">
              Job Workspace Details
            </span>
            {job.jobCode && (
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/50 uppercase">
                {job.jobCode}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-450 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Center Contents Split View */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-slate-800 scrollbar-thin">
          
          {/* LEFT PANEL: Job Metrics & Metadata - 5/12 width */}
          <div className="md:col-span-5 p-6 space-y-6">
            <div>
              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-extrabold uppercase tracking-wide">Client Portal {job.clientCode}</span>
              <h2 className="text-xl font-black text-slate-800 dark:text-white leading-snug mt-1 break-words">
                {job.jobName || "Untitled Assignment"}
              </h2>
            </div>

            {/* Quick Pricing Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50/70 dark:bg-slate-950/40 border border-gray-100 dark:border-slate-850 rounded-2xl">
                <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest block">Job Volume</span>
                <span className="text-base font-extrabold text-slate-800 dark:text-slate-200 mt-1 block">
                  {job.wordCount ? job.wordCount.toLocaleString() : "0"} <span className="text-xs font-semibold text-gray-400 dark:text-slate-550">words</span>
                </span>
              </div>
              <div className="p-4 bg-slate-50/70 dark:bg-slate-950/40 border border-gray-100 dark:border-slate-850 rounded-2xl">
                <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Gross Revenue</span>
                <span className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
                  ₹{((job.wordCount || 0) * (job.rate || 0)).toFixed(2)}
                </span>
                <span className="text-[9px] text-gray-450 dark:text-slate-500 block font-semibold">@ ₹{job.rate}/word</span>
              </div>
            </div>

            {/* Financial Costing & Profit Summary Card */}
            {(() => {
              const actRevenue = job.revenue !== undefined ? job.revenue : ((job.wordCount || 0) * (job.rate || 0));
              const costWriter = job.writerCost || 0;
              const costEditor = job.editorCost || 0;
              const costQC = job.qcCost || 0;
              const costOther = job.otherExpenses || 0;
              const totalCosts = costWriter + costEditor + costQC + costOther;
              const profit = actRevenue - totalCosts;
              const isProfitPositive = profit >= 0;

              return (
                <div className="p-4 bg-slate-50/90 dark:bg-slate-950/50 border border-indigo-100/50 dark:border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-150 dark:border-slate-800 pb-2">
                    <span className="text-[10px] font-black text-gray-400 dark:text-slate-550 uppercase tracking-widest block">Job Profitability (Financials)</span>
                    {!isEditingFinancials ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingFinancials(true)}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                      >
                        Edit Costs
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveFinancials}
                          className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditRevenue(actRevenue.toString());
                            setEditWriterCost(costWriter.toString());
                            setEditEditorCost(costEditor.toString());
                            setEditQcCost(costQC.toString());
                            setEditOtherExpenses(costOther.toString());
                            setIsEditingFinancials(false);
                          }}
                          className="text-[10px] font-bold text-gray-400 hover:underline shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditingFinancials ? (
                     <div className="space-y-2.5 text-xs">
                       <div className="grid grid-cols-2 gap-2">
                         <div>
                           <label className="text-[10px] font-bold text-gray-700 dark:text-slate-350 block mb-0.5">Revenue (₹)</label>
                           <input
                             type="number"
                             value={editRevenue}
                             onChange={(e) => setEditRevenue(e.target.value)}
                             className="w-full px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-800 dark:bg-slate-900 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-gray-800 dark:text-white"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-gray-700 dark:text-slate-350 block mb-0.5">Writer Cost (₹)</label>
                           <input
                             type="number"
                             value={editWriterCost}
                             onChange={(e) => setEditWriterCost(e.target.value)}
                             className="w-full px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-800 dark:bg-slate-900 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-gray-800 dark:text-white"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-gray-700 dark:text-slate-350 block mb-0.5">Editor Cost (₹)</label>
                           <input
                             type="number"
                             value={editEditorCost}
                             onChange={(e) => setEditEditorCost(e.target.value)}
                             className="w-full px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-800 dark:bg-slate-900 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-gray-800 dark:text-white"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-gray-700 dark:text-slate-350 block mb-0.5">QC Cost (₹)</label>
                           <input
                             type="number"
                             value={editQcCost}
                             onChange={(e) => setEditQcCost(e.target.value)}
                             className="w-full px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-800 dark:bg-slate-900 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-gray-800 dark:text-white"
                           />
                         </div>
                       </div>
                       <div>
                         <label className="text-[10px] font-bold text-gray-700 dark:text-slate-350 block mb-0.5">Other Expenses (₹)</label>
                         <input
                           type="number"
                           value={editOtherExpenses}
                           onChange={(e) => setEditOtherExpenses(e.target.value)}
                           className="w-full px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-800 dark:bg-slate-900 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-gray-800 dark:text-white"
                         />
                       </div>
                     </div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-gray-600 dark:text-slate-400">
                        <span>Billed Revenue:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">₹{actRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-650 dark:text-slate-400 pl-2 border-l border-gray-200">
                        <span>Writer SLA:</span>
                        <span className="text-gray-800 dark:text-slate-200 font-medium">₹{costWriter.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-650 dark:text-slate-400 pl-2 border-l border-gray-200">
                        <span>Editor SLA:</span>
                        <span className="text-gray-800 dark:text-slate-200 font-medium">₹{costEditor.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-650 dark:text-slate-400 pl-2 border-l border-gray-200">
                        <span>QC SLA:</span>
                        <span className="text-gray-800 dark:text-slate-200 font-medium">₹{costQC.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {costOther > 0 && (
                        <div className="flex justify-between items-center text-gray-650 dark:text-slate-400 pl-2 border-l border-gray-200">
                          <span>Other Expenses:</span>
                          <span className="text-gray-800 dark:text-slate-200 font-medium">₹{costOther.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-gray-500 dark:text-slate-500 text-[10px] uppercase font-bold border-t border-gray-150 pt-1.5">
                        <span>Total Expenses:</span>
                        <span>₹{totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className={`p-2 rounded-xl mt-2.5 font-black text-xs flex justify-between items-center ${
                        isProfitPositive 
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-450 border border-emerald-100" 
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-450 border border-rose-100"
                      }`}>
                        <span>Calculated Net Profit:</span>
                        <span>{isProfitPositive ? "₹" : "-₹"}{Math.abs(profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* General Deadlines & Status */}
            <div className="space-y-3.5 pt-1">
              {job.startDate ? (
                <div className="flex items-center gap-3 text-xs text-gray-650">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">Start Date</span>
                    <span className="font-bold text-slate-700">
                      {format(new Date(job.startDate), "MMMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-xs text-gray-650">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">Start Date</span>
                    <span className="text-gray-400">Not recorded</span>
                  </div>
                </div>
              )}

              {(job.internalDeadline || job.deadline) && (() => {
                const targetDl = job.internalDeadline || job.deadline;
                const statusInfo = getDLStatusForDetails(targetDl, job.status);
                return (
                  <div className="flex items-center gap-3 text-xs text-gray-650">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl-lg">
                      <Calendar className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] font-bold uppercase">Internal Deadline</span>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="font-bold text-slate-700">
                          {format(new Date(targetDl), "MMMM d, yyyy 'at' h:mm a")}
                        </span>
                        {statusInfo && (
                          <span className={`inline-block px-2 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${statusInfo.bg}`}>
                            {statusInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(job.clientDeadline || job.deadline) && (() => {
                const targetDl = job.clientDeadline || job.deadline;
                const statusInfo = getDLStatusForDetails(targetDl, job.status);
                return (
                  <div className="flex items-center gap-3 text-xs text-gray-650">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-xl-lg">
                      <Calendar className="w-4 h-4 text-rose-500" />
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] font-bold uppercase">Client Deadline</span>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="font-bold text-indigo-750 font-black">
                          {format(new Date(targetDl), "MMMM d, yyyy 'at' h:mm a")}
                        </span>
                        {statusInfo && (
                          <span className={`inline-block px-2 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${statusInfo.bg}`}>
                            {statusInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 text-xs text-gray-650">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Pipeline State</span>
                  <span className={`inline-block px-2.5 py-0.5 mt-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    job.status === "Completed" ? "bg-green-50 text-green-600 border border-green-100" :
                    job.status === "Review" ? "bg-orange-50 text-orange-600 border border-orange-100" :
                    job.status === "In Progress" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                    "bg-gray-150 text-gray-600 border border-gray-150"
                  }`}>
                    {job.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-650">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Revision Count</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-extrabold text-indigo-950 dark:text-white font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
                      {job.revisionCount || 0}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const currentRev = job.revisionCount || 0;
                        await updateDoc(doc(db, "jobs", job.id), { revisionCount: Math.max(0, currentRev - 1) });
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/60 rounded font-mono text-[10px] font-bold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const currentRev = job.revisionCount || 0;
                        await updateDoc(doc(db, "jobs", job.id), { revisionCount: currentRev + 1 });
                      }}
                      className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded font-mono text-[10px] font-bold border border-indigo-150 dark:border-indigo-900 transition text-indigo-600 dark:text-indigo-400 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Scope Notes Panel */}
            {job.notes && (
              <div className="p-4 bg-amber-50/45 rounded-2xl border border-amber-100/50 space-y-1.5 font-sans">
                <span className="text-[10px] text-amber-800 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  <span>Briefing & Notes</span>
                </span>
                <p className="text-xs text-slate-700 leading-relaxed italic break-words">
                  "{job.notes}"
                </p>
              </div>
            )}

            {/* Job File Repository Section */}
            <div className="pt-5 border-t border-gray-105 dark:border-slate-800 space-y-4 font-sans">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 tracking-widest flex items-center gap-2 uppercase">
                  <FolderOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Job File Repository</span>
                </h3>
                <span className="text-[9px] font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-900/40 font-mono">
                  {jobFiles.length} {jobFiles.length === 1 ? 'file' : 'files'}
                </span>
              </div>

              {/* Google Drive Upload Setting */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl transition ${uploadToDrive ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800/60 text-slate-400'}`}>
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-750 dark:text-slate-205 block">Store in Google Drive</span>
                    <span className="text-[9px] text-gray-400 block max-w-[200px] leading-normal">
                      Bypasses local 800KB size limit and organizes into job folders
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={uploadToDrive}
                    disabled={isConnectingDrive || isUploadingFiles}
                    onChange={(e) => toggleUploadToDrive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-250 dark:bg-slate-800 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:right-[16px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {isConnectingDrive && (
                <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold animate-pulse text-center">
                  Authenticating with Google Drive... Please follow the popup window...
                </div>
              )}

              {/* Upload Input & Dropzone */}
              <div className="border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/30 dark:bg-slate-950/20 text-center relative hover:bg-slate-50/65 dark:hover:bg-slate-950/40 transition">
                <input 
                  type="file" 
                  onChange={handleFileSelection} 
                  className="hidden" 
                  id="job-file-upload-input"
                  multiple
                  disabled={isUploadingFiles}
                />
                <label htmlFor="job-file-upload-input" className="cursor-pointer block space-y-1.5">
                  <div className="mx-auto w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-650 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Select File(s) to Upload
                  </div>
                  <p className="text-[9px] text-gray-405">
                    {uploadToDrive 
                      ? "Bypassing local size limit via Google Drive cloud storage! Supports any file types"
                      : "PDF, Word, images, text, or zip files up to 800KB"}
                  </p>
                </label>
              </div>

              {/* Staged Queue Area */}
              {stagedFiles.length > 0 && (
                <div className="p-3 bg-indigo-50/35 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/40 rounded-2xl space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between border-b border-indigo-50 dark:border-indigo-950 pb-2">
                    <span className="font-extrabold text-slate-750 dark:text-slate-300 text-[10px]">Staging Queue ({stagedFiles.length})</span>
                    <button 
                      type="button" 
                      onClick={clearStagedQueue}
                      className="text-[9px] text-rose-500 hover:text-rose-700 font-bold"
                    >
                      Clear All
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {stagedFiles.map((staged) => (
                      <div key={staged.id} className="p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[10px] text-slate-800 dark:text-slate-200 truncate" title={staged.name}>
                            {staged.name}
                          </p>
                          <p className="text-[8px] text-gray-400">
                            {(staged.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        
                        {/* Category selection */}
                        <select
                          value={staged.category}
                          onChange={(e) => updateStagedFileCategory(staged.id, e.target.value)}
                          className="text-[9px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 outline-none text-slate-700 dark:text-slate-205"
                        >
                          {fileCategories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => removeStagedFile(staged.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {uploadError && (
                    <p className="text-[9px] font-medium text-rose-500 leading-normal">{uploadError}</p>
                  )}

                  <button
                    type="button"
                    disabled={isUploadingFiles}
                    onClick={handleUploadStagedFiles}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-extrabold text-[10px] uppercase rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isUploadingFiles ? "Uploading Files..." : `Commit Upload (${stagedFiles.length} files)`}
                  </button>
                </div>
              )}

              {/* Folders List (Categories Repository) */}
              <div className="space-y-2">
                {fileCategories.map((category) => {
                  const categoryFiles = jobFiles.filter((f: any) => f.category === category);
                  
                  return (
                    <CategoryFolder
                      key={category}
                      categoryName={category}
                      files={categoryFiles}
                      onPreview={setActivePreviewFile}
                      onDelete={(id, name) => handleDeleteFile(id, name, category)}
                      getLogTimestamp={getLogTimestamp}
                    />
                  );
                })}
              </div>
            </div>

            {/* Related Invoice Section */}
            <div className="pt-5 border-t border-gray-100 dark:border-slate-800 space-y-3 font-sans">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>Related Invoice</span>
              </h3>

              {relatedInvoice ? (
                <div id="job-related-invoice-card" className="p-4 bg-indigo-50/20 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-2xl space-y-3.5 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block mb-0.5">Invoice Number</span>
                      <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200">{relatedInvoice.invoiceNumber}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block mb-0.5">Status</span>
                      <span className={`inline-block px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full ${
                        relatedInvoice.status === "Paid" ? "bg-emerald-550/10 text-emerald-600 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50" :
                        relatedInvoice.status === "Overdue" ? "bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900/50" :
                        relatedInvoice.status === "Draft" ? "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-850" :
                        relatedInvoice.status === "Sent" ? "bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50" :
                        relatedInvoice.status === "Cancelled" ? "bg-gray-100 text-gray-400 border border-gray-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-850" :
                        "bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50"
                      }`}>
                        {relatedInvoice.status}
                      </span>
                    </div>
                    {(() => {
                      const baseAmt = Number(relatedInvoice.amount) || 0;
                      const taxPct = Number(relatedInvoice.taxPercentage) || 0;
                      const discAmt = Number(relatedInvoice.discountAmount) || 0;
                      const netAmt = baseAmt - discAmt;
                      const taxAmt = (netAmt * taxPct) / 100;
                      const gTotal = Math.round((netAmt + taxAmt) * 100) / 100;
                      return (
                        <div className="col-span-2 grid grid-cols-2 gap-2 pt-2 border-t border-dashed border-gray-200 dark:border-slate-800 text-xs font-sans">
                          <div>
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block mb-0.5">Grand Total</span>
                            <span className="font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">₹{gTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase block mb-0.5 font-bold">Date Created</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {relatedInvoice.createdAt ? getLogTimestamp(relatedInvoice.createdAt) : "Draft/Recently Created"}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1 font-sans">
                    <button
                      id="btn-view-invoice-modal"
                      type="button"
                      onClick={() => onViewInvoice?.(relatedInvoice.id)}
                      className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Invoice</span>
                    </button>
                    <button
                      id="btn-download-pdf-job-modal"
                      type="button"
                      onClick={() => handleDownloadInvoicePDF(relatedInvoice)}
                      className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Download PDF Invoice"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div id="job-no-invoice-card" className="p-4 bg-slate-50/50 dark:bg-slate-950/20 border border-dashed border-gray-200 dark:border-slate-800 rounded-2xl text-center space-y-3 animate-fade-in">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">No invoice generated yet for this job.</p>
                  <button
                    id="btn-generate-invoice-modal"
                    type="button"
                    onClick={() => onGenerateInvoice?.(job.id)}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Generate Invoice</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Assignments Hub & Historic Timeline Logs - 7/12 width */}
          <div className="md:col-span-7 p-6 space-y-6 flex flex-col justify-between">
            
            {/* Core Assignments Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600" />
                  <span>Assigned Personnel</span>
                </h3>
                <button
                  id="btn-add-team-inline"
                  onClick={() => {
                    const role = "Writer";
                    setSelectedRoleForAdd(role);
                    setShowAddTeammate(true);
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Teammate</span>
                </button>
              </div>

              {/* Assignment Seats List */}
              <div className="grid grid-cols-1 gap-3.5">
                
                {/* 1. SEAT: WRITER */}
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950/20 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-450 rounded-xl">
                      <PenTool className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Freelance Writer</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                        {job.assignedWriterName || <span className="text-gray-450 dark:text-slate-600 font-medium italic">Unassigned</span>}
                      </span>
                    </div>
                  </div>

                  <div className="relative w-full sm:w-auto shrink-0 self-end sm:self-center">
                    {activeSelectRole === "Writer" ? (
                      <select
                        autoFocus
                        value={job.assignedWriterId || ""}
                        onChange={(e) => handleAssignMember("Writer", e.target.value || null)}
                        className="w-full sm:w-48 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-slate-705 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 outline-indigo-505 cursor-pointer shadow-inner"
                      >
                        <option value="">-- Drop Assignee --</option>
                        {writers.map((w) => (
                          <option key={w.id} value={w.id}>{w.name} ({w.email})</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setActiveSelectRole("Writer")}
                        className="w-full sm:w-auto text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl border border-gray-200 dark:border-slate-800 transition cursor-pointer"
                      >
                        {job.assignedWriterId ? "Reassign" : "Assign Writer"}
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. SEAT: EDITOR */}
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950/20 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 rounded-xl">
                      <FileCheck2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Senior Editor</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-205 block mt-0.5">
                        {job.assignedEditorName || <span className="text-gray-450 dark:text-slate-600 font-medium italic">Unassigned</span>}
                      </span>
                    </div>
                  </div>

                  <div className="relative w-full sm:w-auto shrink-0 self-end sm:self-center">
                    {activeSelectRole === "Editor" ? (
                      <select
                        autoFocus
                        value={job.assignedEditorId || ""}
                        onChange={(e) => handleAssignMember("Editor", e.target.value || null)}
                        className="w-full sm:w-48 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-slate-705 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 outline-indigo-505 cursor-pointer shadow-inner"
                      >
                        <option value="">-- Drop Assignee --</option>
                        {editors.map((e) => (
                          <option key={e.id} value={e.id}>{e.name} ({e.email})</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setActiveSelectRole("Editor")}
                        className="w-full sm:w-auto text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl border border-gray-200 dark:border-slate-800 transition cursor-pointer"
                      >
                        {job.assignedEditorId ? "Reassign" : "Assign Editor"}
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. SEAT: QUALITY CHECKER */}
                <div className="p-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950/20 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-405 rounded-xl">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider block">Quality Checker</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-205 block mt-0.5">
                        {job.assignedQCName || <span className="text-gray-450 dark:text-slate-600 font-medium italic">Unassigned</span>}
                      </span>
                    </div>
                  </div>

                  <div className="relative w-full sm:w-auto shrink-0 self-end sm:self-center">
                    {activeSelectRole === "Quality" ? (
                      <select
                        autoFocus
                        value={job.assignedQCId || ""}
                        onChange={(e) => handleAssignMember("Quality Checker", e.target.value || null)}
                        className="w-full sm:w-48 text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-indigo-200 dark:border-slate-705 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 outline-indigo-505 cursor-pointer shadow-inner"
                      >
                        <option value="">-- Drop Assignee --</option>
                        {qcs.map((q) => (
                          <option key={q.id} value={q.id}>{q.name} ({q.email})</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setActiveSelectRole("Quality")}
                        className="w-full sm:w-auto text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl border border-gray-200 dark:border-slate-800 transition cursor-pointer"
                      >
                        {job.assignedQCId ? "Reassign" : "Assign QC"}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* WhatsApp Communication Hub */}
            <div className="border-t border-gray-100 dark:border-slate-800/85 pt-5 mt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span>WhatsApp Communication Hub</span>
                </h3>
                <button
                  onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Configure Templates</span>
                </button>
              </div>

              {/* Template Configuration Overlay */}
              {isTemplatesOpen && (
                <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/60 rounded-2xl space-y-3.5 animate-fade-in">
                  <h4 className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Custom Message Templates
                  </h4>
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Client Template</label>
                      <textarea
                        rows={2}
                        value={tempClientText}
                        onChange={(e) => setTempClientText(e.target.value)}
                        className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-emerald-250 dark:border-slate-800 text-slate-850 dark:text-slate-100 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none transition"
                        placeholder="Template body..."
                      />
                      <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-1">Available tokens: <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{ClientName}}"}</code>, <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{JobCode}}"}</code></p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Writer Template</label>
                      <textarea
                        rows={2}
                        value={tempWriterText}
                        onChange={(e) => setTempWriterText(e.target.value)}
                        className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-emerald-250 dark:border-slate-800 text-slate-850 dark:text-slate-100 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none transition"
                        placeholder="Template body..."
                      />
                      <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-1">Available tokens: <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{WriterName}}"}</code>, <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600 dark:text-emerald-400">{"{{JobCode}}"}</code></p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-emerald-100 dark:border-emerald-900/40">
                    <button
                      onClick={() => setIsTemplatesOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-505 hover:text-gray-700 bg-transparent transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTemplates}
                      disabled={isSavingTemplates}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition shadow-sm flex items-center gap-1"
                    >
                      {isSavingTemplates ? "Saving..." : "Save Configuration"}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Contact buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Contact Client */}
                <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-emerald-500/5 dark:bg-emerald-950/10 flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">Client Contact Seat</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block mt-1 truncate">
                      {matchedClient?.clientName || "Unrecorded Client"}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500 block leading-relaxed mt-0.5">
                      {matchedClient?.phone ? `+${matchedClient.phone}` : "No phone number listed"}
                    </span>
                  </div>

                  <button
                    disabled={!matchedClient?.phone}
                    onClick={handleOpenComposeClient}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:dark:bg-slate-800/40 disabled:text-gray-400 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-100/50 disabled:shadow-none cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Contact Client on WA</span>
                  </button>
                </div>

                {/* Contact Writer */}
                <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-emerald-500/5 dark:bg-emerald-950/10 flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">Assigned Writer Seat</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block mt-1 truncate">
                      {job.assignedWriterName || <span className="text-gray-400 dark:text-slate-600 font-medium italic">Unassigned</span>}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500 block leading-relaxed mt-0.5">
                      {(() => {
                        const w = teamMembers.find(m => m.id === job.assignedWriterId);
                        return w?.phone ? `+${w.phone}` : "No phone number listed";
                      })()}
                    </span>
                  </div>

                  <button
                    disabled={!job.assignedWriterId || !(() => {
                      const w = teamMembers.find(m => m.id === job.assignedWriterId);
                      return w?.phone;
                    })()}
                    onClick={handleOpenComposeWriter}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:dark:bg-slate-800/40 disabled:text-gray-400 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-100/50 disabled:shadow-none cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Contact Writer on WA</span>
                  </button>
                </div>
              </div>

              {/* Compose Preview Box */}
              {activeCompose && (
                <div className="p-4 bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100/70 dark:border-indigo-900/40 rounded-2xl space-y-3.5 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-indigo-500" />
                      Compose Message to {activeCompose.recipientRole} ({activeCompose.recipientName})
                    </h4>
                    <button
                      onClick={() => setActiveCompose(null)}
                      className="text-[10px] font-black text-rose-500 hover:text-rose-700 uppercase"
                    >
                      Discard
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <span className="text-[10px] text-gray-450 dark:text-slate-400 tracking-wider block font-bold uppercase mb-1">RECIPIENT WHATSAPP NUMBER</span>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-3 py-1.5 border border-gray-150 dark:border-slate-800 rounded-xl block">
                        +{activeCompose.recipientPhone}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-450 dark:text-slate-400 tracking-wider block font-bold uppercase mb-1">PREPARED MESSAGE BODY (EDITABLE)</span>
                      <textarea
                        rows={3}
                        value={activeCompose.messageText}
                        onChange={(e) => setActiveCompose({ ...activeCompose, messageText: e.target.value })}
                        className="w-full p-3 text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-slate-850 dark:text-slate-150 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none transition font-sans shadow-inner leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5">
                    <button
                      onClick={() => setActiveCompose(null)}
                      className="px-3.5 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 bg-transparent transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendWhatsAppMessage}
                      className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Launch Chat & Log History</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Communication Logs */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase text-gray-450 dark:text-slate-500 tracking-widest block">Communication Registry Logs</span>
                
                {communications.length === 0 ? (
                  <p className="text-[11px] italic text-gray-400 dark:text-slate-500 py-3 text-center bg-slate-50/50 dark:bg-slate-950/10 rounded-xl border border-dashed border-gray-150 dark:border-slate-850 leading-normal">
                    No WhatsApp chat integrations logged for this pipeline contract yet.
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1.5 custom-scrollbar">
                    {communications.map((comm) => (
                      <div key={comm.id} className="p-3 bg-white dark:bg-slate-900/40 border border-gray-100 dark:border-slate-800/80 rounded-2xl text-[11px] leading-relaxed relative flex justify-between items-start gap-4 shadow-sm hover:border-gray-200 dark:hover:border-slate-700 transition">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-extrabold text-slate-800 dark:text-slate-205">{comm.recipientName}</span>
                            <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1 rounded font-mono font-bold block">{comm.recipientRole}</span>
                            <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 px-1.5 font-bold rounded">Sent</span>
                          </div>
                          <p className="text-gray-500 dark:text-slate-400 text-[11px] bg-slate-50 dark:bg-slate-950/20 p-2 rounded-lg font-sans border border-gray-100/40 dark:border-slate-800/30">
                            {comm.message}
                          </p>
                          <span className="text-[9px] text-gray-405 dark:text-slate-500 block font-mono">
                            Target Number: +{comm.recipientPhone}
                          </span>
                        </div>
                        <span className="text-[9px] text-gray-400 dark:text-slate-550 shrink-0 font-mono self-start pt-0.5">
                          {formatDistanceToNow(comm.createdAtParsed, { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Revision Management Hub */}
            <div className="border-t border-gray-100 dark:border-slate-800/85 pt-5 mt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" style={{ animationDuration: "12s" }} />
                  <span>Revision Management Hub</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddRevision(!showAddRevision)}
                  className="text-xs text-indigo-650 dark:text-indigo-400 hover:text-indigo-850 dark:hover:text-indigo-300 font-bold flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-xl transition cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{showAddRevision ? "Close Form" : "Log New Revision"}</span>
                </button>
              </div>

              {/* Log Revision Inline Form */}
              {showAddRevision && (
                <form
                  onSubmit={handleCreateRevision}
                  className="p-4 bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl space-y-3.5 animate-fade-in"
                >
                  <h4 className="text-[11px] font-black text-indigo-800 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                    <PlusCircle className="w-3.5 h-3.5 text-indigo-500" />
                    Record Revision Request
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Requested By</label>
                      <input
                        type="text"
                        required
                        value={revRequestedBy}
                        onChange={(e) => setRevRequestedBy(e.target.value)}
                        placeholder="e.g. Client or Auditor"
                        className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-gray-250 dark:border-slate-800 text-slate-850 dark:text-slate-150 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none transition font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Requested Date</label>
                      <input
                        type="datetime-local"
                        required
                        value={revRequestedDate}
                        onChange={(e) => setRevRequestedDate(e.target.value)}
                        className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-gray-250 dark:border-slate-800 text-slate-850 dark:text-slate-150 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none transition font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-505 dark:text-slate-400 uppercase mb-1">Revision Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Pending", "In Progress", "Completed"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setRevStatus(status)}
                          className={`py-2 text-xs font-bold rounded-xl border text-center transition cursor-pointer ${
                            revStatus === status
                              ? "bg-indigo-650 border-indigo-650 text-white shadow-sm"
                              : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {revStatus === "Completed" && (
                    <div className="animate-fade-in">
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Completion Date</label>
                      <input
                        type="datetime-local"
                        value={revCompletionDate}
                        onChange={(e) => setRevCompletionDate(e.target.value)}
                        placeholder="Default is current time"
                        className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-gray-250 dark:border-slate-800 text-slate-850 dark:text-slate-150 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none transition font-sans"
                      />
                      <p className="text-[9px] text-gray-450 mt-1">Leave blank to log current system timestamp.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Revision Notes / Change Brief</label>
                    <textarea
                      rows={3}
                      required
                      value={revNotes}
                      onChange={(e) => setRevNotes(e.target.value)}
                      placeholder="Specify granular instructions, quality failures, or client remarks..."
                      className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-gray-250 dark:border-slate-800 text-slate-850 dark:text-slate-150 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none transition font-sans leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/40">
                    <button
                      type="button"
                      onClick={() => setShowAddRevision(false)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-gray-505 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 bg-transparent transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingRevision}
                      className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingRevision ? "Saving..." : "Save Revision Record"}
                    </button>
                  </div>
                </form>
              )}

              {/* Revision History Logs */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase text-gray-450 dark:text-slate-500 tracking-widest block">Revision Registry Logs</span>
                
                {revisionsList.length === 0 ? (
                  <p className="text-[11px] italic text-gray-400 dark:text-slate-500 py-3.5 text-center bg-slate-50/50 dark:bg-slate-950/10 rounded-xl border border-dashed border-gray-150 dark:border-slate-855 leading-normal">
                    This job contract has no revision assignments on record.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-3 pr-1.5 custom-scrollbar">
                    {revisionsList.map((item) => (
                      <div key={item.id} className="p-3.5 bg-white dark:bg-slate-900/40 border border-gray-150/70 dark:border-slate-800/80 rounded-2xl text-[11px] relative flex flex-col gap-3 shadow-sm hover:border-gray-200 dark:hover:border-slate-705 transition">
                        
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 leading-none">
                              <span className="font-extrabold text-slate-805 dark:text-slate-200 text-sm">Revision #{item.revisionNumber}</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                item.status === "Completed"
                                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-110 dark:border-emerald-900/40"
                                  : item.status === "In Progress"
                                  ? "bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-110 dark:border-sky-900/40"
                                  : "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-110 dark:border-amber-900/40"
                              }`}>
                                {item.status}
                              </span>
                            </div>
                            <p className="text-gray-405 dark:text-slate-500 text-[10px] leading-relaxed">
                              Requested by <span className="font-extrabold text-slate-700 dark:text-slate-350">{item.requestedBy}</span>
                              <span className="mx-1">•</span>
                              <span className="font-mono">{item.requestedDate ? format(new Date(item.requestedDate), "MMM dd, yyyy, hh:mm a") : "N/A"}</span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteRevision(item.id, item.revisionNumber)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-450 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg transition"
                            title="Delete revision record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="bg-slate-50/50 dark:bg-slate-950/30 p-2.5 rounded-xl border border-gray-100/40 dark:border-slate-800/40 text-[11px] leading-relaxed text-slate-740 dark:text-slate-300 font-sans whitespace-pre-wrap">
                          {item.revisionNotes}
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-3 mt-1">
                          <div>
                            {item.status === "Completed" && item.completionDate ? (
                              <p className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-bold">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Completed: {format(new Date(item.completionDate), "MMM dd, yyyy, hh:mm a")}</span>
                              </p>
                            ) : (
                              <p className="text-gray-400 dark:text-slate-500 italic">No completion timestamp logged.</p>
                            )}
                          </div>

                          {/* Quick inline state modifier */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Update:</span>
                            <div className="flex items-center bg-slate-50 dark:bg-slate-950/40 border border-gray-150 dark:border-slate-800 rounded-xl p-0.5 shadow-inner">
                              {(["Pending", "In Progress", "Completed"] as const).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => handleUpdateRevisionStatus(item.id, item, st)}
                                  className={`px-2 py-1 text-[9px] font-bold rounded-lg transition cursor-pointer ${
                                    item.status === st
                                      ? "bg-white dark:bg-slate-800 text-indigo-650 dark:text-indigo-400 shadow-sm"
                                      : "text-gray-450 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                  }`}
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Log Trail Timeline Section */}
            <div className="border-t border-gray-100 pt-5 mt-5">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-3.5">
                <History className="w-4 h-4 text-slate-400" />
                <span>Assignment History Trail</span>
              </h4>

              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-gray-450 border border-dashed border-gray-100 rounded-2xl bg-slate-50/30">
                  <Info className="w-5 h-5 text-gray-300 mb-1" />
                  <p className="text-[10px] font-bold">No historic edits logged yet</p>
                  <p className="text-[9px] text-gray-400">Assignment shifts will pop active chronological details here</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-44 overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div key={log.id} className="text-xs flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-gray-100/30">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-2"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2.5 text-[10px] font-bold text-gray-400 mb-0.5">
                          <span className="uppercase text-indigo-650">{log.role} Seat Shift</span>
                          <span className="font-medium font-mono">{getLogTimestamp(log.createdAt)}</span>
                        </div>
                        <p className="text-gray-650 font-medium">
                          Changed: <span className="font-extrabold text-slate-700">{log.previousAssigneeName}</span> 
                          <ArrowRight className="w-3.5 h-3.5 inline mx-1.5 text-gray-400" /> 
                          <span className="font-extrabold text-indigo-600">{log.newAssigneeName}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unified Job Activity Timeline */}
            <div className="border-t border-gray-105 dark:border-slate-800 pt-5 mt-5">
              <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3.5">
                <History className="w-4 h-4 text-indigo-600" />
                <span>Job Activity Timeline</span>
              </h4>

              {chronologicalActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center text-gray-450 border border-dashed border-gray-100 dark:border-slate-800 rounded-2xl bg-slate-50/10">
                  <Info className="w-5 h-5 text-gray-300 mb-1" />
                  <p className="text-[10px] font-bold">No timeline activities recorded yet</p>
                  <p className="text-[9px] text-gray-400">Actions like creation, assignments, and payments are logged here</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {chronologicalActivities.map((act) => (
                    <div key={act.id} className="text-xs flex gap-3 bg-slate-50/50 dark:bg-slate-950/20 p-2.5 rounded-xl border border-gray-100/30 dark:border-slate-800/50 relative hover:border-indigo-100 dark:hover:border-slate-700 transition">
                      <div className="flex flex-col items-center shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5"></div>
                        <div className="w-0.5 flex-1 bg-indigo-50 dark:bg-slate-850 my-1"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2.5 text-[9px] font-bold text-gray-400 dark:text-slate-505 mb-0.5">
                          <span className="uppercase text-indigo-650 dark:text-indigo-400 font-extrabold">{act.userName}</span>
                          <span className="font-medium font-mono text-gray-400">{getLogTimestamp(act.createdAt)}</span>
                        </div>
                        <p className="text-slate-750 dark:text-slate-300 font-bold text-[10px] leading-relaxed">
                          {act.action}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Modal Outer Footer Status indicator */}
        <div className="px-6 py-3 bg-slate-50 text-[10px] text-slate-400 border-t border-gray-100 flex justify-between items-center font-bold">
          <span>Active Session Assignment Audit Active</span>
          <span>Security Rules V2 Enforced</span>
        </div>
      </motion.div>

      {/* Slide-In Modal for creating new teammate */}
      <AnimatePresence>
        {showAddTeammate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in">
            <motion.form
              onSubmit={handleCreateTeammate}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-md border border-slate-100 dark:border-slate-800 relative"
            >
              <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2 mb-1.5">
                <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Onboard Team Member</span>
              </h3>
              <p className="text-[11px] text-gray-400 mb-5">Instantly introduce and assign a designated specialist.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-450 tracking-wider mb-1.5">SPECIALIST ROLE</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Writer", "Editor", "Quality Checker"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSelectedRoleForAdd(r)}
                        className={`py-2 px-1 text-[11px] font-bold rounded-xl border text-center transition cursor-pointer ${
                          selectedRoleForAdd === r 
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md dark:shadow-none" 
                            : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-650 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-450 dark:text-slate-400 tracking-wider mb-1.5">TEAMMATE NAME</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={newTeammateName}
                    onChange={(e) => setNewTeammateName(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-450 dark:text-slate-400 tracking-wider mb-1.5">EMAIL CONTACT</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 dark:text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. ramesh@freelancer.com"
                      value={newTeammateEmail}
                      onChange={(e) => setNewTeammateEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-450 dark:text-slate-400 tracking-wider mb-1.5">WHATSAPP / PHONE NUMBER</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs font-bold">+</span>
                    <input
                      type="tel"
                      placeholder="e.g. 919876543210 (include country code)"
                      value={newTeammatePhone}
                      onChange={(e) => setNewTeammatePhone(e.target.value.replace(/[^0-9]/g, ""))}
                      className="w-full pl-7 pr-4 py-2.5 text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-mono"
                    />
                  </div>
                  <p className="text-[9px] text-gray-400 leading-normal mt-1">Numbers only starting with country code. Used for deep-linked WhatsApp messages.</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3.5 border-t border-gray-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddTeammate(false)}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-705 text-gray-650 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 text-[11px] font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTeammate}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl shadow-md cursor-pointer transition flex items-center gap-1.5"
                >
                  {isSavingTeammate ? "Onboarding..." : "Add & Assign"}
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox File Preview Overlay Modal */}
      <AnimatePresence>
        {activePreviewFile && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-fade-in font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden w-full max-w-2xl border border-slate-100 dark:border-slate-800 flex flex-col max-h-[85vh]"
            >
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase bg-indigo-50 dark:bg-indigo-950 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/50">
                    {activePreviewFile.category}
                  </span>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white mt-1 select-all break-all">
                    {activePreviewFile.fileName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePreviewFile(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Dynamic content rendering based on file type */}
              <div className="p-6 overflow-y-auto flex-1 bg-slate-55/20 dark:bg-slate-950/10 min-h-[300px] flex flex-col items-center justify-center">
                {activePreviewFile.fileType.startsWith("image/") ? (
                  <div className="max-w-full max-h-[50vh] flex items-center justify-center rounded-2xl overflow-hidden shadow border border-slate-100/50">
                    <img 
                      src={activePreviewFile.fileData} 
                      alt={activePreviewFile.fileName} 
                      className="object-contain max-w-full max-h-full"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : activePreviewFile.fileType.startsWith("text/") || 
                    activePreviewFile.fileName.endsWith(".json") || 
                    activePreviewFile.fileName.endsWith(".md") || 
                    activePreviewFile.fileName.endsWith(".txt") ? (
                  <div className="w-full bg-slate-900/5 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-850 font-mono text-xs text-slate-700 dark:text-slate-300 overflow-x-auto text-left whitespace-pre-wrap whitespace-break-spaces max-h-[50vh] leading-relaxed">
                    {(() => {
                      try {
                        const parts = activePreviewFile.fileData.split(",");
                        if (parts.length > 1) {
                          return atob(parts[1]);
                        }
                        return "Failed to parse text content.";
                      } catch (err) {
                        return "Binary or encoded file content preview is not available in plain text. Please use Download instead.";
                      }
                    })()}
                  </div>
                ) : (
                  <div className="text-center p-8 border border-dashed border-gray-200 dark:border-slate-800 rounded-3xl bg-white/60 dark:bg-slate-900/50 max-w-md">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-650 dark:text-indigo-300 flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-indigo-900/50">
                      <FileText className="w-7 h-7" />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-white mb-2">Extended Format Preview</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                      This file format is binary or does not support inline rendering. Download the file to view it locally using your default system reader.
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-[10px] text-left border-t border-slate-100 dark:border-slate-800 pt-4 mb-5 text-slate-600 dark:text-slate-400">
                      <div>
                        <span className="font-bold text-gray-400 block uppercase mb-0.5">Mime Type</span>
                        <span className="font-mono truncate block font-bold">{activePreviewFile.fileType}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-400 block uppercase mb-0.5">File Size</span>
                        <span className="font-mono font-bold block">{(activePreviewFile.fileSize / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-gray-100 dark:border-slate-850/80 flex justify-between items-center text-xs font-bold text-gray-400">
                <div className="text-left leading-normal text-[9px]">
                  <span>Uploaded by <span className="text-indigo-650 dark:text-indigo-400">{activePreviewFile.uploadedBy}</span></span>
                  <span className="block mt-0.5">Date: {getLogTimestamp(activePreviewFile.createdAt)}</span>
                </div>
                <a
                  href={activePreviewFile.fileData}
                  download={activePreviewFile.fileName}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download File</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
