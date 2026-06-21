import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { db, auth, OperationType, handleFirestoreError } from "../firebase";
import { doc, updateDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { format } from "date-fns";
import { Calendar, FileText, DollarSign, Trash2, ListTodo, Plus, ChevronDown, ChevronUp, CheckSquare, Square } from "lucide-react";
import { cn } from "../lib/utils";

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
}

interface KanbanBoardProps {
  jobs: Job[];
  onDeleteJob: (id: string) => void;
  onClientClick?: (clientCode: string) => void;
  onJobClick?: (job: Job) => void;
}

const COLUMNS = ["Todo", "In Progress", "Review", "Completed"];

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "req_rec", text: "Requirement Received", completed: false },
  { id: "writ_asg", text: "Writer Assigned", completed: false },
  { id: "writ_sub", text: "Writer Submitted", completed: false },
  { id: "qc_comp", text: "Quality Check Completed", completed: false },
  { id: "del_cli", text: "Delivered To Client", completed: false },
  { id: "pay_rec", text: "Payment Received", completed: false },
];

export const getDeadlineStatus = (deadlineStr?: string, status?: string) => {
  if (!deadlineStr) return null;
  if (status === "Completed") {
    return {
      label: "Completed",
      color: "green",
      bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-405 border border-emerald-200/50",
      text: "text-emerald-700",
      dotClass: "bg-emerald-500"
    };
  }
  const deadlineDate = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    return {
      label: "Overdue",
      color: "red",
      bg: "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-405 border border-rose-200/50",
      text: "text-rose-700",
      dotClass: "bg-red-500"
    };
  } else if (diffHours <= 48) {
    return {
      label: "Due < 48h",
      color: "yellow",
      bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-405 border border-amber-200/50",
      text: "text-amber-700",
      dotClass: "bg-amber-500"
    };
  } else {
    return {
      label: "On Track",
      color: "green",
      bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-405 border border-emerald-200/50",
      text: "text-emerald-700",
      dotClass: "bg-emerald-500"
    };
  }
};

