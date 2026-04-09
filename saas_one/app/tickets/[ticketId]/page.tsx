"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/frontend/utils/supabase/client";
import {
  ArrowLeft,
  Clock,
  Calendar,
  MapPin,
  User,
  CheckCircle2,
  AlertCircle,
  Camera,
  Paperclip,
  Send,
  PauseCircle,
  PlayCircle,
  Forward,
  XCircle,
  ShieldAlert,
  History,
  Activity,
  ChevronRight,
  MessageSquare,
  Tag,
  Navigation2,
  Building2,
  Plus,
  MoreHorizontal,
  Share2,
  AlertTriangle,
  Sparkles,
  Brain,
  Pencil,
  X,
  RefreshCw,
  Trash2,
  PackagePlus,
  Mic,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { compressImage } from "@/frontend/utils/image-compression";
import { useTheme } from "@/frontend/context/ThemeContext";
import MediaCaptureModal, {
  type MediaFile,
} from "@/frontend/components/shared/MediaCaptureModal";
import VideoPreviewModal from "@/frontend/components/shared/VideoPreviewModal";
import ShareModal from "@/frontend/components/shared/ShareModal";
import { playTickleSound } from "@/frontend/utils/sounds";

// Types
interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status:
    | "open"
    | "assigned"
    | "in_progress"
    | "blocked"
    | "resolved"
    | "closed"
    | "waitlist"
    | "pending_validation";
  priority: string;
  category?: { name: string; code: string };
  skill_group?: { name: string; code: string };
  created_at: string;
  assigned_at?: string;
  work_started_at?: string;
  resolved_at?: string;
  closed_at?: string;
  sla_deadline?: string;
  sla_breached: boolean;
  location?: string;
  floor_number?: number;
  photo_before_url?: string;
  photo_after_url?: string;
  video_before_url?: string;
  video_after_url?: string;
  raised_by: string;
  created_by?: string; // Support both for safety
  assigned_to?: string;
  property_id: string;
  property?: { name: string };
  creator?: { id: string; full_name: string; email: string };
  assignee?: { id: string; full_name: string; email: string };
  current_escalation_level?: number;
  hierarchy_id?: string | null;
  escalation_paused?: boolean;
}

interface Activity {
  id: string;
  action: string;
  created_at: string;
  user?: { full_name: string };
  old_value?: string;
  new_value?: string;
}

interface EscalationLog {
  id: string;
  from_level: number;
  to_level: number | null;
  reason: string;
  escalated_at: string;
  from_employee?: { full_name: string; user_photo_url?: string | null } | null;
  to_employee?: { full_name: string; user_photo_url?: string | null } | null;
}

interface Comment {
  id: string;
  comment: string;
  created_at: string;
  user_id: string;
  is_internal: boolean;
  user?: { full_name: string; user_photo_url?: string };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  // Guard: if ticketId is not a valid UUID (e.g. /tickets/requests), redirect away
  if (typeof ticketId === "string" && !UUID_REGEX.test(ticketId)) {
    router.replace("/");
    return null;
  }
  const { theme } = useTheme();
  const supabase = createClient();

