import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Bell, 
  Check, 
  Trash2, 
  Clock, 
  AlertTriangle, 
  Sparkles, 
  CheckSquare, 
  X,
  CreditCard,
  Inbox,
  AlertCircle
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  writeBatch,
  Timestamp
} from "firebase/firestore";
import { useCollection } from "react-firebase-hooks/firestore";
import { db, auth, OperationType, handleFirestoreError } from "../firebase";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  userId: string;
  type: "job_due_24h" | "payment_overdue" | "new_job" | "checklist_incomplete";
  createdAt: any;
  referenceId?: string;
  referenceType?: "job" | "invoice";
}

interface NotificationsBellProps {
  jobs: any[];
}

export default function NotificationsBell({ jobs }: NotificationsBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const user = auth.currentUser;

  // Real-time fetch of notifications
  const notificationsQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
  }, [user?.uid]);

  const [notificationsSnapshot, loading] = useCollection(notificationsQuery);

  const notifications = useMemo(() => {
    return notificationsSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    })) as Notification[] || [];
  }, [notificationsSnapshot]);

  // Real-time fetch of invoices to monitor overdue payments
  const invoicesQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "invoices"),
      where("userId", "==", user.uid)
    );
  }, [user?.uid]);

  const [invoicesSnapshot] = useCollection(invoicesQuery);

  const invoices = useMemo(() => {
    return invoicesSnapshot?.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    })) as any[] || [];
  }, [invoicesSnapshot]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // Background Evaluation Scanner: Runs periodically or when jobs/invoices load
  useEffect(() => {
    if (!user?.uid || loading || jobs.length === 0) return;

    // Throttle or prevent excessive writes with existing notification registry
    const existingRegistry = new Set(
      notifications.map((n) => `${n.type}_${n.referenceId}`)
    );

    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");

    const batchToCreate: Omit<Notification, "id">[] = [];

    // 1. Job due within 24 hours & 4. Checklist incomplete near deadline
    jobs.forEach((job) => {
      if (!job.deadline || job.status === "Completed") return;

      const deadlineDate = new Date(job.deadline);
      const diffHours = differenceInHours(deadlineDate, now);

      // Check for Job Due Within 24h
      if (diffHours >= 0 && diffHours <= 24) {
        const key = `job_due_24h_${job.id}`;
        if (!existingRegistry.has(key)) {
          batchToCreate.push({
            title: "Job Due Soon!",
            message: `"${job.jobName || job.jobCode}" is due within 24 hours (${format(deadlineDate, "MMM d, h:mm a")})!`,
            read: false,
            userId: user.uid,
            type: "job_due_24h",
            referenceId: job.id,
            referenceType: "job",
            createdAt: Timestamp.now()
          });
        }
      }

      // Check for Checklist incomplete near deadline (48 Hours threshold)
      if (diffHours >= 0 && diffHours <= 48 && job.useChecklist && job.checklist) {
        const incompleteCount = job.checklist.filter((item: any) => !item.completed).length;
        if (incompleteCount > 0) {
          const key = `checklist_incomplete_${job.id}`;
          if (!existingRegistry.has(key)) {
            batchToCreate.push({
              title: "Checklist Incomplete",
              message: `"${job.jobName || job.jobCode}" has ${incompleteCount} unfinished checklist items with less than 48 hours remaining.`,
              read: false,
              userId: user.uid,
              type: "checklist_incomplete",
              referenceId: job.id,
              referenceType: "job",
              createdAt: Timestamp.now()
            });
          }
        }
      }
    });

    // 2. Payment Overdue Scanner
    invoices.forEach((invoice) => {
      if (invoice.status === "Paid" || !invoice.dueDate) return;

      const dueDateObj = new Date(invoice.dueDate);
      // If past due date and not marked paid, mark as overdue / alert
      if (dueDateObj < now) {
        const key = `payment_overdue_${invoice.id}`;
        if (!existingRegistry.has(key)) {
          batchToCreate.push({
            title: "Remittance Overdue",
            message: `Invoice #${invoice.invoiceNumber} for client "${invoice.client}" is past due on invoice date ${format(dueDateObj, "MMM d, yyyy")}.`,
            read: false,
            userId: user.uid,
            type: "payment_overdue",
            referenceId: invoice.id,
            referenceType: "invoice",
            createdAt: Timestamp.now()
          });
        }
      }
    });

    // Write all detected batch elements to database
    if (batchToCreate.length > 0) {
      const deployBatch = async () => {
        try {
          // Add them sequentially or use separate writes without breaking transactional constraints
          for (const item of batchToCreate) {
            await addDoc(collection(db, "notifications"), item);
          }
        } catch (e) {
          console.error("Failed to generate background system notifications:", e);
        }
      };
      deployBatch();
    }
  }, [jobs, invoices, notifications, user?.uid, loading]);

  // Click outside listener to collapse dropdown automatically
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Action: Mark single notification as read
  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  // Action: Mark all notifications as read using Batch operation
  const handleMarkAllAsRead = async () => {
    const unreadNotifications = notifications.filter((n) => !n.read);
    if (unreadNotifications.length === 0) return;

    try {
      const batch = writeBatch(db);
      unreadNotifications.forEach((n) => {
        const ref = doc(db, "notifications", n.id);
        batch.update(ref, { read: true });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "notifications/batch-read");
    }
  };

  // Action: Delete single notification
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
    }
  };

  // Action: Clear/Delete all notifications of the user
  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        const ref = doc(db, "notifications", n.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "notifications/batch-clear");
    }
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "job_due_24h":
        return (
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-4 h-4 animate-pulse" />
          </div>
        );
      case "payment_overdue":
        return (
          <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
            <CreditCard className="w-4 h-4" />
          </div>
        );
      case "checklist_incomplete":
        return (
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <CheckSquare className="w-4 h-4" />
          </div>
        );
      case "new_job":
        return (
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <Sparkles className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="p-2.5 bg-gray-50 text-gray-600 rounded-xl">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
    }
  };

  const getFormatDate = (createdAt: any) => {
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
      return formatDistanceToNow(dateObj, { addSuffix: true });
    } catch (e) {
      return "Recently";
    }
  };

  return (
    <div id="notifications-bell-wrapper" className="relative" ref={dropdownRef}>
      {/* Trigger Button with Badge Counter */}
      <button
        id="btn-notifications-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl border transition-all duration-200 outline-none hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer ${
          isOpen 
            ? "border-indigo-200 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200" 
            : "border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-slate-50"
        }`}
        title="App Notifications"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? "animate-swing" : ""}`} />
        
        {unreadCount > 0 && (
          <motion.span
            id="notifications-badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-extrabold text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-md cursor-pointer pointer-events-none"
          >
            {unreadCount}
          </motion.span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="notifications-panel-dropdown"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2.5 w-[360px] sm:w-[400px] bg-white rounded-2xl border border-gray-150 shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-5 py-4.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <span>Workspace Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-rose-100 text-rose-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {unreadCount} New
                    </span>
                  )}
                </h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Automated pipeline alerts and status audits</p>
              </div>
              <button 
                id="btn-close-notifications"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Header Operations Controls */}
            {notifications.length > 0 && (
              <div className="px-5 py-2.5 bg-indigo-50/50 border-b border-gray-100 flex justify-between items-center text-xs">
                <button
                  id="btn-mark-all-read"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadCount === 0}
                  className="text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 font-extrabold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
                <button
                  id="btn-clear-all"
                  onClick={handleClearAll}
                  className="text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear all</span>
                </button>
              </div>
            )}

            {/* List Body */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100 divide-dashed list-none p-0 m-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-3"></div>
                  <span className="text-xs font-medium">Checking active channels...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="bg-slate-50 p-4 rounded-full mb-3.5 text-slate-300">
                    <Inbox className="w-8 h-8" />
                  </div>
                  <h5 className="text-xs font-bold text-gray-600">Pure Serenity</h5>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-[240px]">
                    All milestones are intact. Background pipelines report complete structural compliance.
                  </p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 flex gap-3.5 transition-colors relative group/row border-l-3 ${
                      notif.read 
                        ? "bg-white border-l-transparent" 
                        : "bg-indigo-50/30 border-l-indigo-500"
                    }`}
                  >
                    {/* Visual Status Indicator Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notif.type)}
                    </div>

                    {/* Meta textual context */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-xs block truncate ${notif.read ? "font-bold text-slate-700" : "font-black text-slate-900"}`}>
                          {notif.title}
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 flex-shrink-0">
                          {getFormatDate(notif.createdAt)}
                        </span>
                      </div>
                      <p className={`text-[11px] leading-relaxed mt-1 break-words ${notif.read ? "text-gray-500" : "text-gray-700 font-medium"}`}>
                        {notif.message}
                      </p>
                    </div>

                    {/* Float item action buttons */}
                    <div className="absolute right-3.5 top-3.5 flex items-center gap-1.5 opacity-60 group-hover/row:opacity-100 transition-opacity">
                      {!notif.read && (
                        <button
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          className="p-1 rounded bg-white hover:bg-indigo-100 hover:text-indigo-700 border border-gray-100 shadow-sm text-gray-400 transition-colors cursor-pointer"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(notif.id, e)}
                        className="p-1 rounded bg-white hover:bg-rose-100 hover:text-rose-700 border border-gray-100 shadow-sm text-gray-400 transition-colors cursor-pointer"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Workspace Telemetry */}
            <div className="px-5 py-3 border-t border-gray-100 bg-slate-50 text-[10px] text-gray-400 text-center font-bold">
              Secure Audits Sandbox Connected
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