const KanbanBoard: React.FC<KanbanBoardProps> = ({ jobs, onDeleteJob, onClientClick, onJobClick }) => {
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  const toggleExpandJob = (jobId: string) => {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  const handleToggleChecklistItem = async (jobId: string, itemId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const currentChecklist = (job.checklist && job.checklist.length > 0)
      ? job.checklist
      : DEFAULT_CHECKLIST;

    const toggledItem = currentChecklist.find((item) => item.id === itemId);
    const updatedChecklist = currentChecklist.map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );

    try {
      await updateDoc(doc(db, "jobs", jobId), { checklist: updatedChecklist });

      // Automatically record checklist update activity
      if (toggledItem) {
        try {
          const isNowCompleted = !toggledItem.completed;
          const userObj = auth.currentUser;
          await addDoc(collection(db, "job_activities"), {
            jobId,
            action: `Checklist Updated: '${toggledItem.text}' marked as ${isNowCompleted ? "Completed" : "Incomplete"}`,
            userName: userObj?.displayName || userObj?.email?.split('@')[0] || "User",
            userEmail: userObj?.email || "unknown@system.local",
            userId: userObj?.uid || "",
            createdAt: serverTimestamp()
          });
        } catch (actErr) {
          console.error("Failed to log checklist activity:", actErr);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const updateJobStatus = async (jobId: string, newStatus: string) => {
    try {
      const job = jobs.find((j) => j.id === jobId);
      const previousStatus = job ? job.status : "Todo";
      
      const updateData: any = { status: newStatus };
      if (newStatus === "Completed") {
        updateData.completedAt = new Date().toISOString();
      } else {
        updateData.completedAt = null;
      }
      
      await updateDoc(doc(db, "jobs", jobId), updateData);

      // Automatically record status update activity
      try {
        const userObj = auth.currentUser;
        const actionLabel = newStatus === "Completed" 
          ? "Job Completed" 
          : `Job Updated: Changed pipeline stage from '${previousStatus}' to '${newStatus}'`;
        
        await addDoc(collection(db, "job_activities"), {
          jobId,
          action: actionLabel,
          userName: userObj?.displayName || userObj?.email?.split('@')[0] || "User",
          userEmail: userObj?.email || "unknown@system.local",
          userId: userObj?.uid || "",
          createdAt: serverTimestamp()
        });
      } catch (actErr) {
        console.error("Failed to log status proposed activity:", actErr);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    updateJobStatus(draggableId, destination.droppableId);
  };

  const getJobsByStatus = (status: string) => jobs.filter((job) => job.status === status);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full min-h-[600px]">
        {COLUMNS.map((column) => (
          <div key={column} className="flex flex-col gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-700 flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  column === "Todo" && "bg-gray-400",
                  column === "In Progress" && "bg-blue-500",
                  column === "Review" && "bg-orange-500",
                  column === "Completed" && "bg-green-500"
                )} />
                {column}
              </h3>
              <span className="text-xs font-medium text-gray-400 bg-white px-2 py-1 rounded-full border border-gray-100">
                {getJobsByStatus(column).length}
              </span>
            </div>

            <Droppable droppableId={column}>
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={cn(
                    "flex-1 flex flex-col gap-3 min-h-[150px] transition-colors rounded-lg p-1",
                    snapshot.isDraggingOver && "bg-indigo-50/50"
                  )}
                >
                  {getJobsByStatus(column).map((job, index) => (
                    <div key={job.id}>
                      <Draggable draggableId={job.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (
                              target.closest("button") || 
                              target.closest("select") || 
                              target.closest("input") || 
                              target.closest("[role='button']")
                            ) {
                              return;
                            }
                            onJobClick?.(job);
                          }}
                          className={cn(
                            "bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-200 transition-all group relative cursor-pointer",
                            snapshot.isDragging && "shadow-lg border-indigo-300 ring-2 ring-indigo-100"
                          )}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex flex-col gap-1 flex-grow">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => onClientClick?.(job.clientCode)}
                                  className="text-xs font-bold text-indigo-600 uppercase tracking-wider hover:underline text-left"
                                >
                                  {job.clientCode}
                                </button>
                                {job.jobCode && (
                                  <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono font-bold tracking-tight">
                                    {job.jobCode}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 mt-1">
                                {job.jobName || "Untitled Job"}
                              </h4>
                              <p className="text-xs font-medium text-gray-500">
                                {job.wordCount.toLocaleString()} words
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <select
                                value={job.status}
                                onChange={(e) => updateJobStatus(job.id, e.target.value)}
                                className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 border-none rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                              >
                                {COLUMNS.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => onDeleteJob(job.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete Job"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="space-y-1.5 bg-gray-50/50 dark:bg-slate-900/30 p-2.5 rounded-lg border border-gray-100 dark:border-slate-800 text-[11px]">
                              {job.startDate && (
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-gray-400">Start Date:</span>
                                  <span className="font-mono text-gray-650">{format(new Date(job.startDate), "MMM d, h:mm a")}</span>
                                </div>
                              )}

                              {(job.internalDeadline || job.deadline) && (() => {
                                const targetDl = job.internalDeadline || job.deadline;
                                const statusInfo = getDeadlineStatus(targetDl, job.status);
                                return (
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-semibold text-gray-400">Internal DL:</span>
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono text-gray-700 font-medium">{format(new Date(targetDl), "MMM d, h:mm a")}</span>
                                      {statusInfo && (
                                        <span className={cn("text-[9px] font-bold px-1 py-0.2 rounded-md", statusInfo.bg)}>
                                          {statusInfo.label}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}

                              {(job.clientDeadline || job.deadline) && (() => {
                                const targetDl = job.clientDeadline || job.deadline;
                                const statusInfo = getDeadlineStatus(targetDl, job.status);
                                return (
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-semibold text-gray-400 font-bold">Client DL:</span>
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono text-indigo-750 font-bold">{format(new Date(targetDl), "MMM d, h:mm a")}</span>
                                      {statusInfo && (
                                        <span className={cn("text-[9px] font-bold px-1 py-0.2 rounded-md", statusInfo.bg)}>
                                          {statusInfo.label}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>₹{(job.wordCount * job.rate).toFixed(2)} (₹{job.rate}/w)</span>
                            </div>

                            {/* Assignee Badges */}
                            {(job.assignedWriterName || job.assignedEditorName || job.assignedQCName) && (
                              <div className="flex gap-1.5 flex-wrap pt-1.5 text-[10px] font-bold">
                                {job.assignedWriterName && (
                                  <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md border border-sky-100" title={`Writer: ${job.assignedWriterName}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                    <span className="font-semibold text-gray-400">W:</span> {job.assignedWriterName.split(" ")[0]}
                                  </span>
                                )}
                                {job.assignedEditorName && (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100" title={`Editor: ${job.assignedEditorName}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    <span className="font-semibold text-gray-400">E:</span> {job.assignedEditorName.split(" ")[0]}
                                  </span>
                                )}
                                {job.assignedQCName && (
                                  <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md border border-violet-100" title={`QC: ${job.assignedQCName}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                                    <span className="font-semibold text-gray-400">Q:</span> {job.assignedQCName.split(" ")[0]}
                                  </span>
                                )}
                              </div>
                            )}

                            {job.notes && (
                              <div className="flex items-start gap-2 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
                                <FileText className="w-3.5 h-3.5 mt-0.5" />
                                <p className="line-clamp-2 italic">{job.notes}</p>
                              </div>
                            )}

                            {/* Job Checklist Interface */}
                            {(() => {
                              const checklistItems = (job.checklist && job.checklist.length > 0)
                                ? job.checklist
                                : DEFAULT_CHECKLIST;
                              const completedCount = checklistItems.filter(i => i.completed).length;
                              const totalCount = checklistItems.length;
                              const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                              const isExpanded = expandedJobs[job.id] ?? true;

                              return (
                                <div className="mt-4 pt-3 border-t border-gray-100 space-y-2.5">
                                  <div 
                                    onClick={() => toggleExpandJob(job.id)}
                                    className="flex items-center justify-between text-xs text-gray-500 font-semibold cursor-pointer group hover:text-indigo-600 select-none"
                                  >
                                    <span className="flex items-center gap-1.5 font-bold">
                                      <ListTodo className="w-3.5 h-3.5 text-indigo-505" />
                                      <span>Checklist</span>
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10.5px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold tracking-tight">
                                        {completedCount} of {totalCount} completed ({progressPercent}%)
                                      </span>
                                      {isExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                                      ) : (
                                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                                      )}
                                    </div>
                                  </div>

                                  {/* Progress Bar */}
                                  <div 
                                    onClick={() => toggleExpandJob(job.id)}
                                    className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden cursor-pointer"
                                  >
                                    <div 
                                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>

                                  {/* Expanded Items */}
                                  {isExpanded && (
                                    <div className="pt-1.5 space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                                      {checklistItems.map((item) => (
                                        <div 
                                          key={item.id} 
                                          className="flex items-center justify-between gap-2 group/item"
                                        >
                                          <button
                                            onClick={() => handleToggleChecklistItem(job.id, item.id)}
                                            className="flex items-start gap-2 text-left text-xs font-semibold text-gray-650 hover:text-gray-900 transition-colors flex-1 py-0.5"
                                          >
                                            {item.completed ? (
                                              <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 fill-emerald-50/20" />
                                            ) : (
                                              <Square className="w-4 h-4 text-gray-300 hover:text-indigo-505 shrink-0 mt-0.5" />
                                            )}
                                            <span className={cn(
                                              "break-all mt-0.5 leading-tight",
                                              item.completed && "line-through text-gray-400 font-normal"
                                            )}>
                                              {item.text}
                                            </span>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  </div>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
};

export default KanbanBoard;