  // State
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [escalationLogs, setEscalationLogs] = useState<EscalationLog[]>([]);
  const [userRole, setUserRole] = useState<
    "admin" | "staff" | "tenant" | "mst" | "procurement" | null
  >(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Reassign State
  const [resolvers, setResolvers] = useState<any[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedResolver, setSelectedResolver] = useState<string>("");

  // Procurement State
  const [procurementUsers, setProcurementUsers] = useState<any[]>([]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [materialItems, setMaterialItems] = useState([
    { name: "", quantity: 1, notes: "" },
  ]);
  const [selectedProcurementId, setSelectedProcurementId] = useState("");
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [submittingMaterial, setSubmittingMaterial] = useState(false);

  // Creator Role State
  const [creatorRole, setCreatorRole] = useState<string>("Tenant");
  const [assigneeRole, setAssigneeRole] = useState<string>("MST");

  // Notification State
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isUpdatingContent, setIsUpdatingContent] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});

  // Validation State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [validationEnabled, setValidationEnabled] = useState(true);

  // Camera Modal State
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewVideoTitle, setPreviewVideoTitle] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [peekUrl, setPeekUrl] = useState<string | null>(null);
  const peekTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCameraType, setActiveCameraType] = useState<
    "before" | "after" | null
  >(null);

  function startPeek(url: string) {
    peekTimerRef.current = setTimeout(() => setPeekUrl(url), 350);
  }
  function endPeek() {
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    setPeekUrl(null);
  }

  // Initial Fetch
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      await fetchTicketDetails(user.id);
    };
    init();

    // Realtime Subscription
    const channel = supabase
      .channel("ticket_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `id=eq.${ticketId}`,
        },
        () => fetchTicketDetails(userId, true),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_comments",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          fetchComments(); // Refetch to get user details
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_activity_log",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => fetchActivities(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  const showToast = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchTicketDetails = async (
    currentUserId: string | null = userId,
    skipRoleCheck = false,
  ) => {
    try {
      // Fetch Ticket
      const { data: t, error } = await supabase
        .from("tickets")
        .select(
          `
                    *,
                    category:issue_categories(name, code),
                    skill_group:skill_groups(name, code),
                    property:properties(name),
                    creator:users!raised_by(id, full_name, email),
                    assignee:users!assigned_to(id, full_name, email)
                `,
        )
        .eq("id", ticketId)
        .maybeSingle();

      if (error) throw error;
      if (!t) throw { message: "Ticket not found", code: "NOT_FOUND" };
      setTicket(t);

      if (t.property_id) {
        fetchResolvers(t.property_id);
        // Check if validation is enabled for this property
        try {
          const featRes = await fetch(
            `/api/properties/${t.property_id}/features`,
          );
          if (featRes.ok) {
            const featData = await featRes.json();
            const valFeature = featData.features?.find(
              (f: any) => f.feature_key === "ticket_validation",
            );
            setValidationEnabled(valFeature ? valFeature.is_enabled : true);
          }
        } catch (e) {
          console.error("Error fetching property features:", e);
        }
      }

      // Fetch creator's role from property_memberships
      if (t.raised_by && t.property_id) {
        const { data: creatorMembership } = await supabase
          .from("property_memberships")
          .select("role")
          .eq("user_id", t.raised_by)
          .eq("property_id", t.property_id)
          .maybeSingle();

        if (creatorMembership?.role) {
          const formattedRole =
            creatorMembership.role === "mst"
              ? "MST"
              : creatorMembership.role
                  .split("_")
                  .map(
                    (word: string) =>
                      word.charAt(0).toUpperCase() + word.slice(1),
                  )
                  .join(" ");
          setCreatorRole(formattedRole);
        } else {
          setCreatorRole("Tenant");
        }
      }

      // Fetch assignee's role from property_memberships
      if (t.assigned_to && t.property_id) {
        const { data: assigneeMembership } = await supabase
          .from("property_memberships")
          .select("role")
          .eq("user_id", t.assigned_to)
          .eq("property_id", t.property_id)
          .maybeSingle();

        if (assigneeMembership?.role) {
          const formattedRole =
            assigneeMembership.role === "mst"
              ? "MST"
              : assigneeMembership.role
                  .split("_")
                  .map(
                    (word: string) =>
                      word.charAt(0).toUpperCase() + word.slice(1),
                  )
                  .join(" ");
          setAssigneeRole(formattedRole);
        } else {
          setAssigneeRole("MST");
        }
      }

      if (!skipRoleCheck && currentUserId) {
        await determineUserRole(currentUserId, t.property_id);
        fetchResolvers(t.property_id);
      }

      fetchProcurementUsers();
      await Promise.all([
        fetchActivities(),
        fetchComments(),
        fetchEscalationLogs(),
      ]);
    } catch (err: any) {
      // Supabase errors have non-enumerable props — extract them explicitly
      const msg =
        err?.message ||
        err?.error_description ||
        err?.details ||
        JSON.stringify(err);
      const code = err?.code || "";
      console.error("Error loading ticket:", code, msg, err);
      setFetchError(`${code ? `[${code}] ` : ""}${msg || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCommentChange = (e: any) => {
    const val = e.target.value;
    setCommentText(val);

    // Simple @ mention detection
    if (val.includes("@")) {
      const lastWord = val.split(" ").pop();
      if (lastWord && lastWord.startsWith("@")) {
        setMentionSearch(lastWord.substring(1).toLowerCase());
      } else {
        setMentionSearch(null);
      }
    } else {
      setMentionSearch(null);
    }
  };

  const handleSubmitMaterial = async () => {
    if (
      !selectedProcurementId ||
      materialItems.some((i) => !i.name || i.quantity < 1)
    )
      return;
    setSubmittingMaterial(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignee_uid: selectedProcurementId,
          items: materialItems,
        }),
      });
      if (res.ok) {
        setShowMaterialModal(false);
        setMaterialItems([{ name: "", quantity: 1, notes: "" }]);
        fetchComments();
        setNotification({
          message: "Material request dispatched",
          type: "success",
        });
      }
    } catch (e) {
      console.error("Material request error", e);
    } finally {
      setSubmittingMaterial(false);
    }
  };

  const determineUserRole = async (uid: string, propertyId: string) => {
    // Check Admin (Org or Property)
    const { data: orgMember } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("user_id", uid)
      .in("role", ["master_admin", "org_super_admin"])
      .maybeSingle();

    if (orgMember) {
      setUserRole("admin");
      return;
    }

    const { data: propMember } = await supabase
      .from("property_memberships")
      .select("role")
      .eq("user_id", uid)
      .eq("property_id", propertyId)
      .maybeSingle();

    if (propMember?.role === "property_admin") {
      setUserRole("admin");
    } else if (propMember?.role?.toLowerCase() === "procurement") {
      setUserRole("procurement");
    } else if (
      propMember &&
      [
        "mst",
        "staff",
        "technician",
        "fe",
        "se",
        "bms_operator",
        "security",
        "concierge",
      ].includes(propMember.role)
    ) {
      const role = (propMember.role as string) === "mst" ? "mst" : "staff";
      setUserRole(role);
      // Fetch skills for specialized permissions
      const { data: skills } = await supabase
        .from("mst_skills")
        .select("skill_code")
        .eq("user_id", uid);
      if (skills) {
        setUserSkills(skills.map((s) => s.skill_code));
      }
    } else {
      setUserRole("tenant");
    }
  };

  const fetchActivities = async () => {
    const { data } = await supabase
      .from("ticket_activity_log")
      .select("*, user:user_id(full_name)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });

    if (data) {
      setActivities(data);

      // Resolve names for UUIDs in new_value/old_value
      const idsToResolve = new Set<string>();
      data.forEach((act) => {
        if (act.action === "assigned" || act.action === "reassigned") {
          if (
            act.new_value &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              act.new_value,
            )
          ) {
            idsToResolve.add(act.new_value);
          }
          if (
            act.old_value &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              act.old_value,
            )
          ) {
            idsToResolve.add(act.old_value);
          }
        }
      });

      if (idsToResolve.size > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", Array.from(idsToResolve));

        if (users) {
          const newMap = { ...userNameMap };
          users.forEach((u) => {
            newMap[u.id] = u.full_name;
          });
          setUserNameMap(newMap);
        }
      }
    }
  };

  const fetchComments = async () => {
    const { data } = await supabase
      .from("ticket_comments")
      .select("*, user:user_id(full_name)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setComments(data || []);
  };

  const fetchEscalationLogs = async () => {
    const { data } = await supabase
      .from("ticket_escalation_logs")
      .select(
        `*, from_employee:users!from_employee_id(id, full_name), to_employee:users!to_employee_id(id, full_name)`,
      )
      .eq("ticket_id", ticketId)
      .order("escalated_at", { ascending: true });
    setEscalationLogs(data || []);
  };

  const fetchResolvers = async (propId: string) => {
    const { data, error } = await supabase
      .from("property_memberships")
      .select(
        `
                user_id,
                role,
                user:users!user_id(id, full_name)
            `,
      )
      .eq("property_id", propId)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching resolvers:", error);
      return;
    }

    if (data) {
      const unique = [];
      const seen = new Set();
      for (const r of data) {
        if (r.user && !seen.has(r.user_id)) {
          seen.add(r.user_id);
          unique.push(r);
        }
      }
      // Sort unique list alphabetically by full_name
      unique.sort((a: any, b: any) => {
        const nameA = a.user?.full_name || "";
        const nameB = b.user?.full_name || "";
        return nameA.localeCompare(nameB);
      });
      setResolvers(unique);
    } else {
      setResolvers([]);
    }
  };

  const fetchProcurementUsers = async () => {
    try {
      const res = await fetch("/api/procurement/users");
      if (res.ok) {
        const data = await res.json();
        setProcurementUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch procurement users", e);
    }
  };

  // Actions
  const handleStatusChange = async (newStatus: string) => {
    if (!ticket) return;

    // MST Close Validation - Photos are now optional per user request
    /*
        if (newStatus === 'closed' && userRole === 'staff') {
            if (!ticket.photo_before_url || !ticket.photo_after_url) {
                const proceed = window.confirm('⚠️ You haven’t attached before/after photos. Do you want to proceed?');
                if (!proceed) return;
            }
        }
        */

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      // Refresh ticket data
      fetchTicketDetails(userId, true);
      if (newStatus === "resolved" || newStatus === "closed") {
        playTickleSound();
      }
      showToast(`Ticket ${newStatus.replace("_", " ")}`, "success");
    } catch (err: any) {
      console.error("Status Change Error:", err);
      showToast(err.message || "Failed to update status", "error");
    }
  };

  const handleComplete = async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete ticket");
      }
      fetchTicketDetails(userId, true);
      playTickleSound();
      showToast("Task submitted for client approval", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to complete ticket", "error");
    }
  };

  const handleValidate = async (approved: boolean, note?: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          validation_approved: approved,
          validation_note: note,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to validate ticket");
      }
      fetchTicketDetails(userId, true);
      if (approved) playTickleSound();
      showToast(
        approved
          ? "Request confirmed as resolved!"
          : "Request reopened for rework",
        approved ? "success" : "success",
      );
    } catch (err: any) {
      showToast(err.message || "Failed to validate ticket", "error");
    }
  };

  const handleClaim = async () => {
    if (!userId || !ticket) return;

    // ✅ Check 1: Ticket is assignable (WAITLIST/OPEN)
    if (ticket.status !== "waitlist" && ticket.status !== "open") {
      showToast("This request is not available for self-assignment.", "error");
      return;
    }

    // ✅ Check 2: Ticket is NOT vendor-manual
    // skill_group is joined in the fetch, so we check the flag if available,
    // but typically we need to query the skill_group definition to see 'is_manual_assign'.
    // Let's do a quick robust check.
    if (ticket.skill_group) {
      const { data: sgData } = await supabase
        .from("skill_groups")
        .select("is_manual_assign")
        .eq("code", ticket.skill_group.code)
        .eq("property_id", ticket.property_id)
        .single();

      if (sgData?.is_manual_assign) {
        showToast(
          "This request requires manual / vendor coordination.",
          "error",
        );
        return;
      }
    }

    // ✅ Check 3: User has matching skill
    // We look for a row in resolver_stats for this user + this property + this skill
    // We need the ID of the skill group.
    // The ticket object has `skill_group` { name, code }, but we need the ID or check via code.
    // It's safer to fetch the ticket's skill_group_id directly or use the one we fetched.

    // Let's re-fetch the raw ticket to get ID if needed, or rely on join
    // Actually, let's query resolver_stats joining skill_groups
    const { data: userStats } = await supabase
      .from("resolver_stats")
      .select("id")
      .eq("user_id", userId)
      .eq("property_id", ticket.property_id)
      .eq("is_available", true)
      .eq(
        "skill_group_id",
        (ticket as any).skill_group_id || (ticket as any).skill_group?.id,
      ); // fallback

    // If we don't have the ID handy on the frontend object correctly, we might need to find it by code.
    // However, looking at the strict requirement:
    // resolver_stats.skill_group_id == ticket.skill_group_id

    // Let's ensure we have ticket.skill_group_id available.
    // The fetchTicketDetails uses `*, skill_group:skill_groups(...)`.
    // Supabase returns the foreign key column `skill_group_id` as well on the base object typically.

    if (!userStats || userStats.length === 0) {
      // To be absolutely sure, let's try one more check by code if ID failed (resilience)
      if (ticket.skill_group?.code) {
        const { data: statsByCode } = await supabase
          .from("resolver_stats")
          .select("id")
          .eq("user_id", userId)
          .eq("property_id", ticket.property_id)
          .eq("skill_group.code", ticket.skill_group.code) // simplified check
          .maybeSingle(); // this join syntax might depend on setup

        // If standard check fails:
        // We do: resolver_stats -> skill_group_id
        // We need to match ticket.skill_group_id

        // Let's stick to the strict check requested by user:
        // "User must have at least one row in resolver_stats where..."

        // If we didn't find it above, we fail.
        showToast("You are not assigned to this skill category.", "error");
        return;
      }
      showToast("You are not assigned to this skill category.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: userId }), // API handles status change to 'assigned'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to claim request");
      }

      showToast("Request Claimed", "success");
      fetchTicketDetails(userId, true);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to claim request", "error");
    }
  };

  const handleReassign = async () => {
    if (!selectedResolver) return;
    try {
      const res = await fetch(`/api/tickets/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          newAssigneeId: selectedResolver,
          forceAssign: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reassign");
      }

      showToast("Ticket Reassigned", "success");
      setShowAssignModal(false);
      fetchTicketDetails(userId, true);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to reassign", "error");
    }
  };

  const handleEditSubmit = async () => {
    if (!editTitle.trim()) return;
    setIsUpdatingContent(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update request");
      }

      showToast("Request Updated", "success");
      setIsEditing(false);
      fetchTicketDetails(userId, true);
    } catch (err: any) {
      console.error(err);
      showToast(
        err instanceof Error ? err.message : "Failed to update request",
        "error",
      );
    } finally {
      setIsUpdatingContent(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "before" | "after",
  ) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    if (file.type.startsWith("video/")) {
      await processVideo(file, type);
    } else {
      await processFile(file, type);
    }
  };

  const processFile = async (file: File, type: "before" | "after") => {
    setUploading(true);
    try {
      const compressedFile = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
      });

      const fileName = `${ticketId}/${type}_${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("ticket_photos")
        .upload(fileName, compressedFile);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("ticket_photos").getPublicUrl(fileName);

      const updateField =
        type === "before" ? "photo_before_url" : "photo_after_url";
      const { error: dbError } = await supabase
        .from("tickets")
        .update({ [updateField]: publicUrl })
        .eq("id", ticketId);

      if (dbError) throw dbError;

      const takenAt = new Date(file.lastModified).toISOString();
      await logActivity(`photo_${type}_uploaded`, takenAt, publicUrl);
      setTicket((prev) =>
        prev ? { ...prev, [updateField]: publicUrl } : null,
      );
      showToast(
        `${type.charAt(0).toUpperCase() + type.slice(1)} photo uploaded`,
        "success",
      );
    } catch (err: any) {
      console.error("Photo Upload Error:", err);
      showToast(err.message || "Failed to upload photo", "error");
    } finally {
      setUploading(false);
    }
  };

  const processVideo = async (file: File, type: "before" | "after") => {
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop() || "mp4";
      const fileName = `${ticketId}/${type}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("ticket_videos")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("ticket_videos").getPublicUrl(fileName);

      const updateField =
        type === "before" ? "video_before_url" : "video_after_url";
      const { error: dbError } = await supabase
        .from("tickets")
        .update({ [updateField]: publicUrl })
        .eq("id", ticketId);

      if (dbError) throw dbError;

      const takenAt = new Date(file.lastModified).toISOString();
      await logActivity(`video_${type}_uploaded`, takenAt, publicUrl);
      setTicket((prev) =>
        prev ? { ...prev, [updateField]: publicUrl } : null,
      );
      showToast(
        `${type.charAt(0).toUpperCase() + type.slice(1)} video uploaded`,
        "success",
      );
    } catch (err: any) {
      console.error("Video Upload Error:", err);
      showToast(err.message || "Failed to upload video", "error");
    } finally {
      setUploading(false);
    }
  };

  const openCamera = (type: "before" | "after") => {
    setActiveCameraType(type);
    setShowCameraModal(true);
  };

  const handleMediaCapture = async (media: MediaFile) => {
    if (!activeCameraType) return;
    setShowCameraModal(false);
    if (media.type === "video") {
      await processVideo(media.file, activeCameraType);
    } else {
      await processFile(media.file, activeCameraType);
    }
    setActiveCameraType(null);
  };

  const handlePostComment = async () => {
    if (!commentText.trim()) return;
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post comment");
      }

      const newComment = await res.json();
      setComments((prev) => [...prev, newComment]);

      setCommentText("");
      await logActivity("comment_added", null, "Comment");
    } catch (err: any) {
      console.error("Post Comment Error:", err);
      showToast(err.message || "Failed to post comment", "error");
    }
  };

  const logActivity = async (
    action: string,
    oldVal?: string | null,
    newVal?: string | null,
  ) => {
    await supabase.from("ticket_activity_log").insert({
      ticket_id: ticketId,
      user_id: userId,
      action,
      old_value: oldVal,
      new_value: newVal,
    });
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this request? This action cannot be undone.",
      )
    )
      return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete request");
      }

      showToast("Request Deleted Successfully", "success");
      setTimeout(() => {
        // Only use `from` if it's an absolute path (starts with /), not a tab name like "requests"
        const destination =
          (from?.startsWith("/") ? from : null) ||
          `/property/${ticket?.property_id}/${userRole === "admin" ? "dashboard" : userRole === "mst" ? "mst" : userRole === "staff" ? "staff" : "tenant"}?tab=requests`;
        router.push(destination);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to delete request", "error");
      setIsDeleting(false);
    }
  };

  const handleBack = () => {
    if (from) {
      window.history.back();
      return;
    }

    // No `from` param means direct/shared link — always go to the correct dashboard
    const pId = ticket?.property_id;
    if (!pId) {
      router.push("/");
      return;
    }

    if (userRole === "admin") {
      router.push(`/property/${pId}/dashboard?tab=requests`);
    } else if (userRole === "mst") {
      router.push(`/property/${pId}/mst?tab=requests`);
    } else if (userRole === "staff") {
      router.push(`/property/${pId}/staff?tab=requests`);
    } else {
      router.push(`/property/${pId}/tenant?tab=requests`);
    }
  };

  if (loading || isDeleting)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );

  if (fetchError)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <p className="font-bold text-slate-800 mb-1">Failed to load ticket</p>
          <p className="text-xs text-slate-400 font-mono break-all max-w-sm">
            {fetchError}
          </p>
        </div>
        <button
          onClick={() => {
            setFetchError(null);
            setLoading(true);
            fetchTicketDetails();
          }}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );

  if (!ticket)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold">
        Ticket not found
      </div>
    );

  const isAssignedToMe = userId === ticket?.assigned_to;
  const isOwner = userId === ticket?.raised_by;
  const canManage = userRole === "admin";
  const canWork =
    (userRole === "staff" || userRole === "mst") && isAssignedToMe;
  const isSpecializedStaff =
    userRole === "staff" &&
    (userSkills.includes("soft_service") ||
      userSkills.includes("technical") ||
      userSkills.includes("bms"));
  const canEditContent = isOwner || canManage;
  const canDelete =
    (isOwner && (userRole === "mst" || userRole === "staff")) || canManage;
  const canManagePhotos =
    canManage ||
    userRole === "mst" ||
    userRole === "staff" ||
    (userRole === "tenant" && isOwner);
  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen ${isDark ? "bg-[#0f1419] text-white" : "bg-white text-slate-900"} font-inter pb-12 transition-colors duration-300`}
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 px-6 py-3 rounded-xl shadow-2xl z-50 font-bold text-sm text-white ${notification.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}
          >
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div
        className={`${isDark ? "bg-[#161b22] border-[#21262d]" : "bg-white border-slate-200"} border-b sticky top-0 z-30 shadow-xl backdrop-blur-md bg-opacity-80`}
      >
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handleBack}
              className={`p-2 -ml-2 ${isDark ? "hover:bg-[#21262d] text-slate-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-900"} rounded-lg transition-all`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {(ticket as any).property?.name && (
                  <span
                    className={`text-[10px] font-black ${isDark ? "text-primary bg-primary/10 border-primary/20" : "text-primary bg-primary/10 border-primary-light/20"} px-2 py-0.5 rounded border uppercase tracking-widest`}
                  >
                    {(ticket as any).property.name}
                  </span>
                )}
                <span
                  className={`font-mono text-[10px] font-black ${isDark ? "text-slate-500 bg-[#21262d] border-[#30363d]" : "text-slate-500 bg-slate-100 border-slate-200"} px-2 py-0.5 rounded border`}
                >
                  {ticket.ticket_number}
                </span>
                {(ticket as any).category &&
                typeof (ticket as any).category === "string" ? (
                  <span
                    className={`px-2 py-0.5 ${isDark ? "bg-info/10 border-info/20 text-info" : "bg-info/10 border-info/20 text-info"} border rounded text-[9px] font-black uppercase tracking-widest`}
                  >
                    {((ticket as any).category as string).replace(/_/g, " ")}
                  </span>
                ) : (
                  ticket.category?.name && (
                    <span
                      className={`px-2 py-0.5 ${isDark ? "bg-info/10 border-info/20 text-info" : "bg-info/10 border-info/20 text-info"} border rounded text-[9px] font-black uppercase tracking-widest`}
                    >
                      {ticket.category.name}
                    </span>
                  )
                )}
                <span
                  className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${
                    ticket.priority === "urgent"
                      ? isDark
                        ? "bg-error/10 border-error/20 text-error"
                        : "bg-error/5 border-error/20 text-error"
                      : ticket.priority === "high"
                        ? isDark
                          ? "bg-warning/10 border-warning/20 text-warning"
                          : "bg-warning/5 border-warning/20 text-warning"
                        : isDark
                          ? "bg-info/10 border-info/20 text-info"
                          : "bg-info/5 border-info/20 text-info"
                  }`}
                >
                  {ticket.priority} Priority
                </span>

                {(ticket as any).classification_source === "llm" && (
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 ${isDark ? "bg-primary/20 border-primary/30 text-primary-light" : "bg-primary/10 border-primary/20 text-primary"} border rounded text-[9px] font-black uppercase tracking-widest shadow-sm animate-pulse`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    AI-Assisted
                  </span>
                )}

                {(ticket as any).secondary_category_code && (
                  <span
                    className={`px-2 py-0.5 ${isDark ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-500"} border rounded text-[9px] font-black uppercase tracking-widest`}
                  >
                    +{" "}
                    {(ticket as any).secondary_category_code.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {(ticket as any).risk_flag && (
                <div
                  className={`mt-2 flex items-center gap-2 px-3 py-2 ${isDark ? "bg-error/20 border-error/30 text-error" : "bg-error/5 border-error/20 text-error"} border rounded-xl text-xs font-bold animate-bounce-slow`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span className="uppercase tracking-wide">
                    Critical Risk Detected: {(ticket as any).risk_flag}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <h1
                  className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-900"} leading-tight ${(ticket as any).risk_flag ? "mt-3" : ""}`}
                >
                  {ticket.title}
                </h1>
                {canEditContent && (
                  <button
                    onClick={() => {
                      setEditTitle(ticket.title);
                      setEditDescription(ticket.description);
                      setIsEditing(true);
                    }}
                    className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-[#21262d] text-slate-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"}`}
                    title="Edit Request"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-[#21262d] text-rose-500/50 hover:text-rose-500" : "hover:bg-rose-50 text-rose-400 hover:text-rose-600"}`}
                    title="Delete Request"
                  >
                    {isDeleting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => setShareOpen(true)}
                  className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-[#21262d] text-slate-500 hover:text-blue-400" : "hover:bg-blue-50 text-slate-400 hover:text-blue-600"}`}
                  title="Share Ticket"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>

              {(ticket as any).llm_reasoning && (
                <p
                  className={`mt-2 text-[11px] font-medium leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"} italic flex items-start gap-2`}
                >
                  <Brain className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
                  "{(ticket as any).llm_reasoning}"
                </p>
              )}
            </div>
            <div className="text-right hidden sm:block">
              <div
                className={`text-[10px] font-black uppercase tracking-widest mb-1.5 px-3 py-1 rounded-full border inline-block ${
                  ticket.status === "closed" || ticket.status === "resolved"
                    ? isDark
                      ? "bg-success/10 border-success/20 text-success"
                      : "bg-success/5 border-success/20 text-success"
                    : ticket.status === "pending_validation"
                      ? isDark
                        ? "bg-violet-900/30 border-violet-700/40 text-violet-300"
                        : "bg-violet-50 border-violet-200 text-violet-700"
                      : ticket.status === "in_progress"
                        ? isDark
                          ? "bg-info/10 border-info/20 text-info"
                          : "bg-info/5 border-info/20 text-info"
                        : ticket.status === "assigned"
                          ? isDark
                            ? "bg-primary/10 border-primary/20 text-primary-light"
                            : "bg-primary/5 border-primary/20 text-primary"
                          : isDark
                            ? "bg-[#21262d] border-[#30363d] text-slate-400"
                            : "bg-slate-100 border-slate-200 text-slate-500"
                }`}
              >
                {ticket.status === "closed" || ticket.status === "resolved"
                  ? "COMPLETE"
                  : ticket.status === "pending_validation"
                    ? "AWAITING APPROVAL"
                    : ticket.status.replace("_", " ")}
              </div>
              {ticket.sla_deadline && ticket.status !== "closed" && (
                <div className="flex items-center justify-end mt-1">
                  {ticket.sla_breached ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500 border border-rose-600 rounded-lg animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-white" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">
                          SLA Breached
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold ${isDark ? "text-rose-400" : "text-rose-500"}`}
                      >
                        {(() => {
                          const breachTime = new Date(
                            ticket.sla_deadline,
                          ).getTime();
                          const diff = Date.now() - breachTime;
                          const hrs = Math.floor(diff / 3600000);
                          const mins = Math.floor((diff % 3600000) / 60000);
                          return hrs > 0
                            ? `${hrs}h ${mins}m overdue`
                            : `${mins}m overdue`;
                        })()}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-slate-500" : "text-slate-400"}`}
                    >
                      <Clock className="w-3 h-3" />
                      {`Due ${new Date(ticket.sla_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {/* MST Actions */}
            {/* Claim button: Only show if NOT assigned to anyone */}
            {userRole === "staff" &&
              (ticket.status === "open" || ticket.status === "waitlist") &&
              !ticket.assigned_to && (
                <button
                  onClick={() => handleClaim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
                >
                  <User className="w-4 h-4" /> Claim Request
                </button>
              )}
            {/* Start Work button: Show if assigned to me and awaiting start */}
            {isAssignedToMe &&
              ["assigned", "open", "waitlist"].includes(ticket.status) && (
                <button
                  onClick={() => handleStatusChange("in_progress")}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all border border-slate-200"
                >
                  <PlayCircle className="w-4 h-4" /> Start Work
                </button>
              )}
            {/* New Reassign button for MST - and Staff/Resolvers too if needed, but user specifically asked for MST */}
            {(userRole === "mst" || userRole === "staff") && (
              <button
                onClick={() => setShowAssignModal(true)}
                className={`flex items-center gap-2 px-4 py-2 ${isDark ? "bg-[#21262d] border-[#30363d] text-slate-300 hover:bg-[#30363d]" : "bg-slate-100 border-slate-100 text-slate-600 hover:bg-slate-200"} border rounded-xl text-xs font-black uppercase tracking-widest transition-all`}
              >
                <User className="w-4 h-4" /> Reassign
              </button>
            )}
            {/* Complete Task button: ONLY show if work is IN PROGRESS */}
            {isAssignedToMe && ticket.status === "in_progress" && (
              <button
                onClick={handleComplete}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-dark transition-all shadow-lg"
              >
                <CheckCircle2 className="w-4 h-4" /> Complete Task
              </button>
            )}

            {/* Tenant Validation — shown when ticket is pending client approval */}
            {userRole === "tenant" &&
              ticket.status === "pending_validation" && (
                <>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${isDark ? "bg-violet-900/30 text-violet-300 border border-violet-700/40" : "bg-violet-50 text-violet-700 border border-violet-200"}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Awaiting your approval
                  </div>
                  <button
                    onClick={() => handleValidate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Looks Good
                  </button>
                  <button
                    onClick={() => {
                      setRejectNote("");
                      setShowRejectModal(true);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 ${isDark ? "bg-[#21262d] border-[#30363d] text-rose-400 hover:bg-rose-900/20" : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"} border rounded-xl text-xs font-black uppercase tracking-widest transition-all`}
                  >
                    <XCircle className="w-4 h-4" /> Not Resolved
                  </button>
                </>
              )}

            {/* Admin Actions */}
            {canManage && (
              <>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className={`flex items-center gap-2 px-4 py-2 ${isDark ? "bg-[#21262d] border-[#30363d] text-slate-300 hover:bg-[#30363d]" : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"} border rounded-xl text-xs font-black uppercase tracking-widest transition-all`}
                >
                  <User className="w-4 h-4" /> Reassign
                </button>
                {ticket.status !== "closed" && (
                  <button
                    onClick={() => handleStatusChange("closed")}
                    className="flex items-center gap-2 px-4 py-2 bg-error/10 border border-error/20 text-error rounded-xl text-xs font-black uppercase tracking-widest hover:bg-error/20 transition-all"
                  >
                    <XCircle className="w-4 h-4" /> Force Close
                  </button>
                )}
                <button
                  onClick={() =>
                    router.push(`/property/${ticket.property_id}/flow-map`)
                  }
                  className={`flex items-center gap-2 px-4 py-2 ${isDark ? "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20" : "bg-primary/5 border-primary/20 text-primary hover:bg-primary/10"} border rounded-xl text-xs font-black uppercase tracking-widest transition-all`}
                >
                  <Activity className="w-4 h-4" /> Flow Map
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT COLUMN: Context & Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Request Description */}
            <div
              className={`${isDark ? "bg-[#161b22] border-[#21262d]" : "bg-white border-slate-100"} p-6 rounded-3xl border shadow-sm`}
            >
              <h3
                className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"} mb-4 flex items-center gap-2`}
              >
                <Paperclip className="w-4 h-4 text-primary" />
                Description
              </h3>
              <p
                className={`${isDark ? "text-slate-300" : "text-slate-600"} text-sm leading-relaxed whitespace-pre-wrap`}
              >
                {ticket.description || "No description provided."}
              </p>
            </div>

            {/* 1. Context Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Requestor Card */}
              <div
                className={`${isDark ? "bg-[#161b22] border-[#21262d]" : "bg-white border-slate-100"} p-5 rounded-2xl border shadow-sm relative overflow-hidden group`}
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-info/5 rounded-full -mr-12 -mt-12 group-hover:bg-info/10 transition-all" />
                <h3
                  className={`text-[10px] font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10`}
                >
                  <User className="w-3 h-3" /> Who Raised
                </h3>
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-10 h-10 bg-info rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                    {ticket.creator?.full_name?.[0] || "U"}
                  </div>
                  <div>
                    <p
                      className={`font-bold ${isDark ? "text-white" : "text-slate-900"} text-sm leading-tight`}
                    >
                      {ticket.creator?.full_name || "Unknown User"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`px-1.5 py-0.5 ${isDark ? "bg-info/10 text-info" : "bg-info/5 text-info"} text-[9px] font-black uppercase tracking-wider rounded`}
                      >
                        {creatorRole}
                      </span>
                      <span
                        className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"} font-medium whitespace-nowrap`}
                      >
                        Raised{" "}
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className={`mt-4 pt-4 border-t ${isDark ? "border-[#30363d]" : "border-slate-50"} relative z-10`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span
                        className={`text-[9px] font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest`}
                      >
                        Floor
                      </span>
                      <span
                        className={`text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-600"}`}
                      >
                        {ticket.floor_number === 0
                          ? "Ground Floor"
                          : ticket.floor_number === -1
                            ? "Basement"
                            : ticket.floor_number
                              ? `Level ${ticket.floor_number}`
                              : "-"}
                      </span>
                    </div>
                    <div
                      className={`w-px h-6 ${isDark ? "bg-[#30363d]" : "bg-slate-100"}`}
                    />
                    <div className="flex flex-col">
                      <span
                        className={`text-[9px] font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest`}
                      >
                        Location
                      </span>
                      <span
                        className={`text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-600"}`}
                      >
                        {ticket.location || "General Area"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resolver Card */}
              <div
                className={`${isDark ? "bg-[#161b22] border-[#21262d]" : "bg-white border-slate-100"} p-5 rounded-2xl border shadow-sm relative overflow-hidden group`}
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:bg-primary/10 transition-all" />
                <h3
                  className={`text-[10px] font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10`}
                >
                  <ShieldAlert className="w-3 h-3" /> Who Is Servicing
                </h3>
                {ticket.assignee ? (
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                      {ticket.assignee.full_name[0]}
                    </div>
                    <div>
                      <p
                        className={`font-bold ${isDark ? "text-white" : "text-slate-900"} text-sm leading-tight`}
                      >
                        {ticket.assignee.full_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`px-1.5 py-0.5 ${isDark ? "bg-primary/10 text-primary-light" : "bg-primary/5 text-primary"} text-[9px] font-black uppercase tracking-wider rounded`}
                        >
                          {assigneeRole}
                        </span>
                        <span
                          className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"} font-medium uppercase tracking-tighter`}
                        >
                          Assigned{" "}
                          {new Date(ticket.assigned_at!).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`flex items-center justify-center h-16 ${isDark ? "bg-[#0d1117] border-[#30363d]" : "bg-slate-50 border-slate-200"} rounded-xl border border-dashed relative z-10`}
                  >
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
                      Awaiting Assignment
                    </p>
                  </div>
                )}
                {ticket.assignee && (
                  <div
                    className={`mt-4 pt-4 border-t ${isDark ? "border-[#30363d]" : "border-slate-50"} relative z-10`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[9px] font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest`}
                      >
                        Resolver ID
                      </span>
                      <span
                        className={`text-[10px] font-bold ${isDark ? "text-primary bg-primary/10 border-primary/20" : "text-primary bg-primary/10 border-primary-light"}`}
                      >
                        RSLV-{ticket.assigned_to?.slice(0, 4).toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Escalation Timeline */}
            {escalationLogs.length > 0 && (
              <div
                className={`${isDark ? "bg-[#161b22] border-red-500/30" : "bg-white border-red-200"} border rounded-3xl p-6 relative overflow-hidden shadow-sm`}
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between gap-3 mb-6 relative z-10 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full ${isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-100"} flex items-center justify-center flex-shrink-0 border`}
                    >
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h2
                        className={`text-lg font-semibold ${isDark ? "text-red-400" : "text-red-700"}`}
                      >
                        Escalation Timeline
                      </h2>
                      <p
                        className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {escalationLogs.length} escalation
                        {escalationLogs.length > 1 ? "s" : ""} recorded
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ticket?.current_escalation_level != null &&
                      ticket.current_escalation_level > 0 && (
                        <div
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? "bg-red-500/15 text-red-300 border border-red-500/20" : "bg-red-50 text-red-700 border border-red-200"}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          Level {ticket.current_escalation_level} Active
                        </div>
                      )}
                    {ticket?.escalation_paused && (
                      <div
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/20" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        Paused
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline entries */}
                <div className="relative pl-5 z-10">
                  <div
                    className={`absolute left-[9px] top-2 bottom-2 w-px ${isDark ? "bg-red-500/20" : "bg-red-200"}`}
                  />
                  <div className="space-y-4">
                    {escalationLogs.map((log) => {
                      const fromInitials = log.from_employee?.full_name
                        ? log.from_employee.full_name
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        : "?";
                      const toInitials = log.to_employee?.full_name
                        ? log.to_employee.full_name
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        : "?";
                      const reasonLabel =
                        log.reason === "timeout"
                          ? "SLA Timeout"
                          : log.reason === "manual"
                            ? "Manual"
                            : log.reason || "Timeout";
                      return (
                        <div key={log.id} className="flex items-start gap-3">
                          <div
                            className={`w-[18px] h-[18px] rounded-full bg-red-500 border-2 ${isDark ? "border-[#161b22]" : "border-white"} flex-shrink-0 mt-1 z-10`}
                          />
                          <div
                            className={`flex-1 ${isDark ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100"} border rounded-xl p-4`}
                          >
                            {/* Level badges + reason + timestamp */}
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${isDark ? "bg-gray-800 text-gray-400 border border-gray-700" : "bg-gray-100 text-gray-500 border border-gray-200"}`}
                                >
                                  L{log.from_level}
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${isDark ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-red-100 text-red-700 border border-red-200"}`}
                                >
                                  L{log.to_level ?? "Final"}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-orange-500/10 text-orange-400" : "bg-orange-50 text-orange-600"}`}
                                >
                                  {reasonLabel}
                                </span>
                              </div>
                              <span
                                className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}
                              >
                                {new Date(log.escalated_at).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {/* From → To employees */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-7 h-7 rounded-full flex-shrink-0 border overflow-hidden ${isDark ? "border-gray-600" : "border-gray-300"}`}
                                >
                                  {log.from_employee?.user_photo_url ? (
                                    <img
                                      src={log.from_employee.user_photo_url}
                                      alt={log.from_employee.full_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div
                                      className={`w-full h-full flex items-center justify-center text-[10px] font-bold ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"}`}
                                    >
                                      {fromInitials}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p
                                    className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                                  >
                                    From
                                  </p>
                                  <p
                                    className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}
                                  >
                                    {log.from_employee?.full_name ||
                                      "Unassigned"}
                                  </p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-red-500 flex-shrink-0" />
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-7 h-7 rounded-full flex-shrink-0 border overflow-hidden ${isDark ? "border-red-500/30" : "border-red-300"}`}
                                >
                                  {log.to_employee?.user_photo_url ? (
                                    <img
                                      src={log.to_employee.user_photo_url}
                                      alt={log.to_employee.full_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div
                                      className={`w-full h-full flex items-center justify-center text-[10px] font-bold ${isDark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-700"}`}
                                    >
                                      {toInitials}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p
                                    className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                                  >
                                    To
                                  </p>
                                  <p
                                    className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                                  >
                                    {log.to_employee?.full_name ||
                                      "No Assignee"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Before / After Photos */}
            <div
              className={`${isDark ? "bg-[#161b22] border-[#21262d]" : "bg-white border-slate-100"} p-6 rounded-3xl border shadow-sm`}
            >
              <h3
                className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"} mb-6 flex items-center gap-2`}
              >
                <Camera className="w-4 h-4 text-primary" />
                Site Documentation
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-4">
                {/* Before Photo */}
                <div className="space-y-3">
                  <div
                    className={`text-[10px] sm:text-xs font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest flex items-center justify-between gap-4 flex-wrap`}
                  >
                    <span className="whitespace-nowrap">Before Work</span>
                    {ticket.photo_before_url && canManagePhotos && (
                      <span className="text-[9px] sm:text-[10px] text-primary/60 italic font-medium whitespace-nowrap">
                        Click to change
                      </span>
                    )}
                  </div>
                  {ticket.photo_before_url || ticket.video_before_url ? (
                    <div
                      className={`relative aspect-video rounded-xl overflow-hidden ${isDark ? "bg-[#0d1117] border-[#30363d]" : "bg-slate-50 border-slate-100"} border group`}
                    >
                      {ticket.video_before_url ? (
                        <>
                          {/* Video poster — tap to open VideoPreviewModal */}
                          <div
                            className="absolute inset-0 bg-black flex items-center justify-center cursor-pointer"
                            onClick={() => {
                              setPreviewVideoUrl(ticket.video_before_url!);
                              setPreviewVideoTitle("Before Work — Video");
                            }}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors">
                                <PlayCircle className="w-8 h-8 text-white" />
                              </div>
                              <span className="text-white/60 text-[9px] font-bold uppercase tracking-widest">
                                Tap to play
                              </span>
                            </div>
                            <span className="absolute top-2 left-3 text-white/50 text-[9px] font-bold uppercase tracking-widest bg-black/50 px-2 py-0.5 rounded">
                              Video
                            </span>
                          </div>
                          {/* Upload controls — appear on hover */}
                          {canManagePhotos && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <div className="flex items-center gap-3">
                                <label
                                  className={`flex items-center justify-center w-12 h-12 ${isDark ? "bg-[#21262d]" : "bg-black/60 backdrop-blur-md"} rounded-xl cursor-pointer hover:bg-primary text-white transition-all shadow-lg`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Paperclip className="w-4 h-4" />
                                  <input
                                    type="file"
                                    accept="image/*,video/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handleFileUpload(e, "before")
                                    }
                                  />
                                </label>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCamera("before");
                                  }}
                                  className={`flex items-center justify-center w-12 h-12 ${isDark ? "bg-[#21262d]" : "bg-black/60 backdrop-blur-md"} rounded-xl hover:bg-primary text-white transition-all shadow-lg`}
                                >
                                  <Camera className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <img
                            src={ticket.photo_before_url}
                            alt="Before"
                            className="w-full h-full object-cover cursor-zoom-in select-none"
                            onClick={() =>
                              ticket.photo_before_url &&
                              setLightboxUrl(ticket.photo_before_url)
                            }
                            onMouseDown={() =>
                              ticket.photo_before_url &&
                              startPeek(ticket.photo_before_url)
                            }
                            onMouseUp={endPeek}
                            onMouseLeave={endPeek}
                            onTouchStart={() =>
                              ticket.photo_before_url &&
                              startPeek(ticket.photo_before_url)
                            }
                            onTouchEnd={endPeek}
                            onContextMenu={(e) => e.preventDefault()}
                            draggable={false}
                          />
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity gap-3">
                            <button
                              onClick={() =>
                                ticket.photo_before_url &&
                                setLightboxUrl(ticket.photo_before_url)
                              }
                              className={`text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 ${isDark ? "bg-[#161b22]" : "bg-white/10 backdrop-blur-md"} rounded-2xl hover:bg-primary transition-colors shadow-lg`}
                            >
                              View Full
                            </button>
                            {canManagePhotos && (
                              <div className="flex items-center gap-4">
                                <label
                                  className={`flex items-center justify-center w-14 h-14 ${isDark ? "bg-[#21262d]" : "bg-white/20 backdrop-blur-md"} rounded-2xl cursor-pointer hover:bg-primary text-white transition-all shadow-lg`}
                                >
                                  <Paperclip className="w-5 h-5" />
                                  <input
                                    type="file"
                                    accept="image/*,video/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handleFileUpload(e, "before")
                                    }
                                  />
                                </label>
                                <button
                                  onClick={() => openCamera("before")}
                                  className={`flex items-center justify-center w-14 h-14 ${isDark ? "bg-[#21262d]" : "bg-white/20 backdrop-blur-md"} rounded-2xl cursor-pointer hover:bg-primary text-white transition-all shadow-lg`}
                                >
                                  <Camera className="w-5 h-5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Timestamp Overlay */}
                      {(() => {
                        const act = activities.find(
                          (a: any) =>
                            a.action === "photo_before_uploaded" ||
                            a.action === "video_before_uploaded" ||
                            (a.action === "photo_upload" &&
                              a.new_value?.includes("before")) ||
                            (a.action === "video_upload" &&
                              a.new_value?.includes("before")),
                        );
                        const ts = act?.old_value || act?.created_at;
                        if (!ts) return null;
                        return (
                          <div
                            className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/80 rounded text-[9px] text-white font-bold font-mono border border-white/30 backdrop-blur-sm pointer-events-none z-20 shadow-lg"
                            key="ts-before"
                          >
                            {new Date(ts)
                              .toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              })
                              .replace(",", "")}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div
                      className={`flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed ${isDark ? "border-[#30363d] bg-[#0d1117]" : "border-slate-200 bg-slate-50"} transition-all gap-2 p-4`}
                    >
                      <span
                        className={`text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"} uppercase tracking-widest mb-2`}
                      >
                        Add Attachment
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center gap-6">
                          <label
                            className={`cursor-pointer flex flex-col items-center gap-2 group`}
                          >
                            <div
                              className={`w-14 h-14 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#161b22] group-hover:bg-[#21262d] border-[#30363d]" : "bg-white group-hover:bg-slate-50 border-slate-200"} border-2 shadow-sm transition-all group-hover:scale-105`}
                            >
                              <Paperclip
                                className={`w-6 h-6 ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-primary transition-colors`}
                              />
                            </div>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-primary transition-colors`}
                            >
                              Gallery
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={!canManagePhotos}
                              onChange={(e) => handleFileUpload(e, "before")}
                            />
                          </label>

                          <button
                            onClick={() => openCamera("before")}
                            className={`cursor-pointer flex flex-col items-center gap-2 group`}
                          >
                            <div
                              className={`w-14 h-14 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#161b22] group-hover:bg-[#21262d] border-[#30363d]" : "bg-white group-hover:bg-slate-50 border-slate-200"} border-2 shadow-sm transition-all group-hover:scale-105`}
                            >
                              <Camera
                                className={`w-6 h-6 ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-primary transition-colors`}
                              />
                            </div>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-primary transition-colors`}
                            >
                              Camera
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* After Photo */}
                <div className="space-y-3">
                  <div
                    className={`text-[10px] sm:text-xs font-black ${isDark ? "text-slate-500" : "text-slate-400"} uppercase tracking-widest flex items-center justify-between gap-4 flex-wrap`}
                  >
                    <span className="whitespace-nowrap">After Work</span>
                    {ticket.photo_after_url && canManagePhotos && (
                      <span className="text-[9px] sm:text-[10px] text-emerald-500/60 italic font-medium whitespace-nowrap">
                        Click to change
                      </span>
                    )}
                  </div>
                  {ticket.photo_after_url || ticket.video_after_url ? (
                    <div
                      className={`relative aspect-video rounded-xl overflow-hidden ${isDark ? "bg-[#0d1117] border-[#30363d]" : "bg-slate-50 border-slate-100"} border group`}
                    >
                      {ticket.video_after_url ? (
                        <>
                          {/* Video poster — tap to open VideoPreviewModal */}
                          <div
                            className="absolute inset-0 bg-black flex items-center justify-center cursor-pointer"
                            onClick={() => {
                              setPreviewVideoUrl(ticket.video_after_url!);
                              setPreviewVideoTitle("After Work — Video");
                            }}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors">
                                <PlayCircle className="w-8 h-8 text-white" />
                              </div>
                              <span className="text-white/60 text-[9px] font-bold uppercase tracking-widest">
                                Tap to play
                              </span>
                            </div>
                            <span className="absolute top-2 left-3 text-white/50 text-[9px] font-bold uppercase tracking-widest bg-black/50 px-2 py-0.5 rounded">
                              Video
                            </span>
                          </div>
                          {/* Upload controls — appear on hover */}
                          {canManagePhotos && (
                            <div className="absolute bottom-3 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <div className="flex items-center gap-3">
                                <label
                                  className={`flex items-center justify-center w-12 h-12 ${isDark ? "bg-[#21262d]" : "bg-black/60 backdrop-blur-md"} rounded-xl cursor-pointer hover:bg-emerald-500 text-white transition-all shadow-lg`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Paperclip className="w-4 h-4" />
                                  <input
                                    type="file"
                                    accept="image/*,video/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handleFileUpload(e, "after")
                                    }
                                  />
                                </label>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCamera("after");
                                  }}
                                  className={`flex items-center justify-center w-12 h-12 ${isDark ? "bg-[#21262d]" : "bg-black/60 backdrop-blur-md"} rounded-xl hover:bg-emerald-500 text-white transition-all shadow-lg`}
                                >
                                  <Camera className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <img
                            src={ticket.photo_after_url}
                            alt="After"
                            className="w-full h-full object-cover cursor-zoom-in select-none"
                            onClick={() =>
                              ticket.photo_after_url &&
                              setLightboxUrl(ticket.photo_after_url)
                            }
                            onMouseDown={() =>
                              ticket.photo_after_url &&
                              startPeek(ticket.photo_after_url)
                            }
                            onMouseUp={endPeek}
                            onMouseLeave={endPeek}
                            onTouchStart={() =>
                              ticket.photo_after_url &&
                              startPeek(ticket.photo_after_url)
                            }
                            onTouchEnd={endPeek}
                            onContextMenu={(e) => e.preventDefault()}
                            draggable={false}
                          />
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity gap-3">
                            <button
                              onClick={() =>
                                ticket.photo_after_url &&
                                setLightboxUrl(ticket.photo_after_url)
                              }
                              className={`text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 ${isDark ? "bg-[#161b22]" : "bg-white/10 backdrop-blur-md"} rounded-2xl hover:bg-emerald-500 transition-colors shadow-lg`}
                            >
                              View Full
                            </button>
                            {canManagePhotos && (
                              <div className="flex items-center gap-4">
                                <label
                                  className={`flex items-center justify-center w-14 h-14 ${isDark ? "bg-[#21262d]" : "bg-white/20 backdrop-blur-md"} rounded-2xl cursor-pointer hover:bg-emerald-500 text-white transition-all shadow-lg`}
                                >
                                  <Paperclip className="w-5 h-5" />
                                  <input
                                    type="file"
                                    accept="image/*,video/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handleFileUpload(e, "after")
                                    }
                                  />
                                </label>
                                <button
                                  onClick={() => openCamera("after")}
                                  className={`flex items-center justify-center w-14 h-14 ${isDark ? "bg-[#21262d]" : "bg-white/20 backdrop-blur-md"} rounded-2xl cursor-pointer hover:bg-emerald-500 text-white transition-all shadow-lg`}
                                >
                                  <Camera className="w-5 h-5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Timestamp Overlay */}
                      {(() => {
                        const act = activities.find(
                          (a: any) =>
                            a.action === "photo_after_uploaded" ||
                            a.action === "video_after_uploaded" ||
                            (a.action === "photo_upload" &&
                              a.new_value?.includes("after")) ||
                            (a.action === "video_upload" &&
                              a.new_value?.includes("after")),
                        );
                        const ts = act?.old_value || act?.created_at;
                        if (!ts) return null;
                        return (
                          <div
                            className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/80 rounded text-[9px] text-white font-bold font-mono border border-white/30 backdrop-blur-sm pointer-events-none z-20 shadow-lg"
                            key="ts-after"
                          >
                            {new Date(ts)
                              .toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              })
                              .replace(",", "")}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div
                      className={`flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed ${isDark ? "border-[#30363d] bg-[#0d1117]" : "border-slate-200 bg-slate-50"} transition-all gap-2 p-4`}
                    >
                      <span
                        className={`text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"} uppercase tracking-widest mb-2`}
                      >
                        Add Attachment
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center gap-6">
                          <label
                            className={`cursor-pointer flex flex-col items-center gap-2 group`}
                          >
                            <div
                              className={`w-14 h-14 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#161b22] group-hover:bg-[#21262d] border-[#30363d]" : "bg-white group-hover:bg-slate-50 border-slate-200"} border-2 shadow-sm transition-all group-hover:scale-105`}
                            >
                              <Paperclip
                                className={`w-6 h-6 ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-emerald-500 transition-colors`}
                              />
                            </div>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-emerald-500 transition-colors`}
                            >
                              Gallery
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={!canManagePhotos}
                              onChange={(e) => handleFileUpload(e, "after")}
                            />
                          </label>

                          <button
                            onClick={() => openCamera("after")}
                            className={`cursor-pointer flex flex-col items-center gap-2 group`}
                          >
                            <div
                              className={`w-14 h-14 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#161b22] group-hover:bg-[#21262d] border-[#30363d]" : "bg-white group-hover:bg-slate-50 border-slate-200"} border-2 shadow-sm transition-all group-hover:scale-105`}
                            >
                              <Camera
                                className={`w-6 h-6 ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-emerald-500 transition-colors`}
                              />
                            </div>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"} group-hover:text-emerald-500 transition-colors`}
                            >
                              Camera
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Activity Timeline (Progress) */}
            <div
              className={`${isDark ? "bg-[#161b22] border-[#21262d]" : "bg-white border-slate-100"} p-6 rounded-3xl border shadow-sm`}
            >
              <h3
                className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"} mb-8 flex items-center gap-2`}
              >
                <History className="w-4 h-4 text-primary" />
                Sequence of Events
              </h3>
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-4 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary before:via-slate-500/20 before:to-transparent">
                {/* 1. Ticket Created */}
                <div className="relative pl-12">
                  <div
                    className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full bg-success flex items-center justify-center text-white ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-success/20 shadow-lg`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <p
                    className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                  >
                    {new Date(ticket.created_at).toLocaleString()}
                  </p>
                  <p
                    className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                  >
                    Ticket Created
                  </p>
                  <p
                    className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                  >
                    System generated unique ID: {ticket.ticket_number}
                  </p>
                </div>

                {/* Reassignment & Assignment History */}
                {activities
                  .filter(
                    (a) => a.action === "reassigned" || a.action === "assigned",
                  )
                  .sort(
                    (a, b) =>
                      new Date(a.created_at).getTime() -
                      new Date(b.created_at).getTime(),
                  )
                  .map((act) => (
                    <div key={act.id} className="relative pl-12">
                      <div
                        className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-primary/20 shadow-lg`}
                      >
                        <User className="w-4 h-4" />
                      </div>
                      <p
                        className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                      >
                        {new Date(act.created_at).toLocaleString()}
                      </p>
                      <p
                        className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                      >
                        {act.action === "assigned"
                          ? "Initial Assignment"
                          : "Route Changed"}
                      </p>
                      <p
                        className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                      >
                        {act.new_value && userNameMap[act.new_value] && (
                          <span className="font-bold text-primary mr-1">
                            Assigned to {userNameMap[act.new_value]}
                          </span>
                        )}
                        Executed by {act.user?.full_name || "System"}
                      </p>
                    </div>
                  ))}

                {/* 3. Work Started */}
                <div className="relative pl-12">
                  <div
                    className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${ticket.work_started_at ? "bg-success text-white shadow-success/20" : isDark ? "bg-[#21262d] text-slate-600" : "bg-slate-100 text-slate-400"}`}
                  >
                    {ticket.work_started_at ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <PlayCircle className="w-4 h-4" />
                    )}
                  </div>
                  <p
                    className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                  >
                    {ticket.work_started_at
                      ? new Date(ticket.work_started_at).toLocaleString()
                      : "AWAITING START"}
                  </p>
                  <p
                    className={`text-sm font-bold ${ticket.work_started_at ? (isDark ? "text-white" : "text-slate-900") : isDark ? "text-slate-700" : "text-slate-300"}`}
                  >
                    In Progress
                  </p>
                  {ticket.work_started_at && (
                    <p
                      className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                    >
                      Resolver is currently working on the issue
                    </p>
                  )}
                </div>

                {/* 4. Work Completed by MST */}
                <div className="relative pl-12">
                  {(() => {
                    const isEffectivelyResolved =
                      ticket.resolved_at &&
                      !["open", "assigned", "in_progress", "waitlist"].includes(
                        ticket.status,
                      );
                    return (
                      <>
                        <div
                          className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${isEffectivelyResolved ? "bg-success text-white shadow-success/20" : isDark ? "bg-[#21262d] text-slate-600" : "bg-slate-100 text-slate-400"}`}
                        >
                          {isEffectivelyResolved ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <AlertCircle className="w-4 h-4" />
                          )}
                        </div>
                        <p
                          className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                        >
                          {isEffectivelyResolved
                            ? new Date(ticket.resolved_at ?? "").toLocaleString()
                            : "PENDING"}
                        </p>
                        <p
                          className={`text-sm font-bold ${isEffectivelyResolved ? (isDark ? "text-white" : "text-slate-900") : isDark ? "text-slate-700" : "text-slate-300"}`}
                        >
                          Work Completed
                        </p>
                        {isEffectivelyResolved && (
                          <p
                            className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                          >
                            {validationEnabled
                              ? "Resolver submitted work for client approval"
                              : "Work has been completed and closed"}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* 5+6. All Validation Cycles — only shown when validation is enabled */}
                {validationEnabled &&
                  (() => {
                    const valActivities = activities
                      .filter((a) =>
                        [
                          "pending_validation",
                          "validated_approved",
                          "validated_rejected",
                        ].includes(a.action),
                      )
                      .sort(
                        (a, b) =>
                          new Date(a.created_at).getTime() -
                          new Date(b.created_at).getTime(),
                      );

                    const isCurrentlyPending =
                      ticket.status === "pending_validation";
                    const lastValAct = valActivities[valActivities.length - 1];

                    if (valActivities.length === 0) {
                      // Ticket hasn't reached validation yet — show placeholders
                      return (
                        <>
                          <div className="relative pl-12">
                            <div
                              className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${isDark ? "bg-[#21262d] text-slate-600" : "bg-slate-100 text-slate-400"}`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <p
                              className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                            >
                              PENDING
                            </p>
                            <p
                              className={`text-sm font-bold ${isDark ? "text-slate-700" : "text-slate-300"}`}
                            >
                              Sent for Approval
                            </p>
                          </div>
                          <div className="relative pl-12">
                            <div
                              className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${isDark ? "bg-[#21262d] text-slate-600" : "bg-slate-100 text-slate-400"}`}
                            >
                              <AlertCircle className="w-4 h-4" />
                            </div>
                            <p
                              className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                            >
                              AWAITING
                            </p>
                            <p
                              className={`text-sm font-bold ${isDark ? "text-slate-700" : "text-slate-300"}`}
                            >
                              Client Validation
                            </p>
                          </div>
                        </>
                      );
                    }

                    const nodes = valActivities.map((act) => {
                      if (act.action === "pending_validation") {
                        const isThisCurrentlyPending =
                          isCurrentlyPending && act === lastValAct;
                        return (
                          <div key={act.id} className="relative pl-12">
                            <div
                              className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${isThisCurrentlyPending ? "bg-violet-500 text-white shadow-violet-500/20 animate-pulse" : "bg-success text-white shadow-success/20"}`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <p
                              className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                            >
                              {isThisCurrentlyPending
                                ? "AWAITING CLIENT"
                                : new Date(act.created_at).toLocaleString()}
                            </p>
                            <p
                              className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                            >
                              Sent for Approval
                            </p>
                            {isThisCurrentlyPending ? (
                              <p
                                className={`text-xs ${isDark ? "text-violet-400" : "text-violet-600"} font-semibold`}
                              >
                                Waiting for client to confirm resolution
                              </p>
                            ) : (
                              <p
                                className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                              >
                                Sent to client for validation
                              </p>
                            )}
                          </div>
                        );
                      }
                      // validated_approved or validated_rejected
                      const isApproved = act.action === "validated_approved";
                      const note =
                        act.new_value && act.new_value !== "rejected by client"
                          ? act.new_value
                          : null;
                      return (
                        <div key={act.id} className="relative pl-12">
                          <div
                            className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${isApproved ? "bg-success text-white shadow-success/20" : "bg-rose-500 text-white shadow-rose-500/20"}`}
                          >
                            {isApproved ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                          </div>
                          <p
                            className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                          >
                            {new Date(act.created_at).toLocaleString()}
                          </p>
                          <p
                            className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                          >
                            {isApproved
                              ? "Client Approved ✓"
                              : "Client Rejected — Reopened"}
                          </p>
                          {note && (
                            <p
                              className={`text-xs mt-0.5 ${isDark ? "text-rose-400" : "text-rose-600"} font-medium italic`}
                            >
                              "{note}"
                            </p>
                          )}
                          {isApproved && (
                            <p
                              className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                            >
                              Client confirmed the issue is resolved
                            </p>
                          )}
                          <p
                            className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
                          >
                            {act.user?.full_name || "Tenant"}
                          </p>
                        </div>
                      );
                    });

                    // If still waiting for client response, append a placeholder
                    if (
                      isCurrentlyPending &&
                      lastValAct?.action === "pending_validation"
                    ) {
                      nodes.push(
                        <div key="val-placeholder" className="relative pl-12">
                          <div
                            className={`absolute left-0 top-0 mt-0.5 z-10 w-8 h-8 rounded-full flex items-center justify-center ring-4 ${isDark ? "ring-[#161b22]" : "ring-white"} shadow-lg ${isDark ? "bg-[#21262d] text-slate-600" : "bg-slate-100 text-slate-400"}`}
                          >
                            <AlertCircle className="w-4 h-4" />
                          </div>
                          <p
                            className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-1`}
                          >
                            AWAITING
                          </p>
                          <p
                            className={`text-sm font-bold ${isDark ? "text-slate-700" : "text-slate-300"}`}
                          >
                            Client Validation
                          </p>
                          <p
                            className={`text-xs ${isDark ? "text-slate-600" : "text-slate-300"}`}
                          >
                            Tenant yet to confirm
                          </p>
                        </div>,
                      );
                    }

                    return <>{nodes}</>;
                  })()}
              </div>

              <div
                className={`mt-8 pt-6 border-t ${isDark ? "border-[#21262d]" : "border-slate-50"}`}
              >
                <h4
                  className={`text-[10px] font-black ${isDark ? "text-slate-600" : "text-slate-400"} uppercase tracking-widest mb-4 italic`}
                >
                  Internal Trace Log
                </h4>
                <div className="space-y-4">
                  {activities.map((act) => (
                    <div
                      key={act.id}
                      className="flex justify-between items-start gap-4 opacity-75"
                    >
                      <div
                        className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
                      >
                        <p
                          className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-600"} leading-relaxed`}
                        >
                          <span
                            className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                          >
                            {act.user?.full_name || "System"}:
                          </span>{" "}
                          {act.action.replace(/_/g, " ")}
                          {act.new_value && (
                            <span className="text-success font-bold ml-1">
                              → {userNameMap[act.new_value] || act.new_value}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`text-[9px] ${isDark ? "text-slate-600" : "text-slate-400"} font-bold uppercase whitespace-nowrap`}
                      >
                        {new Date(act.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Comments & Chat */}
          <div className="lg:col-span-1 space-y-6">
            <div
              className={`${isDark ? "bg-[#0b141a] border-[#202c33]" : "bg-[#efe7de] border-slate-200"} border rounded-3xl shadow-xl flex flex-col h-[600px] sticky top-24 overflow-hidden`}
              style={isDark ? { backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundBlendMode: 'overlay', backgroundColor: '#0b141a' } : { backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundBlendMode: 'overlay', backgroundColor: '#efe7de' }}
            >
              <div
                className={`p-3 border-b flex items-center justify-between ${isDark ? "bg-[#202c33] border-[#202c33]" : "bg-[#f0f2f5] border-slate-200"}`}
              >
                <div>
                  <h3
                    className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}
                  >
                    Ticket Thread
                  </h3>
                  <p
                    className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}
                  >
                    online
                  </p>
                </div>
                <div className={`p-2 rounded-full ${isDark ? "hover:bg-slate-700" : "hover:bg-slate-200"} cursor-pointer transition-colors text-slate-500`}>
                  <MoreHorizontal className="w-5 h-5" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {comments.length === 0 && (
                  <div className="text-center py-10 opacity-50">
                    <div className={`inline-block px-4 py-1 rounded-lg ${isDark ? "bg-[#182229] text-amber-200/50" : "bg-white text-slate-500"} text-[10px] font-bold uppercase tracking-wider`}>
                      No messages yet
                    </div>
                  </div>
                )}
                {comments.map((comment) => {
                  if (comment.is_internal && userRole === "tenant") return null;
                  const isMe = comment.user_id === userId;
                  
                  // Helper to capitalize names
                  const formatName = (name: string) => {
                    if (!name) return "System";
                    return name.toLowerCase().split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
                  };

                  // WhatsApp Group Chat Name Colors
                  const getParticipantColor = (name: string) => {
                    const colors = [
                      'text-[#ff5252]', 'text-[#2196f3]', 'text-[#4caf50]', 
                      'text-[#ff9800]', 'text-[#9c27b0]', 'text-[#00bcd4]', 
                      'text-[#e91e63]', 'text-[#673ab7]', 'text-[#3f51b5]',
                      'text-[#8bc34a]', 'text-[#ffc107]', 'text-[#ff5722]'
                    ];
                    let hash = 0;
                    for (let i = 0; i < name.length; i++) {
                      hash = name.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    return colors[Math.abs(hash) % colors.length];
                  };

                  // Detect system/material messages
                  const isSystemMessage = 
                    comment.comment.includes("Material requested") || 
                    comment.comment.includes("Material Request Status Updated") ||
                    comment.comment.includes("Ticket Status Updated") ||
                    comment.comment.startsWith("STATUS CHANGE:") ||
                    comment.user?.full_name?.toLowerCase() === "system";

                  if (isSystemMessage) {
                    return (
                      <div key={comment.id} className="w-full flex justify-center py-1">
                        <div className={`px-3 py-1 rounded-lg text-center shadow-sm text-[11px] font-bold uppercase tracking-tighter ${
                          isDark ? "bg-[#182229] text-amber-200/70 border border-white/5" : "bg-white/80 backdrop-blur-sm text-slate-500 border border-slate-200"
                        }`}>
                          {comment.comment}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={comment.id}
                      className={`w-full flex ${isMe ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-300`}
                    >
                      <div
                        className={`relative max-w-[85%] px-3 py-1.5 rounded-[12px] shadow-sm flex flex-col ${
                          isMe
                            ? `bg-[#dcf8c6] dark:bg-[#005c4b] text-slate-800 dark:text-slate-100 rounded-tr-none`
                            : isDark
                              ? "bg-[#202c33] text-slate-200 rounded-tl-none"
                              : "bg-white text-slate-800 rounded-tl-none border border-slate-200/50"
                        }`}
                      >
                        {/* Sender name for group-like chat */}
                        <span className={`text-[11px] font-bold mb-0.5 ${isMe ? (isDark ? "text-emerald-400" : "text-emerald-600") : getParticipantColor(comment.user?.full_name || "Unknown")}`}>
                          {isMe ? "You" : formatName(comment.user?.full_name || "Unknown")}
                        </span>
                        
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                          <p className={`text-[14px] font-medium grow leading-relaxed ${isMe ? "text-slate-900 dark:text-white" : isDark ? "text-slate-100" : "text-slate-900"}`}>
                            {comment.comment}
                          </p>
                          <div className={`text-[9px] font-medium ml-auto flex items-center gap-1 shrink-0 ${isMe ? "text-slate-700 dark:text-slate-300" : "text-slate-500"}`}>
                            {new Date(comment.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {isMe && <span className="text-blue-400">✓✓</span>}
                          </div>
                        </div>

                        {/* WhatsApp Tail */}
                        <div className={`absolute top-0 w-2 h-2 overflow-hidden ${isMe ? "left-full -translate-x-[1px]" : "right-full translate-x-[1px]"}`}>
                          <div className={`w-4 h-4 rotate-45 transform origin-top-left ${isMe ? (isDark ? "bg-[#005c4b]" : "bg-[#dcf8c6]") : (isDark ? "bg-[#202c33]" : "bg-white")}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className={`p-2 flex flex-col gap-2 ${isDark ? "bg-[#202c33]" : "bg-[#f0f2f5]"}`}
              >
                {mentionSearch !== null && procurementUsers.length > 0 && (
                  <div className="absolute bottom-full left-4 mb-2 w-72 bg-white dark:bg-[#161b22] border dark:border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="bg-emerald-500/10 px-4 py-2 border-b dark:border-[#30363d]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        Tag Procurement Team
                      </p>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {procurementUsers
                        .filter(
                          (u) =>
                            mentionSearch === "" ||
                            u.full_name
                              ?.toLowerCase()
                              .includes(mentionSearch) ||
                            u.email?.toLowerCase().includes(mentionSearch),
                        )
                        .slice(0, 5)
                        .map((u) => (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedProcurementId(u.id);
                              setMentionSearch(null);
                              setShowMaterialModal(true);
                              // clear the @ portion
                              const words = commentText.split(" ");
                              words.pop();
                              setCommentText(
                                words.join(" ") + (words.length > 0 ? " " : ""),
                              );
                            }}
                            className="p-3 hover:bg-slate-50 dark:hover:bg-[#21262d] cursor-pointer border-b dark:border-[#30363d] last:border-0 flex items-center gap-3 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs uppercase">
                              {u.full_name?.charAt(0) || u.email?.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-bold dark:text-white text-slate-900">
                                {u.full_name || "Procurement User"}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                {u.email}
                              </div>
                            </div>
                          </div>
                        ))}
                      {procurementUsers.filter(
                        (u) =>
                          mentionSearch === "" ||
                          u.full_name?.toLowerCase().includes(mentionSearch) ||
                          u.email?.toLowerCase().includes(mentionSearch),
                      ).length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-500 italic">
                          No procurement users match search
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 w-full px-2 pb-2 mt-auto">
                  <div className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-1 ${isDark ? "bg-[#2a3942]" : "bg-white"} rounded-[24px] shadow-sm min-h-[48px]`}>
                    <button
                      onClick={() => setShowMaterialModal(true)}
                      className={`p-1.5 transition-all flex-none ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}`}
                      title="Request Materials"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={commentText}
                      onChange={handleCommentChange}
                      onKeyDown={(e) => e.key === "Enter" && handlePostComment()}
                      placeholder="Type a message"
                      className={`flex-1 min-w-0 bg-transparent px-1 py-1 text-[15px] font-medium focus:outline-none placeholder:text-slate-400 ${isDark ? "text-white" : "text-black"}`}
                    />
                  </div>
                  
                  <button
                    onClick={handlePostComment}
                    disabled={!commentText.trim()}
                    className={`w-11 h-11 flex-none rounded-full flex items-center justify-center shadow-lg transition-all ${
                      commentText.trim() 
                        ? "bg-primary text-white" 
                        : "bg-primary opacity-50 text-white cursor-not-allowed"
                    }`}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MODALS */}
        <AnimatePresence>
          {showMaterialModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMaterialModal(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`${isDark ? "bg-[#161b22] border-[#30363d] text-white" : "bg-white border-slate-200 text-slate-900"} border rounded-[2.5rem] w-full max-w-2xl p-8 relative z-10 shadow-2xl overflow-hidden`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h2
                    className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-900"} italic flex items-center gap-3`}
                  >
                    <PackagePlus className="w-6 h-6 text-emerald-500" /> Request
                    Materials
                  </h2>
                  <button
                    onClick={() => setShowMaterialModal(false)}
                    className={`p-2 rounded-xl transition-all ${isDark ? "hover:bg-[#21262d] text-slate-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-900"}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p
                  className={`${isDark ? "text-slate-500" : "text-slate-400"} text-sm mb-6 italic`}
                >
                  Requisition materials from the inventory forces.
                </p>

                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-2 block`}
                    >
                      Assign To Procurement
                    </label>
                    <select
                      value={selectedProcurementId}
                      onChange={(e) => setSelectedProcurementId(e.target.value)}
                      className={`w-full ${isDark ? "bg-[#0d1117] border-[#30363d] text-white" : "bg-slate-50 border-slate-200 text-slate-900"} px-4 py-4 rounded-2xl border-2 focus:border-emerald-500 focus:outline-none transition-all font-bold appearance-none`}
                    >
                      <option value="">-- Select Member --</option>
                      {procurementUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} block`}
                      >
                        Items
                      </label>
                      <button
                        onClick={() =>
                          setMaterialItems([
                            ...materialItems,
                            { name: "", quantity: 1, notes: "" },
                          ])
                        }
                        className="text-xs font-bold text-emerald-500 hover:text-emerald-400"
                      >
                        + Add Item
                      </button>
                    </div>

                    <div className="space-y-3">
                      {materialItems.map((item, idx) => (
                        <div
                          key={idx}
                          className={`p-4 border border-dashed rounded-2xl ${isDark ? "border-[#30363d] bg-[#0d1117]" : "border-slate-200 bg-slate-50"} flex items-start gap-4`}
                        >
                          <div className="flex-1 space-y-3">
                            <input
                              type="text"
                              placeholder="Item Name / Code"
                              value={item.name}
                              onChange={(e) => {
                                const n = [...materialItems];
                                n[idx].name = e.target.value;
                                setMaterialItems(n);
                              }}
                              className={`w-full ${isDark ? "bg-[#161b22] border-[#30363d] text-white" : "bg-white border-slate-200 text-slate-900"} px-4 py-3 rounded-xl border focus:border-emerald-500 focus:outline-none transition-all font-bold text-sm`}
                            />
                            <div className="flex gap-3">
                              <div className="w-24">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Qty"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const n = [...materialItems];
                                    n[idx].quantity =
                                      parseInt(e.target.value) || 1;
                                    setMaterialItems(n);
                                  }}
                                  className={`w-full ${isDark ? "bg-[#161b22] border-[#30363d] text-white" : "bg-white border-slate-200 text-slate-900"} px-4 py-3 rounded-xl border focus:border-emerald-500 focus:outline-none transition-all font-bold text-sm`}
                                />
                              </div>
                              <div className="flex-1">
                                <input
                                  type="text"
                                  placeholder="Notes (Optional)"
                                  value={item.notes}
                                  onChange={(e) => {
                                    const n = [...materialItems];
                                    n[idx].notes = e.target.value;
                                    setMaterialItems(n);
                                  }}
                                  className={`w-full ${isDark ? "bg-[#161b22] border-[#30363d] text-white" : "bg-white border-slate-200 text-slate-900"} px-4 py-3 rounded-xl border focus:border-emerald-500 focus:outline-none transition-all font-medium text-sm`}
                                />
                              </div>
                            </div>
                          </div>
                          {materialItems.length > 1 && (
                            <button
                              onClick={() => {
                                const n = materialItems.filter(
                                  (_, i) => i !== idx,
                                );
                                setMaterialItems(n);
                              }}
                              className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors mt-1"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setShowMaterialModal(false)}
                    className={`flex-1 py-4 ${isDark ? "bg-[#21262d] text-slate-400" : "bg-slate-100 text-slate-500"} rounded-2xl font-black text-xs uppercase tracking-widest hover:text-white transition-all`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitMaterial}
                    disabled={
                      submittingMaterial ||
                      !selectedProcurementId ||
                      materialItems.some((i) => !i.name)
                    }
                    className={`flex-1 py-4 bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20 rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-2`}
                  >
                    {submittingMaterial ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <PackagePlus className="w-4 h-4" />
                    )}
                    Submit Request
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {showAssignModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAssignModal(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`${isDark ? "bg-[#161b22] border-[#30363d] text-white" : "bg-white border-slate-200 text-slate-900"} border rounded-[2.5rem] w-full max-w-md p-8 relative z-10 shadow-2xl`}
              >
                <h2
                  className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-900"} italic mb-2`}
                >
                  Reassign Force
                </h2>
                <p
                  className={`${isDark ? "text-slate-500" : "text-slate-400"} text-sm mb-8 italic`}
                >
                  Redirect signal to another available technician.
                </p>

                <div className="space-y-3 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {resolvers.map((r: any) => (
                    <div
                      key={r.user_id}
                      onClick={() => setSelectedResolver(r.user_id)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedResolver === r.user_id ? "bg-primary/10 border-primary text-white" : isDark ? "bg-[#0d1117] border-[#30363d] text-slate-400 hover:border-slate-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {r.user?.full_name || "Unknown Technician"}
                        </span>
                        {selectedResolver === r.user_id && (
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                  {resolvers.length === 0 && (
                    <p
                      className={`text-center py-4 text-xs ${isDark ? "text-slate-600" : "text-slate-400"} italic`}
                    >
                      No available technicians detected in vicinity.
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className={`flex-1 py-4 ${isDark ? "bg-[#21262d] text-slate-400" : "bg-slate-100 text-slate-500"} rounded-2xl font-black text-xs uppercase tracking-widest hover:text-white transition-all`}
                  >
                    Abort
                  </button>
                  <button
                    onClick={handleReassign}
                    disabled={!selectedResolver}
                    className={`flex-1 py-4 ${isDark ? "bg-white text-black hover:bg-slate-200" : "bg-primary text-white hover:bg-primary-dark shadow-primary/20"} rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 shadow-xl`}
                  >
                    Execute Transfer
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {isEditing && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsEditing(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`${isDark ? "bg-[#161b22] border-[#30363d] text-white" : "bg-white border-slate-200 text-slate-900"} border rounded-[2.5rem] w-full max-w-lg p-8 relative z-10 shadow-2xl overflow-hidden`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h2
                    className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-900"} italic`}
                  >
                    Edit Request
                  </h2>
                  <button
                    onClick={() => setIsEditing(false)}
                    className={`p-2 rounded-xl transition-all ${isDark ? "hover:bg-[#21262d] text-slate-500 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-900"}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p
                  className={`${isDark ? "text-slate-500" : "text-slate-400"} text-sm mb-8 italic`}
                >
                  Modify the transmission data for this ticket.
                </p>

                <div className="space-y-6 mb-8">
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-2 block`}
                    >
                      Mission Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Mission name..."
                      className={`w-full ${isDark ? "bg-[#0d1117] border-[#30363d] text-white" : "bg-slate-50 border-slate-200 text-slate-900"} px-4 py-4 rounded-2xl border-2 focus:border-primary focus:outline-none transition-all font-bold`}
                    />
                  </div>
                  <div>
                    <label
                      className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"} mb-2 block`}
                    >
                      Detailed Intelligence
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Intelligence briefing..."
                      rows={5}
                      className={`w-full ${isDark ? "bg-[#0d1117] border-[#30363d] text-white" : "bg-slate-50 border-slate-200 text-slate-900"} px-4 py-4 rounded-2xl border-2 focus:border-primary focus:outline-none transition-all font-medium resize-none`}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditing(false)}
                    className={`flex-1 py-4 ${isDark ? "bg-[#21262d] text-slate-400" : "bg-slate-100 text-slate-500"} rounded-2xl font-black text-xs uppercase tracking-widest hover:text-white transition-all`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    disabled={isUpdatingContent || !editTitle.trim()}
                    className={`flex-1 py-4 ${isDark ? "bg-white text-black hover:bg-slate-200" : "bg-primary text-white hover:bg-primary-dark shadow-primary/20"} rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-2`}
                  >
                    {isUpdatingContent ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {isUpdatingContent ? "Updating..." : "Save Intel"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Camera Modal */}
        <MediaCaptureModal
          isOpen={showCameraModal}
          onClose={() => {
            setShowCameraModal(false);
            setActiveCameraType(null);
          }}
          onCapture={handleMediaCapture}
          title={
            activeCameraType === "before"
              ? "Capture Before Site"
              : "Capture After Site"
          }
        />

        <VideoPreviewModal
          isOpen={!!previewVideoUrl}
          onClose={() => {
            setPreviewVideoUrl(null);
            setPreviewVideoTitle("");
          }}
          videoUrl={previewVideoUrl}
          title={previewVideoTitle}
        />

        {/* Press & Hold Peek — Instagram style */}
        <AnimatePresence>
          {peekUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 backdrop-blur-md"
              style={{ pointerEvents: "none" }}
            >
              <motion.img
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                src={peekUrl}
                alt="Peek"
                className="max-w-[85vw] max-h-[85vh] rounded-3xl shadow-2xl object-contain ring-4 ring-white/20"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Lightbox */}
        <AnimatePresence>
          {lightboxUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
              onClick={() => setLightboxUrl(null)}
            >
              <motion.img
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                src={lightboxUrl}
                alt="Full view"
                className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => setLightboxUrl(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rejection Note Modal */}
        <AnimatePresence>
          {showRejectModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowRejectModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`${isDark ? "bg-[#161b22] border-[#30363d]" : "bg-white border-slate-200"} rounded-2xl shadow-2xl w-full max-w-md border p-6 space-y-4`}
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                >
                  Why wasn't this resolved?
                </h2>
                <p
                  className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}
                >
                  Optional — let the team know what still needs to be done.
                </p>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Describe what's still missing or incorrect..."
                  className={`w-full h-28 px-4 py-3 ${isDark ? "bg-[#0d1117] border-[#30363d] text-white placeholder-slate-500" : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400"} border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-400 transition-all text-sm`}
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowRejectModal(false)}
                    className={`px-4 py-2 ${isDark ? "text-slate-400 hover:bg-[#21262d]" : "text-slate-600 hover:bg-slate-100"} font-semibold rounded-xl transition-colors text-sm`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleValidate(false, rejectNote || undefined);
                      setShowRejectModal(false);
                    }}
                    className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors text-sm"
                  >
                    Reopen Request
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        ticketId={typeof ticketId === "string" ? ticketId : ""}
        ticketNumber={ticket.ticket_number}
        title={ticket.title}
      />
    </div>
  );
}
